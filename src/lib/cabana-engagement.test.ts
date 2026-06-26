import { describe, expect, it } from "vitest";
import {
  COMMENT_BODY_MAX,
  EMPTY_ENGAGEMENT,
  type EngagementState,
  canEditComment,
  isCommentVisible,
  mapComment,
  mapEngagementState,
  nextLikeState,
  nextSaveState,
  normalizeCommentBody,
  normalizeCount,
} from "./cabana-engagement";

describe("normalizeCommentBody", () => {
  it("trims a valid body", () => {
    expect(normalizeCommentBody("  hello  ")).toBe("hello");
  });
  it("rejects non-strings", () => {
    expect(() => normalizeCommentBody(5)).toThrow(/must be text/i);
  });
  it("rejects empty / whitespace-only", () => {
    expect(() => normalizeCommentBody("   ")).toThrow(/empty/i);
    expect(() => normalizeCommentBody("")).toThrow(/empty/i);
  });
  it("rejects over-long bodies", () => {
    expect(() => normalizeCommentBody("x".repeat(COMMENT_BODY_MAX + 1))).toThrow(/or fewer/i);
  });
  it("accepts a body at the limit", () => {
    const max = "x".repeat(COMMENT_BODY_MAX);
    expect(normalizeCommentBody(max)).toBe(max);
  });
});

describe("normalizeCount", () => {
  it("parses numeric strings (bigint surfaced as text)", () => {
    expect(normalizeCount("42")).toBe(42);
  });
  it("passes through numbers and floors floats", () => {
    expect(normalizeCount(7)).toBe(7);
    expect(normalizeCount(7.9)).toBe(7);
  });
  it("clamps invalid / negative input to 0", () => {
    expect(normalizeCount(-3)).toBe(0);
    expect(normalizeCount("nope")).toBe(0);
    expect(normalizeCount(null)).toBe(0);
    expect(normalizeCount(Infinity)).toBe(0);
  });
});

describe("status handling", () => {
  it("isCommentVisible", () => {
    expect(isCommentVisible("visible")).toBe(true);
    expect(isCommentVisible("hidden")).toBe(false);
    expect(isCommentVisible("deleted")).toBe(false);
  });
  it("canEditComment only for visible", () => {
    expect(canEditComment("visible")).toBe(true);
    expect(canEditComment("hidden")).toBe(false);
  });
});

describe("toggle math", () => {
  const base: EngagementState = {
    likeCount: 2,
    commentCount: 1,
    likedByMe: false,
    savedByMe: false,
    canEngage: true,
  };

  it("likes and unlikes adjust the count", () => {
    const liked = nextLikeState(base);
    expect(liked.likedByMe).toBe(true);
    expect(liked.likeCount).toBe(3);
    const unliked = nextLikeState(liked);
    expect(unliked.likedByMe).toBe(false);
    expect(unliked.likeCount).toBe(2);
  });

  it("never drives the like count below zero", () => {
    const liked: EngagementState = { ...base, likeCount: 0, likedByMe: true };
    expect(nextLikeState(liked).likeCount).toBe(0);
  });

  it("toggles save without touching counts", () => {
    const saved = nextSaveState(base);
    expect(saved.savedByMe).toBe(true);
    expect(saved.likeCount).toBe(base.likeCount);
    expect(nextSaveState(saved).savedByMe).toBe(false);
  });
});

describe("mapEngagementState", () => {
  it("returns an empty state for null", () => {
    expect(mapEngagementState(null)).toEqual(EMPTY_ENGAGEMENT);
  });
  it("maps a full row with a string count", () => {
    expect(
      mapEngagementState({
        like_count: "5",
        comment_count: 3,
        liked_by_me: true,
        saved_by_me: false,
        can_engage: true,
      }),
    ).toEqual({
      likeCount: 5,
      commentCount: 3,
      likedByMe: true,
      savedByMe: false,
      canEngage: true,
    });
  });
});

describe("mapComment", () => {
  it("maps a full row", () => {
    expect(
      mapComment({
        comment_id: "c1",
        author_username: "nova",
        author_display_name: "Nova",
        author_avatar_url: "https://x/a.png",
        body: "nice",
        created_at: "2026-06-25T00:00:00Z",
        mine: true,
      }),
    ).toEqual({
      id: "c1",
      authorUsername: "nova",
      authorDisplayName: "Nova",
      authorAvatarUrl: "https://x/a.png",
      body: "nice",
      createdAt: "2026-06-25T00:00:00Z",
      mine: true,
    });
  });

  it("falls back display name to username then 'Member'", () => {
    expect(
      mapComment({
        comment_id: "c2",
        author_username: "nova",
        author_display_name: null,
        created_at: "2026-06-25T00:00:00Z",
      }).authorDisplayName,
    ).toBe("nova");

    const anon = mapComment({
      comment_id: "c3",
      author_username: null,
      author_display_name: null,
      created_at: "2026-06-25T00:00:00Z",
    });
    expect(anon.authorDisplayName).toBe("Member");
    expect(anon.authorUsername).toBeNull();
    expect(anon.body).toBe("");
    expect(anon.mine).toBe(false);
  });
});
