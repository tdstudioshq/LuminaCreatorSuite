import { describe, expect, it } from "vitest";
import {
  countDiscoverySearchResults,
  creatorQueryBoost,
  deriveInterestTokens,
  DISCOVERY_TIME_WINDOWS,
  interleaveDiscoveryFeed,
  labelSuggestedCreators,
  normalizeDiscoveryQuery,
  normalizeDiscoveryTimeWindow,
  postQueryBoost,
  rankCreatorsForDiscovery,
  rankPostsForDiscovery,
  suggestedCreatorReason,
  summarizeCreatorPostSignals,
  tokenizeDiscoveryQuery,
  type DiscoveryCreator,
  type DiscoveryPostCandidate,
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
    saveCount: overrides.saveCount ?? 0,
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

  it("normalizes empty values to an empty query", () => {
    expect(normalizeDiscoveryQuery(null)).toBe("");
    expect(normalizeDiscoveryQuery(undefined)).toBe("");
  });
});

describe("normalizeDiscoveryTimeWindow", () => {
  it("defaults to seven days and accepts every supported window", () => {
    expect(normalizeDiscoveryTimeWindow(undefined)).toBe("7d");
    expect(normalizeDiscoveryTimeWindow("")).toBe("7d");
    for (const window of DISCOVERY_TIME_WINDOWS) {
      expect(normalizeDiscoveryTimeWindow(window)).toBe(window);
    }
  });

  it("rejects unsupported windows", () => {
    expect(() => normalizeDiscoveryTimeWindow("90d")).toThrow(/time window/i);
    expect(() => normalizeDiscoveryTimeWindow(7)).toThrow(/time window/i);
  });
});

