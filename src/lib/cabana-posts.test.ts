import { describe, expect, it } from "vitest";
import {
  CAPTION_MAX,
  assertStatusTransition,
  mapFeedMedia,
  mapFeedPost,
  mapPost,
  mapPostMedia,
  normalizeCaption,
  normalizeNewPost,
  normalizePostMediaInput,
  normalizePostVisibility,
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
  it("accepts public, followers, and subscribers", () => {
    expect(normalizePostVisibility("public")).toBe("public");
    expect(normalizePostVisibility("followers")).toBe("followers");
    expect(normalizePostVisibility("subscribers")).toBe("subscribers");
  });

  it("rejects purchase with a not-available message", () => {
    expect(() => normalizePostVisibility("purchase")).toThrow(/not available yet/i);
  });

  it("rejects unknown values", () => {
    expect(() => normalizePostVisibility("everyone")).toThrow(/public.*followers.*subscribers/i);
    expect(() => normalizePostVisibility(undefined)).toThrow(/public.*followers.*subscribers/i);
  });
});

describe("normalizeNewPost", () => {
  it("normalizes caption and visibility together", () => {
    expect(normalizeNewPost({ caption: "  hi ", visibility: "followers" })).toEqual({
      caption: "hi",
      visibility: "followers",
    });
  });

  it("propagates visibility errors", () => {
    expect(() => normalizeNewPost({ caption: "hi", visibility: "purchase" })).toThrow();
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
        visibility: "public",
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
      visibility: "public",
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
