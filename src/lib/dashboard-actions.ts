// ============================================================================
// CABANA — creator dashboard server action (Phase 11A)
// ----------------------------------------------------------------------------
// A single RLS-scoped read that gathers the creator's own balance, ledger
// transactions, payouts, subscriber rows, recent subscriber identities, and
// notifications, then returns the raw bundle the pure `cabana-dashboard`
// aggregator turns into the dashboard view. The handler stays thin: it only
// fetches rows the caller already owns (no service role) and shapes them into
// the pure module's structural inputs. All aggregation/derivation lives in the
// unit-tested pure layer.
//
// Reuses the existing Phase 4/6/7 surfaces: the `creator_balance` RPC (balance
// is derived there, not here), the creator-owned `transactions`/`payouts`
// tables, the `creator_subscriptions` table + `creator_subscribers_list` RPC,
// and the `notifications` table (via the shared `mapNotification`).
//
// This compiles to a client RPC bridge — it must NOT live under any
// `**/server/**` path.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { mapNotification } from "@/lib/cabana-notifications";
import type {
  CreatorDashboardData,
  DashboardPayout,
  DashboardRecentSubscriber,
  DashboardSubscriberRow,
  DashboardTransaction,
} from "@/lib/cabana-dashboard";
import type { CreatorBalanceProjection } from "@/lib/cabana-money";

type Db = SupabaseClient<Database>;

async function findCreatorProfileId(supabase: Db, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

function emptyBalance(): CreatorBalanceProjection {
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

async function readBalance(supabase: Db): Promise<CreatorBalanceProjection> {
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

async function readTransactions(
  supabase: Db,
  creatorProfileId: string,
): Promise<DashboardTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, status, gross_cents, creator_net_cents, currency, created_at")
    .eq("creator_profile_id", creatorProfileId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    grossCents: r.gross_cents,
    creatorNetCents: r.creator_net_cents,
    currency: r.currency,
    createdAt: r.created_at,
  }));
}

async function readPayouts(supabase: Db, creatorProfileId: string): Promise<DashboardPayout[]> {
  const { data, error } = await supabase
    .from("payouts")
    .select("id, amount_cents, currency, status, created_at")
    .eq("creator_profile_id", creatorProfileId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    createdAt: r.created_at,
  }));
}

async function readSubscriberRows(
  supabase: Db,
  creatorProfileId: string,
): Promise<DashboardSubscriberRow[]> {
  const { data, error } = await supabase
    .from("creator_subscriptions")
    .select("status, started_at")
    .eq("creator_profile_id", creatorProfileId)
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ status: r.status, startedAt: r.started_at }));
}

async function readRecentSubscribers(supabase: Db): Promise<DashboardRecentSubscriber[]> {
  const { data, error } = await supabase.rpc("creator_subscribers_list", { _limit: 5 });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    displayName: r.member_display_name ?? r.member_username ?? "Member",
    avatarUrl: r.member_avatar_url ?? null,
    tierName: r.tier_name ?? null,
    priceCents: r.price_cents,
    currency: r.currency,
    since: r.since,
  }));
}

async function readNotifications(
  supabase: Db,
  userId: string,
): Promise<CreatorDashboardData["notifications"]> {
  // Explicit recipient filter: the admin read-all RLS policy must not surface
  // other users' notifications in the caller's own dashboard activity.
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapNotification);
}

/**
 * The calling creator's dashboard bundle (RLS-scoped). Returns empty/zeroed
 * collections for accounts without a creator profile or without ledger
 * activity, so the dashboard renders its empty state rather than erroring.
 */
export const getCreatorDashboard = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorDashboardData> => {
    const { supabase, userId } = context;
    const db = supabase as Db;
    const creatorProfileId = await findCreatorProfileId(db, userId);

    if (!creatorProfileId) {
      return {
        balance: emptyBalance(),
        transactions: [],
        payouts: [],
        subscriberRows: [],
        recentSubscribers: [],
        notifications: await readNotifications(db, userId),
      };
    }

    const [balance, transactions, payouts, subscriberRows, recentSubscribers, notifications] =
      await Promise.all([
        readBalance(db),
        readTransactions(db, creatorProfileId),
        readPayouts(db, creatorProfileId),
        readSubscriberRows(db, creatorProfileId),
        readRecentSubscribers(db),
        readNotifications(db, userId),
      ]);

    return { balance, transactions, payouts, subscriberRows, recentSubscribers, notifications };
  });
