// ============================================================================
// CABANA — Stream orphan reconciliation (admin-only server actions)
// ----------------------------------------------------------------------------
// The backstop the upload layer has always claimed to have. `use-stream-upload`
// and the ticket-race path both name "the server-side orphan sweep" as their
// terminal cleanup route; until now nothing called `selectOrphanCandidates`, so
// that backstop did not exist and abandoned Cloudflare assets lived forever.
//
// WHY A SERVER ACTION AND NOT A SECURITY DEFINER RPC:
// The sweep's whole side effect is an outbound HTTPS DELETE to Cloudflare, and
// Postgres here has no HTTP transport (no pg_net, no http extension anywhere in
// the migration chain). `process_notification_outbox` is the closest precedent
// and proves the point: it SIMULATES its delivery outcome via a `_result`
// parameter precisely because plpgsql cannot make the call. An RPC could only
// select candidates and mark intent; the Cloudflare call would still happen in
// TypeScript, so the RPC would add a round-trip and split one decision across
// two places.
//
// TRUST MODEL — the two halves are deliberate:
//   * AUTHORITY comes from the caller: `assertAdmin` reads the caller's own
//     `user_roles` row under their own RLS. Never an email, never a client flag.
//   * The WORK uses the service role, because `stream_videos` has an owner-only
//     SELECT policy by design — an admin cannot see other creators' rows under
//     their own RLS, so a caller-scoped sweep would silently only ever clean the
//     admin's own uploads. Same shape as `getPostMediaUrls`: authorize under the
//     caller's context, then act with the service role.
//
// SAFETY BOUNDARY — what this can and cannot delete:
// It NEVER enumerates the Cloudflare account. Candidates come only from
// `stream_videos` rows, i.e. assets CABANA provably created through its own
// ticket flow. An asset we have no row for is invisible to this sweep and stays
// untouched — that is the intended trade: we would rather leak an unknown asset
// than delete something we cannot prove is ours.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import {
  type OrphanCandidateRow,
  type OrphanGracePeriods,
  type OrphanReason,
  DEFAULT_ORPHAN_GRACE,
  selectOrphanCandidates,
} from "@/lib/cabana-stream";

type Db = SupabaseClient<Database>;

/** Hard ceiling per run, whatever the caller asks for. */
export const SWEEP_MAX_ROWS = 200;
export const SWEEP_DEFAULT_ROWS = 50;

export type SweepCandidate = { streamVideoId: string; reason: OrphanReason; createdAt: string };

export type SweepReport = {
  dryRun: boolean;
  /** Rows examined (bounded by the row cap), not rows deleted. */
  scanned: number;
  candidates: SweepCandidate[];
  reclaimed: number;
  failed: number;
  skipped: number;
};

/** A row plus the uid the reclaim needs — the uid never leaves the server. */
type SweepRow = OrphanCandidateRow & { uid: string };

export type SweepDeps = {
  assertAdmin: () => Promise<void>;
  /** Oldest-first page of videos, already annotated with `attached`. */
  fetchRows: (limit: number) => Promise<SweepRow[]>;
  reclaim: (
    targets: { id: string; uid: string }[],
  ) => Promise<{ reclaimed: number; failed: number; skipped: number }>;
  nowMs: () => number;
  grace?: OrphanGracePeriods;
};

/** Clamp the row budget into [1, SWEEP_MAX_ROWS]; anything unparseable → default. */
export function normalizeSweepLimit(raw: unknown): number {
  if (raw == null) return SWEEP_DEFAULT_ROWS;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return SWEEP_DEFAULT_ROWS;
  return Math.min(SWEEP_MAX_ROWS, Math.max(1, Math.trunc(n)));
}

/**
 * One bounded sweep pass.
 *
 * Dry run is the default at every call site and reports exactly what a real run
 * would destroy, having taken the same decision through the same pure selector —
 * so the report is evidence about this run, not a separate estimate.
 *
 * Idempotent: a reclaimed row is gone, so a repeat pass simply finds fewer
 * candidates. A row whose Cloudflare delete failed stays a candidate and is
 * retried next pass, which is the retry mechanism — no attempt counter needed,
 * because a permanently failing row keeps surfacing in the report rather than
 * disappearing into a dead-letter state nobody reads.
 */
