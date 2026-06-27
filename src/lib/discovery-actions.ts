// ============================================================================
// CABANA — protected discovery server actions (Phase 10A)
// ----------------------------------------------------------------------------
// Public explore/search reads that reuse the existing creator/post/engagement
// tables and RPCs. No schema changes. All heavy logic stays in the pure
// `cabana-discovery` module; these functions only fetch, merge, and map rows.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { optionalSupabaseAuth } from "@/integrations/supabase/optional-auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isSubscriptionActive } from "@/lib/cabana-entitlements";
import { mapFeedPost, type FeedPost } from "@/lib/cabana-posts";
import {
  deriveInterestTokens,
  normalizeDiscoveryQuery,
  rankCreatorsForDiscovery,
  rankPostsForDiscovery,
  type DiscoveryCreator,
  type DiscoveryPostCandidate,
  type DiscoverySearchResults,
  type DiscoverySnapshot,
} from "@/lib/cabana-discovery";

type Db = SupabaseClient<Database>;

type CreatorRow = Database["public"]["Tables"]["creator_profiles"]["Row"];
type PublicCreatorRow = Database["public"]["Views"]["public_creator_profiles"]["Row"];
type PostRow = Database["public"]["Tables"]["posts"]["Row"];

const CREATOR_SELECT = "id, handle, name, avatar_url, banner_url, bio, created_at, updated_at";
const PUBLIC_CREATOR_SELECT =
  "username, display_name, avatar_url, banner_url, bio, follower_count, following_count, post_count, verified";
const POST_SELECT =
  "id, creator_profile_id, caption, visibility, published_at, created_at, updated_at";
const MAX_CREATOR_ROWS = 200;
const MAX_POST_ROWS = 80;
const MAX_SEARCH_RESULTS = 12;

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function creatorKey(row: {
  username?: string | null;
  handle?: string | null;
  id?: string | null;
}): string {
  return (row.username ?? row.handle ?? row.id ?? "").toLowerCase();
}

