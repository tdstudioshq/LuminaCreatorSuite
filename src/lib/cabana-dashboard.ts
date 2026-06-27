// ============================================================================
// CABANA — creator dashboard domain layer (PURE) — Phase 11A
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. This module owns the
// deterministic aggregation that turns already-fetched, RLS-scoped creator data
// (balance, ledger transactions, payouts, subscriber rows, notifications) into
// the dashboard-home view model: KPI cards, a revenue summary, a subscriber
// summary, and a recent-activity list.
//
// It REUSES the existing pure layers rather than re-deriving anything:
//   - the creator balance is already derived by `cabana-money`
//     (`deriveCreatorBalance` → `CreatorBalanceProjection`, surfaced by the
//     `creator_balance` RPC); we read its fields, we do not recompute them;
//   - transaction-type labels come from `cabana-finance`;
//   - activity rows reuse `cabana-notifications` (the notification row already
//     carries a formatted title/body, and `resolveNotificationTarget` resolves
//     the in-app link).
//
// The only genuinely new aggregation here is the current-month revenue roll-up
// and the subscriber counts, both computed from rows the creator already owns.
//
// DEMO-ONLY: every monetary figure originates from the mock ledger; no real
// money moves anywhere in CABANA.
// ============================================================================

import type { Database } from "@/integrations/supabase/types";
import { formatMoney, type CreatorBalanceProjection } from "@/lib/cabana-money";
import { transactionTypeLabel } from "@/lib/cabana-finance";
import { resolveNotificationTarget, type NotificationItem } from "@/lib/cabana-notifications";

type TransactionType = Database["public"]["Enums"]["transaction_type"];
type TransactionStatus = Database["public"]["Enums"]["transaction_status"];
type PayoutStatus = Database["public"]["Enums"]["payout_status"];
type CreatorSubscriptionStatus = Database["public"]["Enums"]["creator_subscription_status"];

// ───────────────────────────── Repository inputs ─────────────────────────────
// Minimal structural shapes the server action supplies. Kept independent of the
// server-action DTOs so this module stays decoupled and unit-testable.

export interface DashboardTransaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  grossCents: number;
  creatorNetCents: number;
  currency: string;
  createdAt: string;
}

export interface DashboardPayout {
  id: string;
  amountCents: number;
  currency: string;
  status: PayoutStatus;
  createdAt: string;
}

export interface DashboardSubscriberRow {
  status: CreatorSubscriptionStatus;
  startedAt: string;
}

export interface DashboardRecentSubscriber {
  displayName: string;
  avatarUrl: string | null;
  tierName: string | null;
  priceCents: number;
  currency: string;
  since: string;
}

export interface CreatorDashboardData {
  balance: CreatorBalanceProjection;
  transactions: readonly DashboardTransaction[];
  payouts: readonly DashboardPayout[];
  subscriberRows: readonly DashboardSubscriberRow[];
  recentSubscribers: readonly DashboardRecentSubscriber[];
  notifications: readonly NotificationItem[];
}

// ───────────────────────────── View models ─────────────────────────────

export interface CreatorDashboardKpis {
  currency: string;
  totalRevenueCents: number;
  monthlyRevenueCents: number;
  availableBalanceCents: number;
  pendingPayoutsCents: number;
  pendingPayoutsCount: number;
  activeSubscribers: number;
  totalSubscribers: number;
  newSubscribers: number;
}

export interface RecentEarning {
  id: string;
  label: string;
  amountCents: number;
  currency: string;
  at: string;
}

export interface RevenueSummaryView {
  currency: string;
  totalRevenueCents: number;
  monthlyRevenueCents: number;
  availableCents: number;
  pendingCents: number;
  lifetimePaidOutCents: number;
  pendingPayoutsCents: number;
  recentEarnings: RecentEarning[];
}

export interface SubscriberJoin {
  displayName: string;
  avatarUrl: string | null;
  tierName: string | null;
  priceCents: number;
  currency: string;
  since: string;
}

export interface SubscriberSummaryView {
  active: number;
  total: number;
  newThisMonth: number;
  growthPct: number;
  recentJoins: SubscriberJoin[];
}

export interface RecentActivityItem {
  id: string;
  title: string;
  body: string | null;
  at: string;
  href: string | null;
  isRead: boolean;
}

export type KpiTone = "neutral" | "positive" | "attention";

export interface KpiCardView {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone: KpiTone;
}

