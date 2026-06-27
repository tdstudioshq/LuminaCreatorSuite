import { describe, expect, it } from "vitest";
import {
  creatorQueryBoost,
  deriveInterestTokens,
  interleaveDiscoveryFeed,
  normalizeDiscoveryQuery,
  postQueryBoost,
  rankCreatorsForDiscovery,
  rankPostsForDiscovery,
  tokenizeDiscoveryQuery,
  type DiscoveryPostCandidate,
  type DiscoveryCreator,
} from "./cabana-discovery";
import type { FeedPost } from "./cabana-posts";

const NOW = Date.parse("2026-06-26T12:00:00Z");

function creator(overrides: Partial<DiscoveryCreator> = {}): DiscoveryCreator {
  return {
    profileId: overrides.profileId ?? crypto.randomUUID(),
    username: overrides.username ?? "creator",
    displayName: overrides.displayName ?? "Creator",
    avatarUrl: overrides.avatarUrl ?? null,
    bannerUrl: overrides.bannerUrl ?? null,
    bio: overrides.bio ?? null,
    followerCount: overrides.followerCount ?? 0,
    followingCount: overrides.followingCount ?? 0,
    postCount: overrides.postCount ?? 0,
    verified: overrides.verified ?? false,
    createdAt: overrides.createdAt ?? "2026-06-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-06-01T00:00:00Z",
  };
}

function post(overrides: Partial<DiscoveryPostCandidate> = {}): DiscoveryPostCandidate {
  return {
    postId: overrides.postId ?? crypto.randomUUID(),
    creatorProfileId: overrides.creatorProfileId ?? crypto.randomUUID(),
    caption: overrides.caption ?? "",
    visibility: overrides.visibility ?? "public",
    publishedAt: overrides.publishedAt ?? "2026-06-01T00:00:00Z",
    createdAt: overrides.createdAt ?? "2026-06-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-06-01T00:00:00Z",
    likeCount: overrides.likeCount ?? 0,
    commentCount: overrides.commentCount ?? 0,
    savedByMe: overrides.savedByMe ?? false,
    canEngage: overrides.canEngage ?? true,
  };
}

function feedPost(postId: string): FeedPost {
  return {
    postId,
    username: "creator",
    displayName: "Creator",
    avatarUrl: null,
    caption: "",
    visibility: "public",
    publishedAt: "2026-06-01T00:00:00Z",
    locked: false,
    media: [],
  };
}

describe("normalizeDiscoveryQuery", () => {
  it("normalizes whitespace, case, and hashtag prefixes", () => {
    expect(normalizeDiscoveryQuery("  #Coffee  Shop ")).toBe("coffee shop");
  });

  it("rejects non-string input", () => {
    expect(() => normalizeDiscoveryQuery(123)).toThrow(/search query/i);
  });
});

describe("tokenizeDiscoveryQuery", () => {
  it("splits into stable tokens and drops short noise", () => {
    expect(tokenizeDiscoveryQuery("  Café #New 2026! x ")).toEqual(["cafe", "new", "2026"]);
  });
});

describe("deriveInterestTokens", () => {
  it("collects tokens from username, display name, and bio", () => {
    expect(
      deriveInterestTokens([
        creator({ username: "mira", displayName: "Mira Solène", bio: "Coffee and fashion" }),
        creator({ username: "mira", displayName: "Mira Solène", bio: "Coffee and fashion" }),
      ]),
    ).toEqual(expect.arrayContaining(["mira", "solene", "coffee", "fashion"]));
  });
});

describe("creator ranking", () => {
  it("boosts search matches and excludes seeded creators", () => {
    const creators = [
      creator({
        profileId: "seed",
        username: "seed",
        displayName: "Seed Creator",
        followerCount: 50_000,
        postCount: 200,
        verified: true,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      }),
      creator({
        profileId: "coffee",
        username: "bean",
        displayName: "Coffee Bean",
        bio: "Coffee rituals and studio logs",
        followerCount: 2_000,
        postCount: 80,
        verified: false,
        createdAt: "2026-06-20T00:00:00Z",
        updatedAt: "2026-06-25T00:00:00Z",
      }),
      creator({
        profileId: "popular",
        username: "popular",
        displayName: "Popular Creator",
        followerCount: 100_000,
        postCount: 400,
        verified: true,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:00Z",
      }),
    ];

    const ranked = rankCreatorsForDiscovery(creators, {
      mode: "search",
      query: "coffee",
      excludedProfileIds: ["seed"],
      nowMs: NOW,
      limit: 5,
    });

    expect(ranked.map((item) => item.profileId)).toEqual(["coffee", "popular"]);
    expect(creatorQueryBoost(creators[1], "coffee")).toBeGreaterThan(
      creatorQueryBoost(creators[2], "coffee"),
    );
  });
});

describe("post ranking", () => {
  it("boosts query matches and personalized creator boosts", () => {
    const posts = [
      post({
        postId: "older-popular",
        creatorProfileId: "popular-creator",
        caption: "Studio routine",
        likeCount: 20,
        commentCount: 4,
        publishedAt: "2026-05-01T00:00:00Z",
      }),
      post({
        postId: "match",
        creatorProfileId: "seed-creator",
        caption: "Coffee and camera setup",
        likeCount: 2,
        commentCount: 1,
        savedByMe: true,
        publishedAt: "2026-06-25T00:00:00Z",
      }),
      post({
        postId: "ignored",
        creatorProfileId: "ignored-creator",
        caption: "Nothing here",
        likeCount: 100,
        commentCount: 0,
        publishedAt: "2026-06-10T00:00:00Z",
      }),
    ];

    const ranked = rankPostsForDiscovery(posts, {
      mode: "search",
      query: "coffee",
      boostProfileIds: ["seed-creator"],
      excludedPostIds: ["ignored"],
      nowMs: NOW,
      limit: 5,
    });

    expect(ranked.map((item) => item.postId)).toEqual(["match", "older-popular"]);
    expect(postQueryBoost(posts[1], "coffee")).toBeGreaterThan(postQueryBoost(posts[0], "coffee"));
  });
});

describe("interleaveDiscoveryFeed", () => {
  it("alternates posts and creators up to the limit", () => {
    const items = interleaveDiscoveryFeed(
      [feedPost("p1"), feedPost("p2")],
      [creator({ profileId: "c1" }), creator({ profileId: "c2" })],
      3,
    );

    expect(items).toEqual([
      { kind: "post", post: expect.objectContaining({ postId: "p1" }) },
      { kind: "creator", creator: expect.objectContaining({ profileId: "c1" }) },
      { kind: "post", post: expect.objectContaining({ postId: "p2" }) },
    ]);
  });
});
