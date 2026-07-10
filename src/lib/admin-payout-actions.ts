// ============================================================================
// CABANA — protected admin payout server actions (Phase 8C.2)
// ----------------------------------------------------------------------------
// The administrative payout workflow surface. The read (queue) runs under the
// existing Phase 6 admin RLS on `payout_requests` / `payouts`; the single write
// (`reviewPayout`) calls the SECURITY DEFINER `admin_review_payout` RPC, which
// is admin-gated, transition-validated (mirrors the pure `cabana-payouts` state
// machine), settles the linked disbursement, recomputes the balance, and lets
// the DB trigger append the immutable audit row. No service role; must NOT live
// under any `**/server/**` path. DEMO-ONLY — no real money moves.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type AdminPayoutRequest, type PayoutAction, PAYOUT_ACTIONS } from "@/lib/cabana-payouts";

// Structural UUID check: 8-4-4-4-12 hex, RFC-4122 version (1-5) + variant
// ([89ab]) nibbles. Validation stays strict on purpose — demo/seed payout ids
// are synthetic but RFC-4122-v4-valid (see supabase/seed.sql), so mock data
// conforms to the format rather than the validator bending to accept it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID.test(raw)) throw new Error(`A valid ${label} is required.`);
  return raw.toLowerCase();
}

function payoutAction(raw: unknown): PayoutAction {
  if (typeof raw !== "string" || !PAYOUT_ACTIONS.includes(raw as PayoutAction)) {
    throw new Error("A valid payout action is required.");
  }
  return raw as PayoutAction;
}

function optionalNote(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "string") throw new Error("Expected text.");
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (trimmed.length > 500) throw new Error("Note must be 500 characters or fewer.");
  return trimmed;
}

// The embedded creator + payout projections may be an object or single-row array.
function first<T>(embed: unknown): T | null {
  if (Array.isArray(embed)) return (embed[0] as T) ?? null;
  return (embed as T | null) ?? null;
}

// creator_profiles TABLE column is `name` (`display_name` only exists on the
// public_creator_profiles VIEW, which can't be embedded here).
type EmbeddedCreator = { handle: string | null; name: string | null };
type EmbeddedPayout = {
  status: AdminPayoutRequest["payoutStatus"];
  paid_at: string | null;
  failure_reason: string | null;
};

function mapRequest(r: Record<string, unknown>): AdminPayoutRequest {
  const creator = first<EmbeddedCreator>(r.creator_profiles);
  const payout = first<EmbeddedPayout>(r.payouts);
  return {
    id: r.id as string,
    creatorProfileId: r.creator_profile_id as string,
    creatorHandle: creator?.handle ?? null,
    creatorDisplayName: creator?.name ?? null,
    amountCents: r.amount_cents as number,
    currency: r.currency as string,
    status: r.status as AdminPayoutRequest["status"],
    note: (r.note as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    payoutStatus: payout?.status ?? null,
    paidAt: payout?.paid_at ?? null,
    failureReason: payout?.failure_reason ?? null,
  };
}

// ─────────────────────────────── Read ───────────────────────────────────────

/** All payout requests (admin RLS), with creator + linked payout, newest first. */
export const getAdminPayoutRequests = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminPayoutRequest[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("payout_requests")
      .select(
        "id, creator_profile_id, amount_cents, currency, status, note, decided_at, created_at, updated_at, creator_profiles(handle, name), payouts(status, paid_at, failure_reason)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => mapRequest(r as Record<string, unknown>));
  });

// ─────────────────────────────── Write ──────────────────────────────────────

/**
 * Apply an admin decision to a payout request. Transition validity + the linked
 * disbursement + the balance recompute + the audit row are all enforced
 * server-side by the `admin_review_payout` RPC (admin-only).
 */
export const reviewPayout = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { payoutRequestId?: unknown; action?: unknown; note?: unknown }) => ({
    payoutRequestId: uuid(raw?.payoutRequestId, "payout request id"),
    action: payoutAction(raw?.action),
    note: optionalNote(raw?.note),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { error } = await supabase.rpc("admin_review_payout", {
      _payout_request_id: data.payoutRequestId,
      _action: data.action,
      _note: data.note,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