export interface CreatorDashboardView {
  kpis: CreatorDashboardKpis;
  kpiCards: KpiCardView[];
  revenue: RevenueSummaryView;
  subscribers: SubscriberSummaryView;
  recentActivity: RecentActivityItem[];
  isEmpty: boolean;
}

// ───────────────────────────── Date helpers ─────────────────────────────

/**
 * True when `iso` falls in the same UTC calendar month/year as `nowIso`.
 * UTC is used deliberately so the roll-up is deterministic across environments.
 * An unparseable timestamp is treated as out-of-window (never counted).
 */
export function isWithinCurrentMonth(iso: string, nowIso: string): boolean {
  const then = new Date(iso);
  const now = new Date(nowIso);
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return false;
  return then.getUTCFullYear() === now.getUTCFullYear() && then.getUTCMonth() === now.getUTCMonth();
}

// ───────────────────────────── Revenue ─────────────────────────────

/** Reserved (awaiting disbursement) payout statuses — mirrors `cabana-money`. */
const RESERVED_PAYOUT_STATUSES: ReadonlySet<PayoutStatus> = new Set<PayoutStatus>([
  "queued",
  "processing",
]);

/**
 * Net creator revenue settled in the current calendar month. Mirrors the
 * balance derivation: only `succeeded` rows count, refunds subtract, everything
 * else adds the creator-net slice.
 */
export function monthlyRevenueCents(
  transactions: readonly DashboardTransaction[],
  nowIso: string,
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.status !== "succeeded") continue;
    if (!isWithinCurrentMonth(t.createdAt, nowIso)) continue;
    if (t.type === "refund") total -= t.creatorNetCents;
    else total += t.creatorNetCents;
  }
  return total;
}

/** Sum + count of payouts currently reserved against the balance. */
export function summarizePendingPayouts(payouts: readonly DashboardPayout[]): {
  totalCents: number;
  count: number;
} {
  let totalCents = 0;
  let count = 0;
  for (const p of payouts) {
    if (RESERVED_PAYOUT_STATUSES.has(p.status)) {
      totalCents += p.amountCents;
      count += 1;
    }
  }
  return { totalCents, count };
}

/** Most recent settled inflows (purchases/tips/subscriptions), newest first. */
export function buildRecentEarnings(
  transactions: readonly DashboardTransaction[],
  limit = 5,
): RecentEarning[] {
  return transactions
    .filter((t) => t.status === "succeeded" && t.type !== "refund")
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      label: transactionTypeLabel(t.type),
      amountCents: t.creatorNetCents,
      currency: t.currency,
      at: t.createdAt,
    }));
}

// ───────────────────────────── Subscribers ─────────────────────────────

/**
 * Active / total / new-this-month counts plus a month-over-month growth
 * percentage. Growth compares this month's new active subs against the prior
 * active base (active minus the new ones); with no prior base, any new sub is
 * shown as +100%.
 */
export function summarizeSubscribers(
  rows: readonly DashboardSubscriberRow[],
  recent: readonly DashboardRecentSubscriber[],
  nowIso: string,
  recentLimit = 5,
): SubscriberSummaryView {
  let active = 0;
  let newThisMonth = 0;
  for (const r of rows) {
    if (r.status !== "active") continue;
    active += 1;
    if (isWithinCurrentMonth(r.startedAt, nowIso)) newThisMonth += 1;
  }
  const total = rows.length;
  const priorBase = active - newThisMonth;
  const growthPct =
    priorBase > 0 ? Math.round((newThisMonth / priorBase) * 100) : newThisMonth > 0 ? 100 : 0;

  const recentJoins: SubscriberJoin[] = recent.slice(0, recentLimit).map((s) => ({
    displayName: s.displayName,
    avatarUrl: s.avatarUrl,
    tierName: s.tierName,
    priceCents: s.priceCents,
    currency: s.currency,
    since: s.since,
  }));

  return { active, total, newThisMonth, growthPct, recentJoins };
}

// ───────────────────────────── Activity ─────────────────────────────

/**
 * Most recent notifications shaped for the dashboard activity list. Reuses the
 * pre-formatted notification title/body and the shared link resolver — new
 * subscribers, sales, tips, payouts, and any future system events all flow
 * through here without bespoke formatting.
 */
