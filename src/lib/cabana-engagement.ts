// ============================================================================
// CABANA — engagement domain layer (PURE)
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. Single source of
// truth for comment validation, engagement-count normalization, like/save
// toggle math, comment-status handling, and display-safe mapping for the
// Phase 3.2 engagement slice. Server actions (`engagement-actions.ts`) delegate
// shaping/rules here; hooks live in `use-engagement.ts`.
// ============================================================================
import type { Database } from "@/integrations/supabase/types";

export type CommentStatus = Database["public"]["Enums"]["comment_status"];

export const COMMENT_BODY_MIN = 1;
export const COMMENT_BODY_MAX = 2000;

// ─────────────────────────────── Domain types ───────────────────────────────

export type Comment = {
  id: string;
  authorUsername: string | null;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  mine: boolean;
};

export type EngagementState = {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  canEngage: boolean;
};

export const EMPTY_ENGAGEMENT: EngagementState = {
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  savedByMe: false,
  canEngage: false,
};

// ─────────────────────────────── Validation ─────────────────────────────────

/** Trim and validate a comment body (1–2000 non-whitespace chars). */
export function normalizeCommentBody(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Comment must be text.");
  const body = raw.trim();
  if (body.length < COMMENT_BODY_MIN) {
    throw new Error("Comment cannot be empty.");
  }
  if (body.length > COMMENT_BODY_MAX) {
    throw new Error(`Comment must be ${COMMENT_BODY_MAX} characters or fewer.`);
  }
  return body;
}

// ─────────────────────────── Count normalization ────────────────────────────

/**
 * Coerce a count (which Postgres `bigint` may surface as a string) into a
 * non-negative integer. Invalid input clamps to 0.
 */
export function normalizeCount(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

// ───────────────────────────── Status handling ──────────────────────────────

export function isCommentVisible(status: CommentStatus): boolean {
  return status === "visible";
}

/** Only the author's still-visible comments may be edited or self-deleted. */
export function canEditComment(status: CommentStatus): boolean {
  return status === "visible";
}

// ─────────────────────────────── Toggle math ────────────────────────────────

/** Optimistic next state after toggling the caller's like. */
export function nextLikeState(state: EngagementState): EngagementState {
  const likedByMe = !state.likedByMe;
  const likeCount = Math.max(0, state.likeCount + (likedByMe ? 1 : -1));
  return { ...state, likedByMe, likeCount };
}

/** Optimistic next state after toggling the caller's save (no public count). */
export function nextSaveState(state: EngagementState): EngagementState {
  return { ...state, savedByMe: !state.savedByMe };
}

// ─────────────────────────────── Mappers ────────────────────────────────────

type RawEngagementRow = {
  like_count?: unknown;
  comment_count?: unknown;
  liked_by_me?: unknown;
  saved_by_me?: unknown;
  can_engage?: unknown;
};

export function mapEngagementState(row: RawEngagementRow | null | undefined): EngagementState {
  if (!row) return { ...EMPTY_ENGAGEMENT };
  return {
    likeCount: normalizeCount(row.like_count),
    commentCount: normalizeCount(row.comment_count),
    likedByMe: row.liked_by_me === true,
    savedByMe: row.saved_by_me === true,
    canEngage: row.can_engage === true,
  };
}

type RawCommentRow = {
  comment_id: string;
  author_username?: string | null;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  body?: string | null;
  created_at: string;
  mine?: boolean | null;
};

export function mapComment(row: RawCommentRow): Comment {
  const username = row.author_username ?? null;
  return {
    id: row.comment_id,
    authorUsername: username,
    authorDisplayName: row.author_display_name ?? username ?? "Member",
    authorAvatarUrl: row.author_avatar_url ?? null,
    body: row.body ?? "",
    createdAt: row.created_at,
    mine: row.mine === true,
  };
}
