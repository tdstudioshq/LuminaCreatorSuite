// ============================================================================
// CABANA — protected monetization server actions (Phase 6, DEMO-ONLY)
// ----------------------------------------------------------------------------
// The internal financial ledger surface: (mock) purchases & tips, payout
// requests, and creator-scoped reads of balance / transactions / payouts / tips
// / sales / entitlements. There is NO payment processor — every write goes
// through a SECURITY DEFINER RPC that records integer-cent amounts with a
// `mock_*` reference and refreshes the cached creator balance. No real money
// moves anywhere in this file.
//
// Writes use `attachSupabaseToken` + `requireSupabaseAuth`, so handlers run
// under the caller's RLS, never the service role. Reads are creator-scoped
// (balance/transactions/payouts/tips/sales) or caller-scoped (entitlements).
//
// These compile to a client RPC bridge — this file must NOT live under any
// `**/server/**` path.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID.test(raw)) throw new Error(`A valid ${label} is required.`);
  return raw.toLowerCase();
}

function handle(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "")
    throw new Error("Creator username is required.");
  return raw.trim().toLowerCase();
}

function amountCents(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new Error("Amount must be a whole number of cents above zero.");
  }
  return raw;
}

function optionalText(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") throw new Error("Expected text.");
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > max) throw new Error(`Must be ${max} characters or fewer.`);
  return trimmed;
}

async function requireCreatorProfileId(supabase: Db, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only creators have earnings.");
  return data.id;
}

// ─────────────────────────────── DTOs ───────────────────────────────────────

export type BalanceSummary = {
  currency: string;
  pendingCents: number;
  availableCents: number;
  lifetimeGrossCents: number;
  lifetimeFeesCents: number;
  lifetimeNetCents: number;
  lifetimePaidOutCents: number;
};

export type TransactionRecord = {
  id: string;
  type: Database["public"]["Enums"]["transaction_type"];
  status: Database["public"]["Enums"]["transaction_status"];
  grossCents: number;
  platformFeeCents: number;
  processorFeeCents: number;
  creatorNetCents: number;
  currency: string;
  referenceType: string | null;
  createdAt: string;
};

export type PayoutRecord = {
  id: string;
  amountCents: number;
  currency: string;
  status: Database["public"]["Enums"]["payout_status"];
  requestedAt: string;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
};

export type TipRecord = {
  id: string;
  amountCents: number;
  currency: string;
  message: string | null;
  status: string;
  createdAt: string;
};

export type PurchaseRecord = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  postId: string | null;
  createdAt: string;
};

export type EntitlementRecord = {
  id: string;
  postId: string;
  source: string;
  createdAt: string;
};

function emptyBalance(): BalanceSummary {
  return {
    currency: "USD",
    pendingCents: 0,
    availableCents: 0,
    lifetimeGrossCents: 0,
    lifetimeFeesCents: 0,
    lifetimeNetCents: 0,
    lifetimePaidOutCents: 0,
  };
}

async function readBalance(supabase: Db): Promise<BalanceSummary> {
  const { data, error } = await supabase.rpc("creator_balance");
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return emptyBalance();
  return {
    currency: row.currency,
    pendingCents: row.pending_cents,
    availableCents: row.available_cents,
    lifetimeGrossCents: row.lifetime_gross_cents,
    lifetimeFeesCents: row.lifetime_fees_cents,
    lifetimeNetCents: row.lifetime_net_cents,
    lifetimePaidOutCents: row.lifetime_paid_out_cents,
  };
}

// ─────────────────────────────── Writes (mock) ──────────────────────────────

/** Buy permanent access to a `purchase` post (mock — no real charge). */
export const createMockPurchase = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({ postId: uuid(raw?.postId, "post id") }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { error } = await supabase.rpc("create_mock_purchase", { _post_id: data.postId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Send a (mock) tip to a creator. */
export const createMockTip = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { username?: unknown; amountCents?: unknown; message?: unknown }) => ({
    username: handle(raw?.username),
    amountCents: amountCents(raw?.amountCents),
    message: optionalText(raw?.message, 500),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { error } = await supabase.rpc("create_mock_tip", {
      _username: data.username,
      _amount_cents: data.amountCents,
      _message: data.message ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Request a (mock) payout of available balance; returns the refreshed balance. */
export const requestPayout = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { amountCents?: unknown; note?: unknown }) => ({
    amountCents: amountCents(raw?.amountCents),
    note: optionalText(raw?.note, 500),
  }))
  .handler(async ({ context, data }): Promise<BalanceSummary> => {
    const { supabase } = context;
    const { error } = await supabase.rpc("request_payout", {
      _amount_cents: data.amountCents,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return readBalance(supabase as Db);
  });

// ─────────────────────────────── Reads ──────────────────────────────────────

/** The calling creator's cached balance (recomputed on read). */
export const getCreatorBalance = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<BalanceSummary> => {
    return readBalance(context.supabase as Db);
  });

/** The calling creator's ledger transactions (money received), newest first. */
export const getTransactions = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<TransactionRecord[]> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id, type, status, gross_cents, platform_fee_cents, processor_fee_cents, creator_net_cents, currency, reference_type, created_at",
      )
      .eq("creator_profile_id", creatorProfileId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      grossCents: r.gross_cents,
      platformFeeCents: r.platform_fee_cents,
      processorFeeCents: r.processor_fee_cents,
      creatorNetCents: r.creator_net_cents,
      currency: r.currency,
      referenceType: r.reference_type,
      createdAt: r.created_at,
    }));
  });

/** The calling creator's (mock) payout history, newest first. */
export const getPayoutHistory = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayoutRecord[]> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    const { data, error } = await supabase
      .from("payouts")
      .select(
        "id, amount_cents, currency, status, requested_at, paid_at, failure_reason, created_at",
      )
      .eq("creator_profile_id", creatorProfileId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      amountCents: r.amount_cents,
      currency: r.currency,
      status: r.status,
      requestedAt: r.requested_at,
      paidAt: r.paid_at,
      failureReason: r.failure_reason,
      createdAt: r.created_at,
    }));
  });

/** Tips received by the calling creator, newest first. */
export const getTips = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<TipRecord[]> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    const { data, error } = await supabase
      .from("tips")
      .select("id, amount_cents, currency, message, status, created_at")
      .eq("creator_profile_id", creatorProfileId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      amountCents: r.amount_cents,
      currency: r.currency,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
    }));
  });

/** Sales (purchases of the calling creator's content), newest first. */
export const getPurchases = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PurchaseRecord[]> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    const { data, error } = await supabase
      .from("purchases")
      .select("id, amount_cents, currency, status, post_id, created_at")
      .eq("creator_profile_id", creatorProfileId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      amountCents: r.amount_cents,
      currency: r.currency,
      status: r.status,
      postId: r.post_id,
      createdAt: r.created_at,
    }));
  });

/** The caller's own permanent content entitlements (posts they have unlocked). */
export const getEntitlements = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<EntitlementRecord[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("content_entitlements")
      .select("id, post_id, source, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      postId: r.post_id,
      source: r.source,
      createdAt: r.created_at,
    }));
  });
