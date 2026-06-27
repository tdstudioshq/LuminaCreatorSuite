// ============================================================================
// CABANA — creator analytics domain layer (PURE) — Phase 11B
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. Deterministic
// aggregation that turns already-fetched, RLS-scoped creator data (settled
// ledger transactions, the creator's own subscription rows, and per-post
// engagement counts from the `creator_content_analytics` RPC) into the
// analytics view: revenue over time, subscriber growth, top content, and an
// engagement summary — all filterable by a single date range.
//
// Named `cabana-creator-analytics` because `cabana-analytics.ts` already exists
// (it is the link-in-bio event-tracking module). This module does NOT re-derive
// fees, balances, or platform revenue (those live in `cabana-money` /
// `cabana-finance` / `cabana-dashboard`). The only money rule reused here is
// "a settled inflow adds its creator-net, a refund subtracts" — applied to
// bucket already-derived `creator_net_cents` by time. Everything is computed in
// UTC so the buckets are stable across environments.
//
// DEMO-ONLY: every monetary figure originates from the mock ledger.
// ============================================================================

import type { Database } from "@/integrations/supabase/types";

type TransactionType = Database["public"]["Enums"]["transaction_type"];
type TransactionStatus = Database["public"]["Enums"]["transaction_status"];
type CreatorSubscriptionStatus = Database["public"]["Enums"]["creator_subscription_status"];
type PostVisibility = Database["public"]["Enums"]["post_visibility"];
type PostStatus = Database["public"]["Enums"]["post_status"];

// ───────────────────────────── Repository inputs ─────────────────────────────

export interface AnalyticsTransaction {
  type: TransactionType;
  status: TransactionStatus;
  creatorNetCents: number;
  currency: string;
  createdAt: string;
}

export interface AnalyticsSubscription {
  status: CreatorSubscriptionStatus;
  startedAt: string;
  canceledAt: string | null;
}

export interface AnalyticsPost {
  postId: string;
  caption: string;
  visibility: PostVisibility;
  status: PostStatus;
  publishedAt: string | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  saveCount: number;
}

export interface CreatorAnalyticsData {
  currency: string;
  transactions: readonly AnalyticsTransaction[];
  subscriptions: readonly AnalyticsSubscription[];
  posts: readonly AnalyticsPost[];
}

// ───────────────────────────── Ranges + constants ─────────────────────────────

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ["7d", "30d", "90d", "all"];

export const ANALYTICS_RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
};

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Daily-chart window for a range. "All time" falls back to a 90-day window. */
export function dailyWindowDays(range: AnalyticsRange): number {
  return range === "all" ? 90 : RANGE_DAYS[range];
}

const DAY_MS = 86_400_000;
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// ───────────────────────────── Time helpers ─────────────────────────────

function parseMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** UTC midnight (ms) for the day containing `ms`. */
function startOfUtcDay(ms: number): number {
  return ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS);
}

/** "YYYY-MM-DD" (UTC) for a timestamp in ms. */
export function utcDayKey(ms: number): string {
  return new Date(startOfUtcDay(ms)).toISOString().slice(0, 10);
}

/** "YYYY-MM" (UTC) for a timestamp in ms. */
export function utcMonthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/**
 * Inclusive lower-bound (ms) for a range relative to `nowMs`, or null for
 * "all" (no lower bound). The window starts at UTC midnight `days-1` days back
 * so a "7 days" filter covers 7 whole calendar days including today.
 */
export function rangeStartMs(range: AnalyticsRange, nowMs: number): number | null {
  if (range === "all") return null;
  return startOfUtcDay(nowMs) - (RANGE_DAYS[range] - 1) * DAY_MS;
}

function inRange(iso: string | null, startMs: number | null, nowMs: number): boolean {
  const ms = parseMs(iso);
  if (ms == null) return false;
  if (ms > nowMs) return false;
  return startMs == null || ms >= startMs;
}

