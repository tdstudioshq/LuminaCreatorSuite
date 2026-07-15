// ============================================================================
// CABANA — discovery domain layer (PURE)
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. This module owns
// the deterministic ranking, matching, and shaping logic for the discovery
// surface: featured creators, trending creators, recently active creators,
// suggested creators, and ranked post candidates.
//
// The server actions supply repository data; the UI consumes the ranked arrays.
// ============================================================================
import type { FeedPost } from "@/lib/cabana-posts";

export type DiscoveryCreator = {
  profileId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DiscoveryPostCandidate = {
  postId: string;
  creatorProfileId: string;
  caption: string;
  visibility: FeedPost["visibility"];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  savedByMe: boolean;
  canEngage: boolean;
};

export type DiscoveryTimeWindow = "24h" | "7d" | "30d" | "all";

export type DiscoverySuggestionReasonKind =
  | "because_you_follow"
  | "followed_by_network"
  | "subscription_activity"
  | "recently_active"
  | "popular_creator";

export type DiscoverySuggestionReason = {
  kind: DiscoverySuggestionReasonKind;
  label: string;
};

export type DiscoverySuggestedCreator = {
  creator: DiscoveryCreator;
  reason: DiscoverySuggestionReason;
};

export type DiscoverySnapshot = {
  timeWindow: DiscoveryTimeWindow;
  featuredCreators: DiscoveryCreator[];
  trendingCreators: DiscoveryCreator[];
  recentlyActiveCreators: DiscoveryCreator[];
  suggestedCreators: DiscoverySuggestedCreator[];
  trendingPosts: FeedPost[];
  explorePosts: FeedPost[];
};

export type DiscoverySearchResults = {
  creators: DiscoveryCreator[];
  posts: FeedPost[];
};

export type DiscoveryFeedItem =
  { kind: "post"; post: FeedPost } | { kind: "creator"; creator: DiscoveryCreator };

export type DiscoveryCreatorRankMode = "featured" | "trending" | "recent" | "suggested" | "search";

export type DiscoveryPostRankMode = "trending" | "recent" | "search";

export type DiscoveryCreatorPostSignals = {
  likeCount: number;
  commentCount: number;
  saveCount: number;
  latestPostAt: string | null;
};

export type CreatorRankOptions = {
  mode?: DiscoveryCreatorRankMode;
  query?: string;
  interestTokens?: readonly string[];
  excludedProfileIds?: readonly string[];
  postSignals?: Readonly<Record<string, DiscoveryCreatorPostSignals>>;
  timeWindow?: DiscoveryTimeWindow;
  nowMs?: number;
  limit?: number;
};

export type PostRankOptions = {
  mode?: DiscoveryPostRankMode;
  query?: string;
  interestTokens?: readonly string[];
  boostProfileIds?: readonly string[];
  excludedPostIds?: readonly string[];
  timeWindow?: DiscoveryTimeWindow;
  nowMs?: number;
  limit?: number;
};

export type SuggestedCreatorReasonOptions = {
  followedCreators?: readonly DiscoveryCreator[];
  subscribedCreators?: readonly DiscoveryCreator[];
  followedByNetworkCounts?: Readonly<Record<string, number>>;
  subscriptionActivityCounts?: Readonly<Record<string, number>>;
  postSignals?: Readonly<Record<string, DiscoveryCreatorPostSignals>>;
  nowMs?: number;
};

export const DISCOVERY_TIME_WINDOWS: readonly DiscoveryTimeWindow[] = ["24h", "7d", "30d", "all"];

const DEFAULT_LIMIT = 6;
const DAY_MS = 86_400_000;
const TOKEN_SPLIT = /[^a-z0-9]+/g;
const DISCOVERY_STOP_TOKENS = new Set([
  "and",
  "creator",
  "for",
  "from",
  "that",
  "the",
  "this",
  "with",
]);

const CREATOR_MODE_WEIGHTS: Record<
  DiscoveryCreatorRankMode,
  {
    popularity: number;
    engagement: number;
    verified: number;
    recency: number;
    freshness: number;
    match: number;
  }
> = {
  featured: {
    popularity: 1.4,
    engagement: 0.8,
    verified: 1.4,
    recency: 0.8,
    freshness: 0.4,
    match: 0.6,
  },
  trending: {
    popularity: 1.6,
    engagement: 1.8,
    verified: 1.0,
    recency: 1.2,
    freshness: 0.2,
    match: 0.3,
  },
  recent: {
    popularity: 0.5,
    engagement: 0.4,
    verified: 0.3,
    recency: 1.7,
    freshness: 1.4,
    match: 0.1,
  },
  suggested: {
    popularity: 0.8,
    engagement: 0.6,
    verified: 0.5,
    recency: 0.9,
    freshness: 1.1,
    match: 1.8,
  },
  search: {
    popularity: 0.1,
    engagement: 0.05,
    verified: 0.1,
    recency: 0.1,
    freshness: 0.05,
    match: 6,
  },
};

const POST_MODE_WEIGHTS: Record<
  DiscoveryPostRankMode,
  {
    engagement: number;
    recency: number;
    freshness: number;
    match: number;
    saved: number;
  }
> = {
  trending: { engagement: 1.5, recency: 1.3, freshness: 0.2, match: 0.4, saved: 0.7 },
  recent: { engagement: 0.8, recency: 1.8, freshness: 0.5, match: 0.1, saved: 0.3 },
  search: { engagement: 0.2, recency: 0.2, freshness: 0.1, match: 6, saved: 0.3 },
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function splitTokens(value: string): string[] {
  return normalizeText(value)
    .replace(/^#+/, "")
    .split(TOKEN_SPLIT)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !DISCOVERY_STOP_TOKENS.has(token));
}

function dedupe<T, K>(items: readonly T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function clamp(limit: number | undefined): number {
  const value =
    typeof limit === "number" && Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LIMIT;
  return Math.min(Math.max(value, 1), 50);
}

function parseTime(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function recencyScore(
  timestamp: string | null | undefined,
  nowMs: number,
  windowDays: number,
  maxScore: number,
): number {
  const ts = parseTime(timestamp);
  if (ts === 0) return 0;
  const age = Math.max(0, nowMs - ts);
  const windowMs = windowDays * DAY_MS;
  if (age >= windowMs) return 0;
  return (1 - age / windowMs) * maxScore;
}

function windowDurationMs(window: DiscoveryTimeWindow): number | null {
  if (window === "24h") return DAY_MS;
  if (window === "7d") return 7 * DAY_MS;
  if (window === "30d") return 30 * DAY_MS;
  return null;
}

function isWithinWindow(
  timestamp: string | null | undefined,
  window: DiscoveryTimeWindow,
  nowMs: number,
): boolean {
  const duration = windowDurationMs(window);
  if (duration === null) return true;
  const time = parseTime(timestamp);
  if (time === 0) return false;
  const age = Math.max(0, nowMs - time);
  return age <= duration;
}

function tokenOverlapScore(tokens: readonly string[], haystack: string): number {
  if (tokens.length === 0) return 0;
  const text = normalizeText(haystack);
  let score = 0;
  for (const token of tokens) {
    if (!text.includes(token)) continue;
    score += token.length >= 6 ? 4 : token.length >= 4 ? 3 : 2;
    if (text.startsWith(token)) score += 1;
  }
  return score;
}

function creatorSearchText(creator: DiscoveryCreator): string {
  return [creator.username, creator.displayName, creator.bio ?? ""].join(" ");
}

function creatorPopularityScore(creator: DiscoveryCreator): number {
  return Math.log10(creator.followerCount + 1) * 18 + Math.log10(creator.postCount + 1) * 10;
}

function creatorEngagementScore(signals: DiscoveryCreatorPostSignals | undefined): number {
  if (!signals) return 0;
  return (
    Math.log10(signals.likeCount + 1) * 12 +
    Math.log10(signals.commentCount + 1) * 14 +
    Math.log10(signals.saveCount + 1) * 16
  );
}

function creatorFreshnessScore(creator: DiscoveryCreator, nowMs: number): number {
  return recencyScore(creator.createdAt, nowMs, 45, 12);
}

function creatorActivityAt(
  creator: DiscoveryCreator,
  signals: DiscoveryCreatorPostSignals | undefined,
): string {
  const profileTime = parseTime(creator.updatedAt);
  const postTime = parseTime(signals?.latestPostAt);
  return postTime > profileTime ? (signals?.latestPostAt ?? creator.updatedAt) : creator.updatedAt;
}

function creatorActivityScore(
  creator: DiscoveryCreator,
  signals: DiscoveryCreatorPostSignals | undefined,
  nowMs: number,
): number {
  return recencyScore(creatorActivityAt(creator, signals), nowMs, 21, 12);
}

function creatorVerifiedScore(creator: DiscoveryCreator): number {
  return creator.verified ? 16 : 0;
}

function creatorMatchScore(
  creator: DiscoveryCreator,
  queryTokens: readonly string[],
  interestTokens: readonly string[],
): number {
  return (
    tokenOverlapScore(queryTokens, creatorSearchText(creator)) +
    tokenOverlapScore(interestTokens, creatorSearchText(creator))
  );
}

function scoreCreator(
  creator: DiscoveryCreator,
  options: Required<Pick<CreatorRankOptions, "mode" | "nowMs">> & {
    queryTokens: readonly string[];
    interestTokens: readonly string[];
    postSignals: Readonly<Record<string, DiscoveryCreatorPostSignals>>;
  },
): number {
  const weights = CREATOR_MODE_WEIGHTS[options.mode];
  const signals = options.postSignals[creator.profileId];
  return (
    creatorPopularityScore(creator) * weights.popularity +
    creatorEngagementScore(signals) * weights.engagement +
    creatorVerifiedScore(creator) * weights.verified +
    creatorActivityScore(creator, signals, options.nowMs) * weights.recency +
    creatorFreshnessScore(creator, options.nowMs) * weights.freshness +
    creatorMatchScore(creator, options.queryTokens, options.interestTokens) * weights.match
  );
}

function postSearchText(post: DiscoveryPostCandidate): string {
  return [post.caption, post.visibility, post.postId].join(" ");
}

function postEngagementScore(post: DiscoveryPostCandidate): number {
  return (
    post.likeCount * 4 +
    post.commentCount * 5 +
    post.saveCount * 6 +
    (post.savedByMe ? 3 : 0) +
    (post.canEngage ? 1 : 0)
  );
}

function postRecencyScore(post: DiscoveryPostCandidate, nowMs: number): number {
  return Math.max(
    recencyScore(post.publishedAt, nowMs, 21, 16),
    recencyScore(post.createdAt, nowMs, 45, 6),
  );
}

function postMatchScore(
  post: DiscoveryPostCandidate,
  queryTokens: readonly string[],
  interestTokens: readonly string[],
): number {
  return (
    tokenOverlapScore(queryTokens, postSearchText(post)) +
    tokenOverlapScore(interestTokens, postSearchText(post))
  );
}

function postPersonalizationScore(
  post: DiscoveryPostCandidate,
  boostProfileIds: readonly string[],
): number {
  return boostProfileIds.includes(post.creatorProfileId) ? 16 : 0;
}

function scorePost(
  post: DiscoveryPostCandidate,
  options: Required<Pick<PostRankOptions, "mode" | "nowMs">> & {
    queryTokens: readonly string[];
    interestTokens: readonly string[];
    boostProfileIds: readonly string[];
  },
): number {
  const weights = POST_MODE_WEIGHTS[options.mode];
  return (
    postEngagementScore(post) * weights.engagement +
    postRecencyScore(post, options.nowMs) * weights.recency +
    recencyScore(post.updatedAt, options.nowMs, 21, 4) * weights.freshness +
    postMatchScore(post, options.queryTokens, options.interestTokens) * weights.match +
    postPersonalizationScore(post, options.boostProfileIds) * weights.saved
  );
}

export function normalizeDiscoveryQuery(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw !== "string") throw new Error("Search query must be text.");
  return normalizeText(raw).replace(/^#+/, "").replace(/\s+/g, " ").trim();
}

export function normalizeDiscoveryTimeWindow(raw: unknown): DiscoveryTimeWindow {
  if (raw == null || raw === "") return "7d";
  if (typeof raw !== "string" || !DISCOVERY_TIME_WINDOWS.includes(raw as DiscoveryTimeWindow)) {
    throw new Error("Invalid discovery time window.");
  }
  return raw as DiscoveryTimeWindow;
}

export function tokenizeDiscoveryQuery(raw: unknown): string[] {
  const query = normalizeDiscoveryQuery(raw);
  if (!query) return [];
  return dedupe(splitTokens(query), (token) => token);
}

export function deriveInterestTokens(creators: readonly DiscoveryCreator[]): string[] {
  return dedupe(
    creators.flatMap((creator) =>
      splitTokens([creator.username, creator.displayName, creator.bio ?? ""].join(" ")),
    ),
    (token) => token,
  );
}

export function summarizeCreatorPostSignals(
  posts: readonly DiscoveryPostCandidate[],
): Record<string, DiscoveryCreatorPostSignals> {
  const signals: Record<string, DiscoveryCreatorPostSignals> = {};
  for (const post of posts) {
    const current = signals[post.creatorProfileId] ?? {
      likeCount: 0,
      commentCount: 0,
      saveCount: 0,
      latestPostAt: null,
    };
    const postTime = post.publishedAt ?? post.createdAt;
    signals[post.creatorProfileId] = {
      likeCount: current.likeCount + Math.max(0, post.likeCount),
      commentCount: current.commentCount + Math.max(0, post.commentCount),
      saveCount: current.saveCount + Math.max(Math.max(0, post.saveCount), post.savedByMe ? 1 : 0),
      latestPostAt:
        parseTime(postTime) > parseTime(current.latestPostAt) ? postTime : current.latestPostAt,
    };
  }
  return signals;
}

export function rankCreatorsForDiscovery(
  creators: readonly DiscoveryCreator[],
  options: CreatorRankOptions = {},
): DiscoveryCreator[] {
  const nowMs = options.nowMs ?? Date.now();
  const mode = options.mode ?? "featured";
  const timeWindow = options.timeWindow ?? "all";
  const postSignals = options.postSignals ?? {};
  const queryTokens = tokenizeDiscoveryQuery(options.query);
  const interestTokens = dedupe(
    (options.interestTokens ?? []).map(normalizeText).filter(Boolean),
    (token) => token,
  );
  const excluded = new Set((options.excludedProfileIds ?? []).map((id) => id.toLowerCase()));

  return [...creators]
    .filter((creator) => !excluded.has(creator.profileId.toLowerCase()))
    .filter((creator) =>
      isWithinWindow(creatorActivityAt(creator, postSignals[creator.profileId]), timeWindow, nowMs),
    )
    .sort((a, b) => {
      const delta =
        scoreCreator(b, { mode, nowMs, queryTokens, interestTokens, postSignals }) -
        scoreCreator(a, { mode, nowMs, queryTokens, interestTokens, postSignals });
      if (delta !== 0) return delta;
      const timeDelta =
        parseTime(creatorActivityAt(b, postSignals[b.profileId])) -
        parseTime(creatorActivityAt(a, postSignals[a.profileId]));
      if (timeDelta !== 0) return timeDelta;
      return a.profileId.localeCompare(b.profileId);
    })
    .slice(0, clamp(options.limit));
}

export function rankPostsForDiscovery(
  posts: readonly DiscoveryPostCandidate[],
  options: PostRankOptions = {},
): DiscoveryPostCandidate[] {
  const nowMs = options.nowMs ?? Date.now();
  const mode = options.mode ?? "trending";
  const timeWindow = options.timeWindow ?? "all";
  const queryTokens = tokenizeDiscoveryQuery(options.query);
  const interestTokens = dedupe(
    (options.interestTokens ?? []).map(normalizeText).filter(Boolean),
    (token) => token,
  );
  const boostProfileIds = new Set((options.boostProfileIds ?? []).map((id) => id.toLowerCase()));
  const excluded = new Set((options.excludedPostIds ?? []).map((id) => id.toLowerCase()));

  return [...posts]
    .filter((post) => !excluded.has(post.postId.toLowerCase()))
    .filter((post) => isWithinWindow(post.publishedAt ?? post.createdAt, timeWindow, nowMs))
    .sort((a, b) => {
      const delta =
        scorePost(b, {
          mode,
          nowMs,
          queryTokens,
          interestTokens,
          boostProfileIds: [...boostProfileIds],
        }) -
        scorePost(a, {
          mode,
          nowMs,
          queryTokens,
          interestTokens,
          boostProfileIds: [...boostProfileIds],
        });
      if (delta !== 0) return delta;
      const timeDelta =
        parseTime(b.publishedAt ?? b.createdAt) - parseTime(a.publishedAt ?? a.createdAt);
      if (timeDelta !== 0) return timeDelta;
      return a.postId.localeCompare(b.postId);
    })
    .slice(0, clamp(options.limit));
}

export function creatorQueryBoost(creator: DiscoveryCreator, query: string): number {
  return tokenOverlapScore(tokenizeDiscoveryQuery(query), creatorSearchText(creator));
}

export function postQueryBoost(post: DiscoveryPostCandidate, query: string): number {
  return tokenOverlapScore(tokenizeDiscoveryQuery(query), postSearchText(post));
}

function bestMatchingCreator(
  creator: DiscoveryCreator,
  seeds: readonly DiscoveryCreator[],
): DiscoveryCreator | null {
  let best: DiscoveryCreator | null = null;
  let bestScore = 0;
  for (const seed of seeds) {
    const score = tokenOverlapScore(
      splitTokens(creatorSearchText(seed)),
      creatorSearchText(creator),
    );
    if (
      score > bestScore ||
      (score === bestScore && score > 0 && seed.profileId.localeCompare(best?.profileId ?? "") < 0)
    ) {
      best = seed;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

export function suggestedCreatorReason(
  creator: DiscoveryCreator,
  options: SuggestedCreatorReasonOptions = {},
): DiscoverySuggestionReason {
  const networkCount = Math.max(
    0,
    Math.trunc(options.followedByNetworkCounts?.[creator.profileId] ?? 0),
  );
  if (networkCount > 0) {
    return {
      kind: "followed_by_network",
      label: `Followed by ${networkCount} ${networkCount === 1 ? "person" : "people"} you follow`,
    };
  }

  const followedMatch = bestMatchingCreator(creator, options.followedCreators ?? []);
  if (followedMatch) {
    return {
      kind: "because_you_follow",
      label: `Because you follow @${followedMatch.username}`,
    };
  }

  const subscriptionCount = Math.max(
    0,
    Math.trunc(options.subscriptionActivityCounts?.[creator.profileId] ?? 0),
  );
  const subscriptionMatch = bestMatchingCreator(creator, options.subscribedCreators ?? []);
  if (subscriptionCount > 0 || subscriptionMatch) {
    return {
      kind: "subscription_activity",
      label:
        subscriptionCount > 0
          ? "Active subscriber community"
          : "Similar to creators you subscribe to",
    };
  }

  const nowMs = options.nowMs ?? Date.now();
  if (
    isWithinWindow(
      creatorActivityAt(creator, options.postSignals?.[creator.profileId]),
      "7d",
      nowMs,
    )
  ) {
    return { kind: "recently_active", label: "Recently active" };
  }

  return { kind: "popular_creator", label: "Popular creator" };
}

export function labelSuggestedCreators(
  creators: readonly DiscoveryCreator[],
  options: SuggestedCreatorReasonOptions = {},
): DiscoverySuggestedCreator[] {
  return creators.map((creator) => ({
    creator,
    reason: suggestedCreatorReason(creator, options),
  }));
}

export function countDiscoverySearchResults(results: {
  creators: readonly DiscoveryCreator[];
  posts: readonly FeedPost[];
}): {
  creators: number;
  posts: number;
  total: number;
} {
  const creators = results.creators.length;
  const posts = results.posts.length;
  return { creators, posts, total: creators + posts };
}

export function interleaveDiscoveryFeed(
  posts: readonly FeedPost[],
  creators: readonly DiscoveryCreator[],
  limit = 8,
): DiscoveryFeedItem[] {
  const out: DiscoveryFeedItem[] = [];
  const max = clamp(limit);
  const maxPairs = Math.max(max, 1);
  const maxCreators = creators.length;
  const maxPosts = posts.length;
  let postIndex = 0;
  let creatorIndex = 0;

  while (out.length < maxPairs && (postIndex < maxPosts || creatorIndex < maxCreators)) {
    if (postIndex < maxPosts) {
      out.push({ kind: "post", post: posts[postIndex++] });
      if (out.length >= maxPairs) break;
    }
    if (creatorIndex < maxCreators) {
      out.push({ kind: "creator", creator: creators[creatorIndex++] });
    }
  }

  return out.slice(0, maxPairs);
}
