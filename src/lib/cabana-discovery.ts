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
  savedByMe: boolean;
  canEngage: boolean;
};

export type DiscoverySnapshot = {
  featuredCreators: DiscoveryCreator[];
  trendingCreators: DiscoveryCreator[];
  recentlyActiveCreators: DiscoveryCreator[];
  suggestedCreators: DiscoveryCreator[];
  trendingPosts: FeedPost[];
  explorePosts: FeedPost[];
};

export type DiscoverySearchResults = {
  creators: DiscoveryCreator[];
  posts: FeedPost[];
};

export type DiscoveryFeedItem =
  | { kind: "post"; post: FeedPost }
  | { kind: "creator"; creator: DiscoveryCreator };

export type DiscoveryCreatorRankMode = "featured" | "trending" | "recent" | "suggested" | "search";

export type DiscoveryPostRankMode = "trending" | "recent" | "search";

export type CreatorRankOptions = {
  mode?: DiscoveryCreatorRankMode;
  query?: string;
  interestTokens?: readonly string[];
  excludedProfileIds?: readonly string[];
  nowMs?: number;
  limit?: number;
};

export type PostRankOptions = {
  mode?: DiscoveryPostRankMode;
  query?: string;
  interestTokens?: readonly string[];
  boostProfileIds?: readonly string[];
  excludedPostIds?: readonly string[];
  nowMs?: number;
  limit?: number;
};

const DEFAULT_LIMIT = 6;
const DAY_MS = 86_400_000;
const TOKEN_SPLIT = /[^a-z0-9]+/g;

const CREATOR_MODE_WEIGHTS: Record<
  DiscoveryCreatorRankMode,
  {
    popularity: number;
    verified: number;
    recency: number;
    freshness: number;
    match: number;
  }
> = {
  featured: { popularity: 1.4, verified: 1.4, recency: 0.8, freshness: 0.4, match: 0.6 },
  trending: { popularity: 1.6, verified: 1.0, recency: 1.2, freshness: 0.2, match: 0.3 },
  recent: { popularity: 0.5, verified: 0.3, recency: 1.7, freshness: 1.4, match: 0.1 },
  suggested: { popularity: 0.8, verified: 0.5, recency: 0.9, freshness: 1.1, match: 1.8 },
  search: { popularity: 0.1, verified: 0.1, recency: 0.1, freshness: 0.05, match: 6 },
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
    .filter((token) => token.length >= 2);
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

function creatorFreshnessScore(creator: DiscoveryCreator, nowMs: number): number {
  return recencyScore(creator.createdAt, nowMs, 45, 12);
}

function creatorActivityScore(creator: DiscoveryCreator, nowMs: number): number {
  return recencyScore(creator.updatedAt, nowMs, 21, 12);
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
  },
): number {
  const weights = CREATOR_MODE_WEIGHTS[options.mode];
  return (
    creatorPopularityScore(creator) * weights.popularity +
    creatorVerifiedScore(creator) * weights.verified +
    creatorActivityScore(creator, options.nowMs) * weights.recency +
    creatorFreshnessScore(creator, options.nowMs) * weights.freshness +
    creatorMatchScore(creator, options.queryTokens, options.interestTokens) * weights.match
  );
}

function postSearchText(post: DiscoveryPostCandidate): string {
  return [post.caption, post.visibility, post.postId].join(" ");
}

function postEngagementScore(post: DiscoveryPostCandidate): number {
  return post.likeCount * 4 + post.commentCount * 5 + (post.canEngage ? 1 : 0);
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

export function rankCreatorsForDiscovery(
  creators: readonly DiscoveryCreator[],
  options: CreatorRankOptions = {},
): DiscoveryCreator[] {
  const nowMs = options.nowMs ?? Date.now();
  const mode = options.mode ?? "featured";
  const queryTokens = tokenizeDiscoveryQuery(options.query);
  const interestTokens = dedupe(options.interestTokens ?? [], (token) =>
    normalizeText(token),
  ).filter(Boolean);
  const excluded = new Set((options.excludedProfileIds ?? []).map((id) => id.toLowerCase()));

  return [...creators]
    .filter((creator) => !excluded.has(creator.profileId.toLowerCase()))
    .sort((a, b) => {
      const delta =
        scoreCreator(b, { mode, nowMs, queryTokens, interestTokens }) -
        scoreCreator(a, { mode, nowMs, queryTokens, interestTokens });
      if (delta !== 0) return delta;
      return parseTime(b.updatedAt) - parseTime(a.updatedAt);
    })
    .slice(0, clamp(options.limit));
}

export function rankPostsForDiscovery(
  posts: readonly DiscoveryPostCandidate[],
  options: PostRankOptions = {},
): DiscoveryPostCandidate[] {
  const nowMs = options.nowMs ?? Date.now();
  const mode = options.mode ?? "trending";
  const queryTokens = tokenizeDiscoveryQuery(options.query);
  const interestTokens = dedupe(options.interestTokens ?? [], (token) =>
    normalizeText(token),
  ).filter(Boolean);
  const boostProfileIds = new Set((options.boostProfileIds ?? []).map((id) => id.toLowerCase()));
  const excluded = new Set((options.excludedPostIds ?? []).map((id) => id.toLowerCase()));

  return [...posts]
    .filter((post) => !excluded.has(post.postId.toLowerCase()))
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
      return parseTime(b.publishedAt ?? b.createdAt) - parseTime(a.publishedAt ?? a.createdAt);
    })
    .slice(0, clamp(options.limit));
}

export function creatorQueryBoost(creator: DiscoveryCreator, query: string): number {
  return tokenOverlapScore(tokenizeDiscoveryQuery(query), creatorSearchText(creator));
}

export function postQueryBoost(post: DiscoveryPostCandidate, query: string): number {
  return tokenOverlapScore(tokenizeDiscoveryQuery(query), postSearchText(post));
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
