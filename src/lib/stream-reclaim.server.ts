// ============================================================================
// CABANA — Stream asset reclamation (server-only)
// ----------------------------------------------------------------------------
// Reclaiming a Stream video means two destructive steps that must happen in a
// specific order and must never half-succeed silently:
//
//   1. delete the Cloudflare asset  (the thing that costs money and can leak)
//   2. delete the `stream_videos` row (the local record that tracks it)
//
// Cloudflare goes FIRST and the row is deleted ONLY on confirmed remote success.
// A row whose remote delete failed is deliberately LEFT BEHIND: it is the only
// durable record that an asset still exists out there, so keeping it is what
// makes a later retry (the orphan sweep) possible. Deleting the row first would
// strand the asset permanently with nothing pointing at it.
//
// Every operation here is best-effort by CONTRACT: callers are user-facing paths
// (deletePost) and a batch job (the sweep). Neither may fail because Cloudflare
// is unreachable — they record the outcome and move on. A `not_found` from
// Cloudflare counts as success: the asset is gone, which is the goal, and it
// makes repeated reclamation idempotent.
//
// This module carries the `.server.ts` suffix because it reaches the Cloudflare
// repository (which reads API secrets). Client-importable RPC bridges must
// import it DYNAMICALLY inside a handler — see `deletePost` in post-actions.ts.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createCloudflareStreamRepository } from "@/lib/stream-cloudflare.server";

/** A video to reclaim: the local row id plus the Cloudflare asset it points at. */
export type ReclaimTarget = { id: string; uid: string };

export type ReclaimOutcome = {
  id: string;
  uid: string;
  /**
   * `reclaimed` — remote gone (deleted or already absent) AND row deleted.
   * `remote_failed` — Cloudflare refused/unreachable; row KEPT for retry.
   * `row_failed` — remote gone but the row delete failed; row may be retried
   *   (the repeat CF delete will report not_found, which is success).
   * `still_attached` — refused: something references it. Never destructive.
   */
  result: "reclaimed" | "remote_failed" | "row_failed" | "still_attached";
};

export type ReclaimSummary = {
  reclaimed: number;
  failed: number;
  skipped: number;
  outcomes: ReclaimOutcome[];
};

export type ReclaimDeps = {
  /** True when any `post_media` row still references this video. */
  isAttached: (id: string) => Promise<boolean>;
  /** Idempotent: `not_found` means the asset is already gone → success. */
  deleteCfVideo: (uid: string) => Promise<"deleted" | "not_found">;
  deleteRow: (id: string) => Promise<void>;
};

/**
 * Reclaim a batch, one video at a time, never throwing.
 *
 * The attachment re-check immediately before the destructive call is the whole
 * safety story: an attached video belongs to a live post, and removing it must
 * be an explicit user decision (deletePostMedia / deletePost), never a
 * background sweep's side effect. Checking here rather than trusting the
 * caller's candidate list closes the window between selection and action.
 */
export async function executeReclaimFlow(
  deps: ReclaimDeps,
  targets: readonly ReclaimTarget[],
): Promise<ReclaimSummary> {
  const outcomes: ReclaimOutcome[] = [];

  for (const target of targets) {
    let result: ReclaimOutcome["result"];
    try {
      if (await deps.isAttached(target.id)) {
        result = "still_attached";
      } else {
        await deps.deleteCfVideo(target.uid);
        try {
          await deps.deleteRow(target.id);
          result = "reclaimed";
        } catch {
          result = "row_failed";
        }
      }
    } catch {
      // Cloudflare unreachable or refused → keep the row so this is retryable.
      result = "remote_failed";
    }
    outcomes.push({ id: target.id, uid: target.uid, result });
  }

  return {
    reclaimed: outcomes.filter((o) => o.result === "reclaimed").length,
    failed: outcomes.filter((o) => o.result === "remote_failed" || o.result === "row_failed")
      .length,
    skipped: outcomes.filter((o) => o.result === "still_attached").length,
    outcomes,
  };
}

/**
 * Wire the real Cloudflare repository + a Supabase client into the flow.
 *
 * The client is the CALLER's: pass an RLS-scoped client from a user path (an
 * owner can only ever see and delete their own rows, so ownership is enforced by
 * RLS rather than re-checked here) or the service-role client from the sweep.
 */
export async function reclaimStreamVideos(
  supabase: SupabaseClient<Database>,
  targets: readonly ReclaimTarget[],
): Promise<ReclaimSummary> {
  if (targets.length === 0) {
    return { reclaimed: 0, failed: 0, skipped: 0, outcomes: [] };
  }
  const cf = createCloudflareStreamRepository();
  return executeReclaimFlow(
    {
      isAttached: async (id) => {
        const { data, error } = await supabase
          .from("post_media")
          .select("id")
          .eq("stream_video_id", id)
          .limit(1);
        if (error) throw new Error(error.message);
        return (data ?? []).length > 0;
      },
      deleteCfVideo: (uid) => cf.deleteVideo(uid),
      deleteRow: async (id) => {
        const { error } = await supabase.from("stream_videos").delete().eq("id", id);
        if (error) throw new Error(error.message);
      },
    },
    targets,
  );
}
