import { describe, expect, it } from "vitest";
import {
  type FeedPost,
  CAPTION_MAX,
  assertStatusTransition,
  feedPostHasVideo,
  mapFeedMedia,
  mapFeedPost,
  mapPost,
  mapPostMedia,
  normalizeCaption,
  partitionFeedMediaIds,
  normalizeNewPost,
  normalizePostCurrency,
  normalizePostMediaInput,
  normalizePostPriceCents,
  normalizePostVisibility,
  resolveBatchPostMedia,
  resolvePublishPatch,
} from "./cabana-posts";

describe("normalizeCaption", () => {
  it("treats null/undefined as empty", () => {
    expect(normalizeCaption(null)).toBe("");
    expect(normalizeCaption(undefined)).toBe("");
  });

  it("trims whitespace", () => {
    expect(normalizeCaption("  hello  ")).toBe("hello");
  });

  it("rejects non-string input", () => {
    expect(() => normalizeCaption(42)).toThrow(/must be text/i);
  });

  it("rejects captions over the limit", () => {
    expect(() => normalizeCaption("x".repeat(CAPTION_MAX + 1))).toThrow(/characters or fewer/i);
  });

  it("accepts a caption at the limit", () => {
    const max = "x".repeat(CAPTION_MAX);
    expect(normalizeCaption(max)).toBe(max);
  });
});

describe("normalizePostVisibility", () => {
  it("accepts all four tiers (Phase 6 adds purchase)", () => {
    expect(normalizePostVisibility("public")).toBe("public");
    expect(normalizePostVisibility("followers")).toBe("followers");
    expect(normalizePostVisibility("subscribers")).toBe("subscribers");
    expect(normalizePostVisibility("purchase")).toBe("purchase");
  });

  it("rejects unknown values", () => {
    expect(() => normalizePostVisibility("everyone")).toThrow(/public.*followers.*subscribers/i);
    expect(() => normalizePostVisibility(undefined)).toThrow(/public.*followers.*subscribers/i);
  });
});

describe("normalizePostCurrency", () => {
  it("defaults to USD and uppercases valid codes", () => {
    expect(normalizePostCurrency(null)).toBe("USD");
    expect(normalizePostCurrency("")).toBe("USD");
    expect(normalizePostCurrency("eur")).toBe("EUR");
  });

  it("rejects malformed codes", () => {
    expect(() => normalizePostCurrency("US")).toThrow(/3-letter/i);
    expect(() => normalizePostCurrency(42)).toThrow(/3-letter/i);
  });
});

describe("normalizePostPriceCents", () => {
  it("accepts a positive integer number of cents", () => {
    expect(normalizePostPriceCents(900)).toBe(900);
  });

  it("rejects non-integers, zero/negatives, and oversized prices", () => {
    expect(() => normalizePostPriceCents(9.99)).toThrow(/whole number of cents/i);
    expect(() => normalizePostPriceCents(0)).toThrow(/above zero/i);
    expect(() => normalizePostPriceCents(-5)).toThrow(/above zero/i);
    expect(() => normalizePostPriceCents(100_000_001)).toThrow(/too large/i);
  });
});

describe("normalizeNewPost", () => {
  it("normalizes caption + visibility and forces a null price for free posts", () => {
    expect(normalizeNewPost({ caption: "  hi ", visibility: "followers" })).toEqual({
      caption: "hi",
      visibility: "followers",
      priceCents: null,
      currency: "USD",
    });
  });

  it("requires a positive price for a purchase post", () => {
    expect(normalizeNewPost({ caption: "x", visibility: "purchase", priceCents: 1500 })).toEqual({
      caption: "x",
      visibility: "purchase",
      priceCents: 1500,
      currency: "USD",
    });
    expect(() => normalizeNewPost({ caption: "x", visibility: "purchase" })).toThrow(
      /whole number of cents/i,
    );
    expect(() => normalizeNewPost({ caption: "x", visibility: "purchase", priceCents: 0 })).toThrow(
      /above zero/i,
    );
  });

  it("ignores a stray price on a non-purchase post", () => {
    expect(
      normalizeNewPost({ caption: "x", visibility: "public", priceCents: 999 }).priceCents,
    ).toBeNull();
  });

  it("propagates visibility errors", () => {
    expect(() => normalizeNewPost({ caption: "hi", visibility: "everyone" })).toThrow();
  });
});