export async function executeSweepFlow(
  deps: SweepDeps,
  input: { dryRun: boolean; limit: number },
): Promise<SweepReport> {
  await deps.assertAdmin();

  const rows = await deps.fetchRows(input.limit);
  const selected = selectOrphanCandidates(rows, deps.nowMs(), deps.grace ?? DEFAULT_ORPHAN_GRACE);
  const candidates: SweepCandidate[] = selected.map(({ row, reason }) => ({
    streamVideoId: row.id,
    reason,
    createdAt: row.createdAt,
  }));

  if (input.dryRun || candidates.length === 0) {
    return {
      dryRun: input.dryRun,
      scanned: rows.length,
      candidates,
      reclaimed: 0,
      failed: 0,
      skipped: 0,
    };
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const targets = selected.map(({ row }) => ({ id: row.id, uid: byId.get(row.id)!.uid }));
  const summary = await deps.reclaim(targets);

  return {
    dryRun: false,
    scanned: rows.length,
    candidates,
    reclaimed: summary.reclaimed,
    failed: summary.failed,
    skipped: summary.skipped,
  };
}

async function assertAdmin(supabase: Db, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("You are not authorized to perform this action.");
}

/**
 * Oldest-first page of videos annotated with whether any post still references
 * them. Two queries rather than a PostgREST embed: the post_media→stream_videos
 * FK is composite, which embedding handles poorly, and an attachment miss here
 * would mean deleting a live post's video.
 */
async function fetchSweepRows(limit: number): Promise<SweepRow[]> {
  const { data: videos, error } = await supabaseAdmin
    .from("stream_videos")
    .select("id, uid, status, created_at, upload_expires_at")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = videos ?? [];
  if (rows.length === 0) return [];

  const { data: attachedRows, error: attachedError } = await supabaseAdmin
    .from("post_media")
    .select("stream_video_id")
    .in(
      "stream_video_id",
      rows.map((r) => r.id),
    );
  if (attachedError) throw new Error(attachedError.message);
  const attached = new Set((attachedRows ?? []).map((m) => m.stream_video_id));

  return rows.map((r) => ({
    id: r.id,
    uid: r.uid,
    status: r.status,
    createdAt: r.created_at,
    uploadExpiresAt: r.upload_expires_at,
    attached: attached.has(r.id),
  }));
}

function sweepDeps(supabase: Db, userId: string): SweepDeps {
  return {
    assertAdmin: () => assertAdmin(supabase, userId),
    fetchRows: fetchSweepRows,
    reclaim: async (targets) => {
      // Dynamic: this file compiles to a client-importable RPC bridge and the
      // reclaim module reaches the Cloudflare API secrets.
      const { reclaimStreamVideos } = await import("@/lib/stream-reclaim.server");
      return reclaimStreamVideos(supabaseAdmin as Db, targets);
    },
    nowMs: Date.now,
  };
}

/**
 * Report what a sweep WOULD reclaim. Read-only — destroys nothing.
 * This is the intended entry point; run it before ever calling the real sweep.
 */
export const getStreamOrphanReport = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { limit?: unknown }) => ({ limit: normalizeSweepLimit(raw?.limit) }))
  .handler(async ({ context, data }): Promise<SweepReport> => {
    const { supabase, userId } = context;
    return executeSweepFlow(sweepDeps(supabase as Db, userId), {
      dryRun: true,
      limit: data.limit,
    });
  });

/**
 * Actually reclaim. `dryRun` defaults to TRUE — a caller that forgets the flag
 * gets a report, never a deletion.
 */
export const sweepStreamOrphans = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { limit?: unknown; dryRun?: unknown }) => ({
    limit: normalizeSweepLimit(raw?.limit),
    dryRun: raw?.dryRun !== false,
  }))
  .handler(async ({ context, data }): Promise<SweepReport> => {
    const { supabase, userId } = context;
    return executeSweepFlow(sweepDeps(supabase as Db, userId), {
      dryRun: data.dryRun,
      limit: data.limit,
    });
  });