describe("tokenizeDiscoveryQuery", () => {
  it("splits into stable tokens and drops short noise", () => {
    expect(tokenizeDiscoveryQuery("  Café #New 2026! x ")).toEqual(["cafe", "new", "2026"]);
  });

  it("deduplicates tokens and removes generic discovery noise", () => {
    expect(tokenizeDiscoveryQuery("creator coffee coffee and the studio")).toEqual([
      "coffee",
      "studio",
    ]);
    expect(tokenizeDiscoveryQuery("")).toEqual([]);
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

  it("filters activity by time window and uses a deterministic id tie-breaker", () => {
    const creators = [
      creator({
        profileId: "z-recent",
        updatedAt: "2026-06-26T10:00:00Z",
        createdAt: "2026-06-26T10:00:00Z",
      }),
      creator({
        profileId: "a-recent",
        updatedAt: "2026-06-26T10:00:00Z",
        createdAt: "2026-06-26T10:00:00Z",
      }),
      creator({
        profileId: "old",
        updatedAt: "2026-06-20T10:00:00Z",
        createdAt: "2026-06-20T10:00:00Z",
      }),
      creator({ profileId: "invalid", updatedAt: "not-a-date", createdAt: "not-a-date" }),
    ];

    expect(
      rankCreatorsForDiscovery(creators, {
        mode: "trending",
        timeWindow: "24h",
        nowMs: NOW,
        limit: 10,
      }).map((item) => item.profileId),
    ).toEqual(["a-recent", "z-recent"]);
    expect(
      rankCreatorsForDiscovery(creators, {
        mode: "trending",
        timeWindow: "all",
        nowMs: NOW,
        limit: Number.POSITIVE_INFINITY,
      }),
    ).toHaveLength(4);
  });

  it("normalizes and deduplicates interest tokens", () => {
    const creators = [
      creator({ profileId: "coffee", bio: "Coffee studio" }),
      creator({ profileId: "travel", bio: "Travel journal" }),
    ];
    expect(
      rankCreatorsForDiscovery(creators, {
        mode: "suggested",
        interestTokens: [" COFFEE ", "coffee", ""],
        nowMs: NOW,
        limit: 2,
      })[0].profileId,
    ).toBe("coffee");
  });

  it("aggregates post engagement and latest activity for creator ranking", () => {
    const posts = [
      post({
        creatorProfileId: "engaged",
        publishedAt: "2026-06-26T11:00:00Z",
        likeCount: 10,
        commentCount: 4,
        saveCount: 2,
        savedByMe: true,
      }),
      post({
        creatorProfileId: "engaged",
        publishedAt: "2026-06-25T11:00:00Z",
        likeCount: -2,
        commentCount: -1,
        saveCount: -3,
      }),
      post({
        creatorProfileId: "quiet",
        publishedAt: "2026-06-26T10:00:00Z",
      }),
    ];
    const signals = summarizeCreatorPostSignals(posts);
    expect(signals.engaged).toEqual({
      likeCount: 10,
      commentCount: 4,
      saveCount: 2,
      latestPostAt: "2026-06-26T11:00:00Z",
    });

    const ranked = rankCreatorsForDiscovery(
      [
        creator({
          profileId: "quiet",
          updatedAt: "2026-01-01T00:00:00Z",
          followerCount: 1,
        }),
        creator({
          profileId: "engaged",
          updatedAt: "2026-01-01T00:00:00Z",
          followerCount: 1,
        }),
      ],
      {
        mode: "trending",
        postSignals: signals,
        timeWindow: "24h",
        nowMs: NOW,
        limit: 2,
      },
    );
    expect(ranked.map((item) => item.profileId)).toEqual(["engaged", "quiet"]);
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

  it("uses saves as engagement and filters posts by the selected window", () => {
    const posts = [
      post({
        postId: "saved",
        publishedAt: "2026-06-26T11:00:00Z",
        saveCount: 10,
        canEngage: false,
      }),
      post({
        postId: "liked",
        publishedAt: "2026-06-26T11:00:00Z",
        likeCount: 5,
        savedByMe: true,
      }),
      post({
        postId: "old",
        publishedAt: null,
        createdAt: "2026-06-01T00:00:00Z",
        likeCount: 100,
      }),
    ];

    expect(
      rankPostsForDiscovery(posts, {
        mode: "trending",
        timeWindow: "24h",
        nowMs: NOW,
        limit: 10,
      }).map((item) => item.postId),
    ).toEqual(["saved", "liked"]);
    expect(
      rankPostsForDiscovery(posts, {
        mode: "trending",
        timeWindow: "all",
        nowMs: NOW,
        limit: 10,
      }).map((item) => item.postId),
    ).toContain("old");
  });

  it("normalizes interest boosts and uses deterministic post tie-breakers", () => {
    const posts = [
      post({ postId: "z", caption: "Coffee", publishedAt: "2026-06-26T11:00:00Z" }),
      post({ postId: "a", caption: "Coffee", publishedAt: "2026-06-26T11:00:00Z" }),
    ];
    expect(
      rankPostsForDiscovery(posts, {
        mode: "recent",
        interestTokens: [" COFFEE ", "coffee", ""],
        nowMs: NOW,
        limit: 2,
      }).map((item) => item.postId),
    ).toEqual(["a", "z"]);
  });
});

describe("suggested creator reasons", () => {
  const candidate = creator({
    profileId: "candidate",
    username: "dailybrew",
    displayName: "Daily Brew",
    bio: "Coffee rituals",
    updatedAt: "2026-06-25T12:00:00Z",
  });
  const followed = creator({
    profileId: "followed",
    username: "beanclub",
    displayName: "Bean Club",
    bio: "Coffee guides",
  });
  const subscribed = creator({
    profileId: "subscribed",
    username: "studio",
    displayName: "Studio Notes",
    bio: "Coffee studio",
  });

  it("prefers supported network evidence, including correct singular/plural labels", () => {
    expect(
      suggestedCreatorReason(candidate, {
        followedByNetworkCounts: { candidate: 2 },
        followedCreators: [followed],
        nowMs: NOW,
      }),
    ).toEqual({
      kind: "followed_by_network",
      label: "Followed by 2 people you follow",
    });
    expect(
      suggestedCreatorReason(candidate, {
        followedByNetworkCounts: { candidate: 1 },
        nowMs: NOW,
      }).label,
    ).toBe("Followed by 1 person you follow");
  });

  it("explains interest overlap from follows and subscriptions", () => {
    expect(
      suggestedCreatorReason(candidate, {
        followedCreators: [followed],
        nowMs: NOW,
      }),
    ).toEqual({
      kind: "because_you_follow",
      label: "Because you follow @beanclub",
    });
    expect(
      suggestedCreatorReason(candidate, {
        subscribedCreators: [subscribed],
        nowMs: NOW,
      }),
    ).toEqual({
      kind: "subscription_activity",
      label: "Similar to creators you subscribe to",
    });
    expect(
      suggestedCreatorReason(candidate, {
        subscriptionActivityCounts: { candidate: 3.8 },
        nowMs: NOW,
      }),
    ).toEqual({
      kind: "subscription_activity",
      label: "Active subscriber community",
    });
  });

  it("falls back to recent activity and popularity", () => {
    expect(suggestedCreatorReason(candidate, { nowMs: NOW })).toEqual({
      kind: "recently_active",
      label: "Recently active",
    });
    expect(
      suggestedCreatorReason(creator({ profileId: "older", updatedAt: "2026-01-01T00:00:00Z" }), {
        nowMs: NOW,
      }),
    ).toEqual({
      kind: "popular_creator",
      label: "Popular creator",
    });
  });

  it("labels a ranked list without changing creator order", () => {
    const result = labelSuggestedCreators([candidate], {
      followedCreators: [followed],
      nowMs: NOW,
    });
    expect(result).toEqual([
      {
        creator: candidate,
        reason: {
          kind: "because_you_follow",
          label: "Because you follow @beanclub",
        },
      },
    ]);
  });
});

describe("search result counts", () => {
  it("counts grouped and total results", () => {
    expect(
      countDiscoverySearchResults({
        creators: [creator({ profileId: "c1" })],
        posts: [feedPost("p1"), feedPost("p2")],
      }),
    ).toEqual({ creators: 1, posts: 2, total: 3 });
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

  it("continues with the remaining item type and clamps invalid limits", () => {
    expect(
      interleaveDiscoveryFeed(
        [feedPost("p1"), feedPost("p2")],
        [creator({ profileId: "c1" })],
        10,
      ).map((item) => item.kind),
    ).toEqual(["post", "creator", "post"]);
    expect(interleaveDiscoveryFeed([], [creator({ profileId: "c1" })], 0)).toHaveLength(1);
  });
});