describe("normalizePostMediaInput", () => {
  const base = {
    kind: "image",
    storagePath: "user/post/a.jpg",
    mimeType: "image/jpeg",
    position: 0,
    width: 800,
    height: 600,
  };

  it("accepts a valid image item", () => {
    expect(normalizePostMediaInput(base)).toEqual({
      kind: "image",
      storagePath: "user/post/a.jpg",
      mimeType: "image/jpeg",
      position: 0,
      width: 800,
      height: 600,
    });
  });

  it("defaults position to 0 and dimensions to null", () => {
    expect(
      normalizePostMediaInput({ kind: "image", storagePath: "u/p/x.png", mimeType: "image/png" }),
    ).toEqual({
      kind: "image",
      storagePath: "u/p/x.png",
      mimeType: "image/png",
      position: 0,
      width: null,
      height: null,
    });
  });

  it("trims the storage path", () => {
    expect(normalizePostMediaInput({ ...base, storagePath: "  u/p/a.jpg  " }).storagePath).toBe(
      "u/p/a.jpg",
    );
  });

  it("rejects non-image kinds", () => {
    expect(() => normalizePostMediaInput({ ...base, kind: "video" })).toThrow(/only image/i);
  });

  it("rejects empty or missing storage paths", () => {
    expect(() => normalizePostMediaInput({ ...base, storagePath: "   " })).toThrow(/storage path/i);
    expect(() => normalizePostMediaInput({ ...base, storagePath: 5 })).toThrow(/storage path/i);
  });

  it("rejects path traversal", () => {
    expect(() => normalizePostMediaInput({ ...base, storagePath: "u/../etc" })).toThrow(/invalid/i);
  });

  it("rejects disallowed mime types", () => {
    expect(() => normalizePostMediaInput({ ...base, mimeType: "application/pdf" })).toThrow(
      /unsupported image type/i,
    );
    expect(() => normalizePostMediaInput({ ...base, mimeType: 1 })).toThrow(/unsupported image/i);
  });

  it("rejects invalid positions", () => {
    expect(() => normalizePostMediaInput({ ...base, position: -1 })).toThrow(/position/i);
    expect(() => normalizePostMediaInput({ ...base, position: 1.5 })).toThrow(/position/i);
  });

  it("rejects non-positive dimensions", () => {
    expect(() => normalizePostMediaInput({ ...base, width: 0 })).toThrow(/dimensions/i);
    expect(() => normalizePostMediaInput({ ...base, height: -3 })).toThrow(/dimensions/i);
    expect(() => normalizePostMediaInput({ ...base, width: 1.2 })).toThrow(/dimensions/i);
  });
});

describe("assertStatusTransition", () => {
  it("allows valid transitions", () => {
    expect(assertStatusTransition("draft", "published")).toBe("published");
    expect(assertStatusTransition("published", "archived")).toBe("archived");
    expect(assertStatusTransition("archived", "draft")).toBe("draft");
    expect(assertStatusTransition("scheduled", "draft")).toBe("draft");
  });

  it("rejects no-op transitions", () => {
    expect(() => assertStatusTransition("draft", "draft")).toThrow(/already draft/i);
  });

  it("rejects disallowed transitions", () => {
    expect(() => assertStatusTransition("archived", "published")).toThrow(/cannot change/i);
    expect(() => assertStatusTransition("published", "scheduled")).toThrow(/cannot change/i);
  });
});

describe("resolvePublishPatch", () => {
  it("returns a published patch with the injected timestamp", () => {
    expect(resolvePublishPatch("draft", "2026-06-25T00:00:00.000Z")).toEqual({
      status: "published",
      published_at: "2026-06-25T00:00:00.000Z",
    });
  });

  it("rejects publishing an already-published post", () => {
    expect(() => resolvePublishPatch("published", "2026-06-25T00:00:00.000Z")).toThrow(
      /already published/i,
    );
  });
});

describe("mapPost / mapPostMedia", () => {
  it("maps a post row to camelCase", () => {
    expect(
      mapPost({
        id: "p1",
        creator_profile_id: "c1",
        caption: "hi",
        visibility: "purchase",
        price_cents: 1500,
        currency: "USD",
        status: "published",
        published_at: "2026-06-25T00:00:00Z",
        scheduled_at: null,
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-02T00:00:00Z",
      }),
    ).toEqual({
      id: "p1",
      creatorProfileId: "c1",
      caption: "hi",
      visibility: "purchase",
      priceCents: 1500,
      currency: "USD",
      status: "published",
      publishedAt: "2026-06-25T00:00:00Z",
      scheduledAt: null,
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-02T00:00:00Z",
    });
  });

  it("maps a media row to camelCase", () => {
    expect(
      mapPostMedia({
        id: "m1",
        post_id: "p1",
        owner_user_id: "u1",
        kind: "image",
        storage_bucket: "post-media",
        storage_path: "u1/p1/a.jpg",
        mime_type: "image/jpeg",
        width: 100,
        height: 200,
        position: 2,
        processing_status: "ready",
        stream_video_id: null,
        created_at: "2026-06-01T00:00:00Z",
      }),
    ).toEqual({
      id: "m1",
      kind: "image",
      storagePath: "u1/p1/a.jpg",
      mimeType: "image/jpeg",
      width: 100,
      height: 200,
      position: 2,
    });
  });
});