// ───────────────────────────── Revenue ─────────────────────────────

/**
 * Settled creator-net for one transaction: a succeeded inflow contributes its
 * net, a succeeded refund subtracts it, anything else contributes nothing.
 * Mirrors the ledger derivation in `cabana-money` / `cabana-dashboard`.
 */
export function settledNetCents(txn: AnalyticsTransaction): number {
  if (txn.status !== "succeeded") return 0;
  return txn.type === "refund" ? -txn.creatorNetCents : txn.creatorNetCents;
}

export interface SeriesPoint {
  key: string;
  label: string;
  cents: number;
}

/** Daily settled-revenue series of `days` UTC buckets ending today. */
export function revenueDailySeries(
  transactions: readonly AnalyticsTransaction[],
  days: number,
  nowIso: string,
): SeriesPoint[] {
  const nowMs = new Date(nowIso).getTime();
  const todayStart = startOfUtcDay(nowMs);
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    buckets.set(utcDayKey(todayStart - i * DAY_MS), 0);
  }
  for (const txn of transactions) {
    const ms = parseMs(txn.createdAt);
    if (ms == null) continue;
    const key = utcDayKey(ms);
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + settledNetCents(txn));
  }
  return [...buckets.entries()].map(([key, cents]) => ({
    key,
    label: key.slice(5), // MM-DD
    cents,
  }));
}

/** Monthly settled-revenue series of the last `months` UTC months. */
export function revenueMonthlySeries(
  transactions: readonly AnalyticsTransaction[],
  months: number,
  nowIso: string,
): SeriesPoint[] {
  const now = new Date(nowIso);
  const buckets = new Map<string, number>();
  const order: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    buckets.set(key, 0);
    order.push(key);
  }
  for (const txn of transactions) {
    const ms = parseMs(txn.createdAt);
    if (ms == null) continue;
    const key = utcMonthKey(ms);
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + settledNetCents(txn));
  }
  return order.map((key) => ({
    key,
    label: MONTH_ABBR[Number(key.slice(5, 7)) - 1],
    cents: buckets.get(key) ?? 0,
  }));
}

/** Total settled revenue within a range (all-time when range is "all"). */
export function revenueTotalCents(
  transactions: readonly AnalyticsTransaction[],
  range: AnalyticsRange,
  nowIso: string,
): number {
  const nowMs = new Date(nowIso).getTime();
  const startMs = rangeStartMs(range, nowMs);
  let total = 0;
  for (const txn of transactions) {
    if (!inRange(txn.createdAt, startMs, nowMs)) continue;
    total += settledNetCents(txn);
  }
  return total;
}

export type TrendDirection = "up" | "down" | "flat";

export interface Trend {
  direction: TrendDirection;
  changePct: number;
}

/**
 * Trend across a series: compares the sum of the most recent half against the
 * earlier half. A zero earlier-half with positive recent revenue reads as
 * +100%; an empty/zero series is flat.
 */
export function seriesTrend(points: readonly SeriesPoint[]): Trend {
  if (points.length < 2) return { direction: "flat", changePct: 0 };
  const mid = Math.floor(points.length / 2);
  let prev = 0;
  let recent = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (i < mid) prev += points[i].cents;
    else recent += points[i].cents;
  }
  if (prev <= 0) {
    if (recent > 0) return { direction: "up", changePct: 100 };
    if (recent < 0) return { direction: "down", changePct: -100 };
    return { direction: "flat", changePct: 0 };
  }
  const changePct = Math.round(((recent - prev) / prev) * 100);
  if (changePct > 0) return { direction: "up", changePct };
  if (changePct < 0) return { direction: "down", changePct };
  return { direction: "flat", changePct: 0 };
}

// ───────────────────────────── Subscribers ─────────────────────────────

export interface SubscriberStats {
  active: number;
  new: number;
  canceled: number;
  growthPct: number;
}