export function buildRecentActivity(
  notifications: readonly NotificationItem[],
  limit = 6,
): RecentActivityItem[] {
  return notifications.slice(0, limit).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    at: n.createdAt,
    href: resolveNotificationTarget(n)?.href ?? null,
    isRead: n.isRead,
  }));
}

// ───────────────────────────── KPI cards ─────────────────────────────

/** Build the seven dashboard KPI cards from the aggregated figures. */
export function buildKpiCards(
  kpis: CreatorDashboardKpis,
  subscribers: SubscriberSummaryView,
): KpiCardView[] {
  const { currency } = kpis;
  const growthHint =
    subscribers.newThisMonth > 0 ? `+${subscribers.growthPct}% this month` : "No change this month";

  return [
    {
      key: "total-revenue",
      label: "Total revenue",
      value: formatMoney(kpis.totalRevenueCents, currency),
      hint: "Lifetime net earnings",
      tone: "neutral",
    },
    {
      key: "monthly-revenue",
      label: "This month",
      value: formatMoney(kpis.monthlyRevenueCents, currency),
      hint: "Net earned this month",
      tone: kpis.monthlyRevenueCents > 0 ? "positive" : "neutral",
    },
    {
      key: "available-balance",
      label: "Available balance",
      value: formatMoney(kpis.availableBalanceCents, currency),
      hint: "Ready to withdraw",
      tone: kpis.availableBalanceCents > 0 ? "positive" : "neutral",
    },
    {
      key: "pending-payouts",
      label: "Pending payouts",
      value: formatMoney(kpis.pendingPayoutsCents, currency),
      hint:
        kpis.pendingPayoutsCount === 1
          ? "1 request in progress"
          : `${kpis.pendingPayoutsCount} requests in progress`,
      tone: kpis.pendingPayoutsCount > 0 ? "attention" : "neutral",
    },
    {
      key: "active-subscribers",
      label: "Active subscribers",
      value: String(kpis.activeSubscribers),
      hint: growthHint,
      tone: kpis.activeSubscribers > 0 ? "positive" : "neutral",
    },
    {
      key: "total-subscribers",
      label: "Total subscribers",
      value: String(kpis.totalSubscribers),
      hint: "All-time, incl. canceled",
      tone: "neutral",
    },
    {
      key: "new-subscribers",
      label: "New subscribers",
      value: String(kpis.newSubscribers),
      hint: "Joined this month",
      tone: kpis.newSubscribers > 0 ? "positive" : "neutral",
    },
  ];
}

// ───────────────────────────── Assembly ─────────────────────────────

/**
 * Assemble the full creator dashboard view model from RLS-scoped repository
 * data and the current time. Pure and deterministic — given the same inputs it
 * always produces the same view.
 */
export function buildCreatorDashboard(
  data: CreatorDashboardData,
  nowIso: string,
): CreatorDashboardView {
  const pendingPayouts = summarizePendingPayouts(data.payouts);
  const subscribers = summarizeSubscribers(data.subscriberRows, data.recentSubscribers, nowIso);
  const monthly = monthlyRevenueCents(data.transactions, nowIso);

  const kpis: CreatorDashboardKpis = {
    currency: data.balance.currency,
    totalRevenueCents: data.balance.lifetimeNetCents,
    monthlyRevenueCents: monthly,
    availableBalanceCents: data.balance.availableCents,
    pendingPayoutsCents: pendingPayouts.totalCents,
    pendingPayoutsCount: pendingPayouts.count,
    activeSubscribers: subscribers.active,
    totalSubscribers: subscribers.total,
    newSubscribers: subscribers.newThisMonth,
  };

  const revenue: RevenueSummaryView = {
    currency: data.balance.currency,
    totalRevenueCents: data.balance.lifetimeNetCents,
    monthlyRevenueCents: monthly,
    availableCents: data.balance.availableCents,
    pendingCents: data.balance.pendingCents,
    lifetimePaidOutCents: data.balance.lifetimePaidOutCents,
    pendingPayoutsCents: pendingPayouts.totalCents,
    recentEarnings: buildRecentEarnings(data.transactions),
  };

  const recentActivity = buildRecentActivity(data.notifications);

  const isEmpty =
    data.balance.lifetimeGrossCents === 0 &&
    subscribers.total === 0 &&
    data.notifications.length === 0;

  return {
    kpis,
    kpiCards: buildKpiCards(kpis, subscribers),
    revenue,
    subscribers,
    recentActivity,
    isEmpty,
  };
}