describe("mapFeedMedia", () => {
  it("returns an empty array for non-array input", () => {
    expect(mapFeedMedia(null)).toEqual([]);
    expect(mapFeedMedia("nope")).toEqual([]);
  });

  it("skips malformed entries", () => {
    const out = mapFeedMedia([
      null,
      "x",
      { id: 1 },
      { kind: "image", position: 0 },
      { id: "m2", kind: "image", position: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("m2");
  });

  it("preserves video/audio kinds and defaults others to image", () => {
    const out = mapFeedMedia([
      { id: "v", kind: "video", position: 1 },
      { id: "a", kind: "audio", position: 2 },
      { id: "u", kind: "weird", position: 0 },
    ]);
    expect(out.map((m) => [m.id, m.kind])).toEqual([
      ["u", "image"],
      ["v", "video"],
      ["a", "audio"],
    ]);
  });

  it("defaults optional fields and sorts by position", () => {
    const out = mapFeedMedia([
      { id: "b", position: 5 },
      { id: "a", width: 10, height: 20, position: 1 },
    ]);
    expect(out[0]).toEqual({ id: "a", kind: "image", width: 10, height: 20, position: 1 });
    expect(out[1]).toEqual({ id: "b", kind: "image", width: null, height: null, position: 5 });
  });
});

describe("partitionFeedMediaIds / feedPostHasVideo", () => {
  const post = (
    postId: string,
    kinds: ("image" | "video" | "audio")[],
    locked = false,
  ): FeedPost => ({
    postId,
    username: "aurora",
    displayName: "Aurora",
    avatarUrl: null,
    caption: "",
    visibility: "public",
    publishedAt: null,
    locked,
    media: kinds.map((kind, i) => ({
      id: `${postId}-${i}`,
      kind,
      width: null,
      height: null,
      position: i,
    })),
  });

  it("detects video from the feed media descriptors", () => {
    expect(feedPostHasVideo(post("p", ["video"]))).toBe(true);
    expect(feedPostHasVideo(post("p", ["image", "image"]))).toBe(false);
    expect(feedPostHasVideo(post("p", []))).toBe(false);
  });

  it("routes video posts and image posts to their own batches", () => {
    expect(partitionFeedMediaIds([post("v", ["video"]), post("i", ["image"])])).toEqual({
      imagePostIds: ["i"],
      videoPostIds: ["v"],
    });
  });

  // Asking for media the server will refuse is waste, and it signals intent.
  it("excludes locked posts from both batches", () => {
    expect(partitionFeedMediaIds([post("v", ["video"], true), post("i", ["image"], true)])).toEqual(
      {
        imagePostIds: [],
        videoPostIds: [],
      },
    );
  });

  it("excludes caption-only posts from both batches", () => {
    expect(partitionFeedMediaIds([post("c", [])])).toEqual({
      imagePostIds: [],
      videoPostIds: [],
    });
  });

  // The media-mix rule forbids this, but deriving each list independently means
  // a post that somehow carried both still renders both rather than losing one.
  it("puts a mixed post in both batches rather than dropping either", () => {
    expect(partitionFeedMediaIds([post("m", ["video", "image"])])).toEqual({
      imagePostIds: ["m"],
      videoPostIds: ["m"],
    });
  });

  it("treats audio as non-video media", () => {
    expect(partitionFeedMediaIds([post("a", ["audio"])])).toEqual({
      imagePostIds: ["a"],
      videoPostIds: [],
    });
  });

  it("handles an empty feed", () => {
    expect(partitionFeedMediaIds([])).toEqual({ imagePostIds: [], videoPostIds: [] });
  });
});

describe("mapFeedPost", () => {
  it("maps a full feed row", () => {
    expect(
      mapFeedPost({
        post_id: "p1",
        username: "aurora",
        display_name: "Aurora",
        avatar_url: "https://x/a.png",
        caption: "hi",
        visibility: "followers",
        published_at: "2026-06-25T00:00:00Z",
        locked: false,
        media: [{ id: "m1", kind: "image", position: 0 }],
      }),
    ).toEqual({
      postId: "p1",
      username: "aurora",
      displayName: "Aurora",
      avatarUrl: "https://x/a.png",
      caption: "hi",
      visibility: "followers",
      publishedAt: "2026-06-25T00:00:00Z",
      locked: false,
      media: [{ id: "m1", kind: "image", width: null, height: null, position: 0 }],
    });
  });

  it("falls back display name to username and caption to empty", () => {
    const out = mapFeedPost({
      post_id: "p2",
      username: "nova",
      display_name: null,
      avatar_url: null,
      caption: null,
      visibility: "public",
      published_at: null,
    });
    expect(out.displayName).toBe("nova");
    expect(out.caption).toBe("");
    expect(out.locked).toBe(false);
    expect(out.media).toEqual([]);
  });

  it("marks a locked followers stub", () => {
    const out = mapFeedPost({
      post_id: "p3",
      username: "nova",
      display_name: "Nova",
      avatar_url: null,
      caption: "",
      visibility: "followers",
      published_at: "2026-06-25T00:00:00Z",
      locked: true,
      media: [],
    });
    expect(out.locked).toBe(true);
    expect(out.media).toEqual([]);
  });
});

describe("resolveBatchPostMedia", () => {
  type Row = { post_id: string; id: string; position: number };
  type Signed = { id: string; url: string; position: number };

  /** Build an injectable repo whose `canView` allows only `authorized` ids. */
  function repo(opts: {
    authorized: string[];
    rows: Row[];
    fetchCalls?: string[][];
    unsignable?: string[];
  }) {
    return {
      canView: async (postId: string) => opts.authorized.includes(postId),
      fetchMedia: async (ids: string[]) => {
        opts.fetchCalls?.push(ids);
        // Real repo scopes to `ids`; default to honoring that contract.
        return opts.rows.filter((r) => ids.includes(r.post_id));
      },
      postIdOf: (r: Row) => r.post_id,
      sign: async (r: Row): Promise<Signed | null> =>
        opts.unsignable?.includes(r.id)
          ? null
          : { id: r.id, url: `signed:${r.id}`, position: r.position },
      positionOf: (s: Signed) => s.position,
    };
  }

  it("signs media only for authorized posts; an unauthorized id yields no url", async () => {
    const fetchCalls: string[][] = [];
    const out = await resolveBatchPostMedia<Row, Signed>(["allowed", "denied"], {
      ...repo({
        authorized: ["allowed"],
        rows: [{ post_id: "allowed", id: "m1", position: 0 }],
        fetchCalls,
      }),
    });
    expect(out.allowed).toEqual([{ id: "m1", url: "signed:m1", position: 0 }]);
    expect(out.denied).toEqual([]); // never authorized → never signed
    // The service-role read was scoped to the authorized id only (no leak).
    expect(fetchCalls).toEqual([["allowed"]]);
  });

  it("drops an over-returned row for an unauthorized post (defense in depth)", async () => {
    // Even if the repository ignores the authorized filter and returns a denied
    // post's media, it must never be signed/surfaced.
    const out = await resolveBatchPostMedia<Row, Signed>(["ok", "denied"], {
      canView: async (id) => id === "ok",
      fetchMedia: async () => [
        { post_id: "ok", id: "a", position: 1 },
        { post_id: "denied", id: "b", position: 0 },
      ],
      postIdOf: (r) => r.post_id,
      sign: async (r) => ({ id: r.id, url: `signed:${r.id}`, position: r.position }),
      positionOf: (s) => s.position,
    });
    expect(out.ok.map((m) => m.id)).toEqual(["a"]);
    expect(out.denied).toEqual([]);
  });

  it("sorts each post's media by position and returns [] for media-less posts", async () => {
    const out = await resolveBatchPostMedia<Row, Signed>(["p1", "p2"], {
      ...repo({
        authorized: ["p1", "p2"],
        rows: [
          { post_id: "p1", id: "b", position: 2 },
          { post_id: "p1", id: "a", position: 1 },
        ],
      }),
    });
    expect(out.p1.map((m) => m.id)).toEqual(["a", "b"]);
    expect(out.p2).toEqual([]);
  });

  it("omits media whose signing fails", async () => {
    const out = await resolveBatchPostMedia<Row, Signed>(["p1"], {
      ...repo({
        authorized: ["p1"],
        rows: [
          { post_id: "p1", id: "ok", position: 0 },
          { post_id: "p1", id: "bad", position: 1 },
        ],
        unsignable: ["bad"],
      }),
    });
    expect(out.p1.map((m) => m.id)).toEqual(["ok"]);
  });

  it("returns an empty map for no ids, and all-empty entries when none authorized", async () => {
    expect(
      await resolveBatchPostMedia<Row, Signed>([], repo({ authorized: [], rows: [] })),
    ).toEqual({});
    const none = await resolveBatchPostMedia<Row, Signed>(["x", "y"], {
      ...repo({ authorized: [], rows: [{ post_id: "x", id: "m", position: 0 }] }),
    });
    expect(none).toEqual({ x: [], y: [] });
  });
});
