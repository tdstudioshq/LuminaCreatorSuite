// ============================================================================
// CABANA — protected admin finance server actions (Phase 8C.1, READ-ONLY)
// ----------------------------------------------------------------------------
// The read side of the admin finance back office. Every handler runs under the
// caller's RLS (`attachSupabaseToken` + `requireSupabaseAuth`) and reuses the
// EXISTING Phase 6 admin read policies (`is_current_user_admin`) on
// `transactions` / `payouts` / `creator_balances` — so an admin reads all
// creators, while a non-admin caller is RLS-limited to their own rows (no leak)
// and the route gates admin-only on top. No new tables, RPCs, or writes: this
// slice is purely additive read surface over the immutable ledger. DEMO-ONLY.
//
// Aggregation / filtering / CSV all live in the pure `cabana-finance` module;
// these handlers only fetch + map rows. Must NOT live under any `**/server/**`
// path (compiles to a client RPC bridge).
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AdminPayout, AdminTransaction, CreatorEarning } from "@/lib/cabana-finance";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID.test(raw)) throw new Error(`A valid ${label} is required.`);
  return raw.toLowerCase();
}

function clampLimit(raw: unknown, fallback = 500): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), 1), 1000);
}

// The embedded creator_profiles projection may come back as an object (to-one)
// or, defensively, a single-element array; normalize either to {handle, name}.
type EmbeddedCreator = { handle: string | null; display_name: string | null };

function creatorOf(embed: unknown): { handle: string | null; displayName: string | null } {
  const row = (Array.isArray(embed) ? embed[0] : embed) as EmbeddedCreator | null | undefined;
  return { handle: row?.handle ?? null, displayName: row?.display_name ?? null };
}

const TXN_SELECT =
  "id, type, status, gross_cents, platform_fee_cents, processor_fee_cents, creator_net_cents, currency, reference_type, reference_id, payer_user_id, creator_profile_id, mock_provider_reference, created_at, creator_profiles(handle, display_name)";

function mapTransaction(r: Record<string, unknown>): AdminTransaction {
  const creator = creatorOf(r.creator_profiles);
  return {
    id: r.id as string,
    type: r.type as AdminTransaction["type"],
    status: r.status as AdminTransaction["status"],
    grossCents: r.gross_cents as number,
    platformFeeCents: r.platform_fee_cents as number,
    processorFeeCents: r.processor_fee_cents as number,
    creatorNetCents: r.creator_net_cents as number,
    currency: r.currency as string,
    referenceType: (r.reference_type as string | null) ?? null,
    referenceId: (r.reference_id as string | null) ?? null,
    payerUserId: (r.payer_user_id as string | null) ?? null,
    creatorProfileId: (r.creator_profile_id as string | null) ?? null,
    creatorHandle: creator.handle,
    creatorDisplayName: creator.displayName,
    mockProviderReference: (r.mock_provider_reference as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

// ─────────────────────────────── Reads ──────────────────────────────────────

/** All ledger transactions (admin RLS), newest first. Filtering happens client-side. */
export const getAdminTransactions = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { limit?: unknown } | undefined) => ({ limit: clampLimit(raw?.limit) }))
  .handler(async ({ context, data }): Promise<AdminTransaction[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("transactions")
      .select(TXN_SELECT)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => mapTransaction(r as Record<string, unknown>));
  });

/** A single transaction (admin RLS). Null when not visible / not found. */
export const getAdminTransactionDetail = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { transactionId?: unknown }) => ({
    transactionId: uuid(raw?.transactionId, "transaction id"),
  }))
  .handler(async ({ context, data }): Promise<AdminTransaction | null> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("transactions")
      .select(TXN_SELECT)
      .eq("id", data.transactionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? mapTransaction(row as Record<string, unknown>) : null;
  });

/** All payouts (admin RLS), newest first. */
export const getAdminPayouts = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminPayout[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("payouts")
      .select(
        "id, creator_profile_id, amount_cents, currency, status, requested_at, paid_at, failure_reason, created_at, creator_profiles(handle, display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const creator = creatorOf(row.creator_profiles);
      return {
        id: row.id as string,
        creatorProfileId: row.creator_profile_id as string,
        creatorHandle: creator.handle,
        creatorDisplayName: creator.displayName,
        amountCents: row.amount_cents as number,
        currency: row.currency as string,
        status: row.status as AdminPayout["status"],
        requestedAt: row.requested_at as string,
        paidAt: (row.paid_at as string | null) ?? null,
        failureReason: (row.failure_reason as string | null) ?? null,
        createdAt: row.created_at as string,
      };
    });
  });

/** All creator balance projections (admin RLS) for the earnings rollup. */
export const getAdminCreatorEarnings = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorEarning[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("creator_balances")
      .select(
        "creator_profile_id, currency, pending_cents, available_cents, lifetime_gross_cents, lifetime_fees_cents, lifetime_net_cents, lifetime_paid_out_cents, creator_profiles(handle, display_name)",
      )
      .limit(1000);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const creator = creatorOf(row.creator_profiles);
      return {
        creatorProfileId: row.creator_profile_id as string,
        creatorHandle: creator.handle,
        creatorDisplayName: creator.displayName,
        currency: row.currency as string,
        pendingCents: row.pending_cents as number,
        availableCents: row.available_cents as number,
        lifetimeGrossCents: row.lifetime_gross_cents as number,
        lifetimeFeesCents: row.lifetime_fees_cents as number,
        lifetimeNetCents: row.lifetime_net_cents as number,
        lifetimePaidOutCents: row.lifetime_paid_out_cents as number,
      };
    });
  });