/**
 * Active (point-in-time), plus new joins and cancellations within the range.
 * Growth compares the new joins against the prior active base (active minus the
 * new ones); no prior base with any new join reads as +100%.
 */
export function subscriberStats(
  subs: readonly AnalyticsSubscription[],
  range: AnalyticsRange,
  nowIso: string,
): SubscriberStats {
  const nowMs = new Date(nowIso).getTime();
  const startMs = rangeStartMs(range, nowMs);
  let active = 0;
  let added = 0;
  let canceled = 0;
  for (const s of subs) {
    if (s.status === "active") active += 1;
    if (inRange(s.startedAt, startMs, nowMs)) added += 1;
    if (s.canceledAt && inRange(s.canceledAt, startMs, nowMs)) canceled += 1;
  }
  const priorBase = active - added;
  const growthPct = priorBase > 0 ? Math.round((added / priorBase) * 100) : added > 0 ? 100 : 0;
  return { active, new: added, canceled, growthPct };
}

/**
 * Cumulative active-subscriber series over `days` UTC buckets ending today: for
 * each day, the count of subscriptions started on/before that day and not yet
 * canceled by it.
 */
export function subscriberGrowthSeries(
  subs: readonly AnalyticsSubscription[],
  days: number,
  nowIso: string,
): SeriesPoint[] {
  const nowMs = new Date(nowIso).getTime();
  const todayStart = startOfUtcDay(nowMs);
  const points: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayEnd = todayStart - i * DAY_MS + DAY_MS - 1;
    let count = 0;
    for (const s of subs) {
      const started = parseMs(s.startedAt);
      if (started == null || started > dayEnd) continue;
      const canceled = parseMs(s.canceledAt);
      if (canceled != null && canceled <= dayEnd) continue;
      count += 1;
    }
    const key = utcDayKey(todayStart - i * DAY_MS);
    points.push({ key, label: key.slice(5), cents: count });
  }
  return points;
}

// ───────────────────────────── Content + engagement ─────────────────────────────

export type ContentMetric = "like" | "comment" | "save" | "total";

export function postEngagementTotal(post: AnalyticsPost): number {
  return post.likeCount + post.commentCount + post.saveCount;
}

function metricValue(post: AnalyticsPost, metric: ContentMetric): number {
  switch (metric) {
    case "like":
      return post.likeCount;
    case "comment":
      return post.commentCount;
    case "save":
      return post.saveCount;
    case "total":
      return postEngagementTotal(post);
  }
}

/** Posts ranked by a metric (desc), keeping only those with a positive value. */
export function rankPosts(
  posts: readonly AnalyticsPost[],
  metric: ContentMetric,
  limit = 5,
): AnalyticsPost[] {
  return posts
    .filter((p) => metricValue(p, metric) > 0)
    .slice()
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
    .slice(0, limit);
}

export interface EngagementTotals {
  likes: number;
  comments: number;
  saves: number;
  total: number;
}

export function engagementTotals(posts: readonly AnalyticsPost[]): EngagementTotals {
  let likes = 0;
  let comments = 0;
  let saves = 0;
  for (const p of posts) {
    likes += p.likeCount;
    comments += p.commentCount;
    saves += p.saveCount;
  }
  return { likes, comments, saves, total: likes + comments + saves };
}

/**
 * Average engagements per published post, rounded to one decimal. Published
 * posts are the denominator because drafts cannot accrue engagement.
 */
export function engagementRatePerPost(posts: readonly AnalyticsPost[]): number {
  const published = posts.filter((p) => p.status === "published").length;
  if (published === 0) return 0;
  return Math.round((engagementTotals(posts).total / published) * 10) / 10;
}

export interface EngagementKpiCard {
  key: string;
  label: string;
  value: string;
  hint: string;
}