function mapCreatorRows(rows: CreatorRow[], publicRows: PublicCreatorRow[]): DiscoveryCreator[] {
  const publicByKey = new Map<string, PublicCreatorRow>();
  for (const row of publicRows) {
    const key = creatorKey(row);
    if (key) publicByKey.set(key, row);
  }

  return rows
    .map((row): DiscoveryCreator | null => {
      const view = publicByKey.get(row.handle.toLowerCase());
      const username = row.handle.toLowerCase();
      const displayName = view?.display_name?.trim() || row.name || row.handle;
      return {
        profileId: row.id,
        username,
        displayName,
        avatarUrl: view?.avatar_url ?? row.avatar_url ?? null,
        bannerUrl: view?.banner_url ?? row.banner_url ?? null,
        bio: view?.bio ?? row.bio ?? null,
        followerCount: toNumber(view?.follower_count),
        followingCount: toNumber(view?.following_count),
        postCount: toNumber(view?.post_count),
        verified: view?.verified === true,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    })
    .filter((creator): creator is DiscoveryCreator => creator !== null);
}

function mergeCreators(...groups: readonly DiscoveryCreator[][]): DiscoveryCreator[] {
  const byId = new Map<string, DiscoveryCreator>();
  for (const group of groups) {
    for (const creator of group) byId.set(creator.profileId, creator);
  }
  return [...byId.values()];
}

async function fetchCreatorCandidates(supabase: Db): Promise<DiscoveryCreator[]> {
  const [creatorRes, publicRes] = await Promise.all([
    supabase
      .from("creator_profiles")
      .select(CREATOR_SELECT)
      .order("updated_at", { ascending: false })
      .limit(MAX_CREATOR_ROWS),
    supabase.from("public_creator_profiles").select(PUBLIC_CREATOR_SELECT).limit(MAX_CREATOR_ROWS),
  ]);

  if (creatorRes.error) throw new Error(creatorRes.error.message);
  if (publicRes.error) throw new Error(publicRes.error.message);

  return mapCreatorRows(
    (creatorRes.data ?? []) as CreatorRow[],
    (publicRes.data ?? []) as PublicCreatorRow[],
  );
}

async function fetchSeedCreators(supabase: Db, userId: string | null): Promise<DiscoveryCreator[]> {
  if (!userId) return [];

  const [followsRes, subscriptionsRes] = await Promise.all([
    supabase.from("follows").select("following_creator_id").eq("follower_id", userId),
    supabase
      .from("creator_subscriptions")
      .select("creator_profile_id, status, current_period_end")
      .eq("member_user_id", userId),
  ]);

  if (followsRes.error) throw new Error(followsRes.error.message);
  if (subscriptionsRes.error) throw new Error(subscriptionsRes.error.message);

  const subscribedIds = (subscriptionsRes.data ?? [])
    .filter((row) =>
      isSubscriptionActive(
        {
          status: row.status,
          currentPeriodEnd: row.current_period_end,
        },
        Date.now(),
      ),
    )
    .map((row) => row.creator_profile_id);
  const followIds = (followsRes.data ?? []).map((row) => row.following_creator_id);
  const seedIds = [...new Set([...followIds, ...subscribedIds])];
  if (seedIds.length === 0) return [];

  const { data: creatorRows, error } = await supabase
    .from("creator_profiles")
    .select(CREATOR_SELECT)
    .in("id", seedIds);
  if (error) throw new Error(error.message);
  return mapCreatorRows((creatorRows ?? []) as CreatorRow[], []);
}

async function fetchPostCandidates(
  supabase: Db,
  query?: string,
): Promise<DiscoveryPostCandidate[]> {
  const base = supabase
    .from("posts")
    .select(POST_SELECT)
    .order("published_at", { ascending: false })
    .limit(MAX_POST_ROWS);

  const queryBuilder = query ? base.ilike("caption", `%${query}%`) : base;
  const { data: rows, error } = await queryBuilder;
  if (error) throw new Error(error.message);

  const posts = (rows ?? []) as PostRow[];
  const states = await Promise.all(
    posts.map(async (post) => {
      const { data, error: stateError } = await supabase.rpc("post_engagement_state", {
        _post_id: post.id,
      });
      if (stateError) throw new Error(stateError.message);
      const state = first(data);
      return {
        likeCount: toNumber(state?.like_count),
        commentCount: toNumber(state?.comment_count),
        savedByMe: state?.saved_by_me === true,
        canEngage: state?.can_engage !== false,
      };
    }),
  );

  return posts.map((post, index) => ({
    postId: post.id,
    creatorProfileId: post.creator_profile_id,
    caption: post.caption,
    visibility: post.visibility,
    publishedAt: post.published_at,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    ...states[index],
  }));
}

async function hydratePosts(supabase: Db, postIds: readonly string[]): Promise<FeedPost[]> {
  const uniqueIds = [...new Set(postIds)].slice(0, MAX_SEARCH_RESULTS);
  const hydrated = await Promise.all(
    uniqueIds.map(async (postId) => {
      const { data, error } = await supabase.rpc("post_card", { _post_id: postId });
      if (error) throw new Error(error.message);
      const row = first(data);
      return row ? mapFeedPost(row as never) : null;
    }),
  );
  return hydrated.filter((post): post is FeedPost => post !== null);
}

async function getDiscoverySnapshotForUser(
  supabase: Db,
  userId: string | null,
): Promise<DiscoverySnapshot> {
  const [creators, seedCreators, postCandidates] = await Promise.all([
    fetchCreatorCandidates(supabase),
    fetchSeedCreators(supabase, userId),
    fetchPostCandidates(supabase),
  ]);

  const interestTokens = deriveInterestTokens(seedCreators);
  const excludedProfileIds = seedCreators.map((creator) => creator.profileId);
  const featuredCreators = rankCreatorsForDiscovery(creators, { mode: "featured", limit: 6 });
  const trendingCreators = rankCreatorsForDiscovery(creators, { mode: "trending", limit: 6 });
  const recentlyActiveCreators = rankCreatorsForDiscovery(creators, { mode: "recent", limit: 6 });
  const suggestedCreators = rankCreatorsForDiscovery(creators, {
    mode: "suggested",
    interestTokens,
    excludedProfileIds,
    limit: 6,
  });

  const trendingPostIds = rankPostsForDiscovery(postCandidates, {
    mode: "trending",
    interestTokens,
    boostProfileIds: excludedProfileIds,
    limit: 8,
  }).map((post) => post.postId);
  const explorePostIds = rankPostsForDiscovery(postCandidates, {
    mode: "recent",
    interestTokens,
    boostProfileIds: excludedProfileIds,
    limit: 6,
  }).map((post) => post.postId);

  const [trendingPosts, explorePosts] = await Promise.all([
    hydratePosts(supabase, trendingPostIds),
    hydratePosts(supabase, explorePostIds),
  ]);

  return {
    featuredCreators,
    trendingCreators,
    recentlyActiveCreators,
    suggestedCreators,
    trendingPosts,
    explorePosts,
  };
}

async function getSearchResultsForQuery(
  supabase: Db,
  query: string,
): Promise<DiscoverySearchResults> {
  const normalized = normalizeDiscoveryQuery(query);
  if (!normalized) return { creators: [], posts: [] };

  const phrase = `%${normalized}%`;
  const [handleRes, nameRes, bioRes, usernameRes, displayNameRes, publicBioRes, postRes] =
    await Promise.all([
      supabase
        .from("creator_profiles")
        .select(CREATOR_SELECT)
        .ilike("handle", phrase)
        .limit(MAX_SEARCH_RESULTS),
      supabase
        .from("creator_profiles")
        .select(CREATOR_SELECT)
        .ilike("name", phrase)
        .limit(MAX_SEARCH_RESULTS),
      supabase
        .from("creator_profiles")
        .select(CREATOR_SELECT)
        .ilike("bio", phrase)
        .limit(MAX_SEARCH_RESULTS),
      supabase
        .from("public_creator_profiles")
        .select(PUBLIC_CREATOR_SELECT)
        .ilike("username", phrase)
        .limit(MAX_SEARCH_RESULTS),
      supabase
        .from("public_creator_profiles")
        .select(PUBLIC_CREATOR_SELECT)
        .ilike("display_name", phrase)
        .limit(MAX_SEARCH_RESULTS),
      supabase
        .from("public_creator_profiles")
        .select(PUBLIC_CREATOR_SELECT)
        .ilike("bio", phrase)
        .limit(MAX_SEARCH_RESULTS),
      supabase
        .from("posts")
        .select(POST_SELECT)
        .ilike("caption", phrase)
        .order("published_at", { ascending: false })
        .limit(MAX_POST_ROWS),
    ]);

  const searchErrors = [
    handleRes.error,
    nameRes.error,
    bioRes.error,
    usernameRes.error,
    displayNameRes.error,
    publicBioRes.error,
    postRes.error,
  ].filter(Boolean);
  if (searchErrors.length > 0) {
    throw new Error((searchErrors[0] as { message: string }).message);
  }

  const mergedCreators = mergeCreators(
    mapCreatorRows(
      (handleRes.data ?? []) as CreatorRow[],
      (usernameRes.data ?? []) as PublicCreatorRow[],
    ),
    mapCreatorRows(
      (nameRes.data ?? []) as CreatorRow[],
      (displayNameRes.data ?? []) as PublicCreatorRow[],
    ),
    mapCreatorRows(
      (bioRes.data ?? []) as CreatorRow[],
      (publicBioRes.data ?? []) as PublicCreatorRow[],
    ),
  );
  const rankedCreators = rankCreatorsForDiscovery(mergedCreators, {
    mode: "search",
    query: normalized,
    limit: 8,
  });

  const postCandidates = (postRes.data ?? []) as PostRow[];
  const enrichedPosts = await Promise.all(
    postCandidates.map(async (post) => {
      const { data, error } = await supabase.rpc("post_engagement_state", {
        _post_id: post.id,
      });
      if (error) throw new Error(error.message);
      const state = first(data);
      return {
        postId: post.id,
        creatorProfileId: post.creator_profile_id,
        caption: post.caption,
        visibility: post.visibility,
        publishedAt: post.published_at,
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        likeCount: toNumber(state?.like_count),
        commentCount: toNumber(state?.comment_count),
        savedByMe: state?.saved_by_me === true,
        canEngage: state?.can_engage !== false,
      } satisfies DiscoveryPostCandidate;
    }),
  );
  const rankedPosts = rankPostsForDiscovery(enrichedPosts, {
    mode: "search",
    query: normalized,
    limit: 8,
  }).map((post) => post.postId);

  return {
    creators: rankedCreators,
    posts: await hydratePosts(supabase, rankedPosts),
  };
}

export const getDiscoverySnapshot = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .handler(async ({ context }): Promise<DiscoverySnapshot> => {
    return getDiscoverySnapshotForUser(context.supabase as Db, context.userId ?? null);
  });

export const getDiscoverySearchResults = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { query?: unknown }) => ({ query: normalizeDiscoveryQuery(raw?.query) }))
  .handler(async ({ context, data }): Promise<DiscoverySearchResults> => {
    return getSearchResultsForQuery(context.supabase as Db, data.query);
  });