export function buildEngagementKpis(
  totals: EngagementTotals,
  ratePerPost: number,
): EngagementKpiCard[] {
  return [
    { key: "likes", label: "Likes", value: String(totals.likes), hint: "Total likes" },
    {
      key: "comments",
      label: "Comments",
      value: String(totals.comments),
      hint: "Total comments",
    },
    { key: "saves", label: "Saves", value: String(totals.saves), hint: "Total saves" },
    {
      key: "rate",
      label: "Engagement rate",
      value: ratePerPost.toFixed(1),
      hint: "Avg per published post",
    },
  ];
}

/** Keep posts whose publish date falls in range (drafts excluded from content). */
export function filterPostsByRange(
  posts: readonly AnalyticsPost[],
  range: AnalyticsRange,
  nowIso: string,
): AnalyticsPost[] {
  const nowMs = new Date(nowIso).getTime();
  const startMs = rangeStartMs(range, nowMs);
  return posts.filter((p) => inRange(p.publishedAt, startMs, nowMs));
}

// ───────────────────────────── Assembly ─────────────────────────────

export interface RevenueAnalyticsView {
  currency: string;
  totalCents: number;
  dailySeries: SeriesPoint[];
  monthlySeries: SeriesPoint[];
  trend: Trend;
}

export interface SubscriberAnalyticsView extends SubscriberStats {
  series: SeriesPoint[];
}

export interface ContentAnalyticsView {
  topByLikes: AnalyticsPost[];
  topByComments: AnalyticsPost[];
  topBySaves: AnalyticsPost[];
  topOverall: AnalyticsPost[];
}

export interface EngagementAnalyticsView {
  totals: EngagementTotals;
  ratePerPost: number;
  kpis: EngagementKpiCard[];
}

export interface CreatorAnalyticsView {
  range: AnalyticsRange;
  revenue: RevenueAnalyticsView;
  subscribers: SubscriberAnalyticsView;
  content: ContentAnalyticsView;
  engagement: EngagementAnalyticsView;
  isEmpty: boolean;
}

/**
 * Assemble the full analytics view from RLS-scoped repository data, the chosen
 * date range, and the current time. Pure + deterministic. The date range drives
 * the revenue total, subscriber stats, and the content/engagement window
 * through one shared pipeline; the 12-month revenue series is always shown.
 */
export function buildCreatorAnalytics(
  data: CreatorAnalyticsData,
  range: AnalyticsRange,
  nowIso: string,
): CreatorAnalyticsView {
  const days = dailyWindowDays(range);
  const dailySeries = revenueDailySeries(data.transactions, days, nowIso);
  const monthlySeries = revenueMonthlySeries(data.transactions, 12, nowIso);

  const revenue: RevenueAnalyticsView = {
    currency: data.currency,
    totalCents: revenueTotalCents(data.transactions, range, nowIso),
    dailySeries,
    monthlySeries,
    trend: seriesTrend(dailySeries),
  };

  const subscribers: SubscriberAnalyticsView = {
    ...subscriberStats(data.subscriptions, range, nowIso),
    series: subscriberGrowthSeries(data.subscriptions, days, nowIso),
  };

  const rangedPosts = filterPostsByRange(data.posts, range, nowIso);
  const content: ContentAnalyticsView = {
    topByLikes: rankPosts(rangedPosts, "like"),
    topByComments: rankPosts(rangedPosts, "comment"),
    topBySaves: rankPosts(rangedPosts, "save"),
    topOverall: rankPosts(rangedPosts, "total"),
  };

  const totals = engagementTotals(rangedPosts);
  const ratePerPost = engagementRatePerPost(rangedPosts);
  const engagement: EngagementAnalyticsView = {
    totals,
    ratePerPost,
    kpis: buildEngagementKpis(totals, ratePerPost),
  };

  const isEmpty =
    data.transactions.length === 0 && data.subscriptions.length === 0 && data.posts.length === 0;

  return { range, revenue, subscribers, content, engagement, isEmpty };
}
