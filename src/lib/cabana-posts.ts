// ============================================================================
// CABANA — posts domain layer (PURE)
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. Single source of
// truth for post caption/visibility/status validation, media-input validation,
// and row → domain mapping for the Phase 3 publishing slice. The protected
// server actions (`post-actions.ts`) stay thin by delegating all shaping and
// rule enforcement here; hooks live in `use-posts.ts`.
//
// Phase 3 scope: visibility is limited to `public` and `followers`. The
// `subscribers` / `purchase` enum values exist for forward-compatibility but
// are rejected by the write layer — there is no fan-subscription/monetization
// backend yet (Phase 4). Media is image-only this phase.
// ============================================================================
import type { Database } from "@/integrations/supabase/types";

export type PostVisibility = Database["public"]["Enums"]["post_visibility"];
export type PostStatus = Database["public"]["Enums"]["post_status"];
export type PostMediaKind = Database["public"]["Enums"]["post_media_kind"];

type PostRow = Database["public"]["Tables"]["posts"]["Row"];
type PostMediaRow = Database["public"]["Tables"]["post_media"]["Row"];

// ─────────────────────────────── Limits ─────────────────────────────────────

export const CAPTION_MAX = 2000;
export const MEDIA_PER_POST_MAX = 10;

/** Visibility values a creator may actually publish under in Phase 3. */
export const WRITABLE_VISIBILITIES: readonly PostVisibility[] = ["public", "followers"] as const;

/** Media kinds accepted by the composer in Phase 3 (image-only). */
export const WRITABLE_MEDIA_KINDS: readonly PostMediaKind[] = ["image"] as const;

/** Accepted image MIME types for uploads. */
export const IMAGE_MIME_ALLOWLIST: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

// ─────────────────────────────── Domain types ───────────────────────────────

export type Post = {
  id: string;
  creatorProfileId: string;
  caption: string;
  visibility: PostVisibility;
  status: PostStatus;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PostMediaItem = {
  id: string;
  kind: PostMediaKind;
  storagePath: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  position: number;
};

/**
 * Lightweight media descriptor returned by the feed RPCs. Intentionally omits
 * the storage path (which embeds the owner's user id) — feed cards render via
 * authorization-gated signed URLs from `getPostMediaUrls`, keyed by post id.
 */
export type FeedMediaItem = {
  id: string;
  kind: PostMediaKind;
  width: number | null;
  height: number | null;
  position: number;
};

/** A feed card as returned by `feed_creator_posts` / `feed_home_posts`. */
export type FeedPost = {
  postId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  caption: string;
  visibility: PostVisibility;
  publishedAt: string | null;
  /** True for a followers-only post shown to a non-follower (caption/media blanked). */
  locked: boolean;
  media: FeedMediaItem[];
};

export type NewPostInput = {
  caption: string;
  visibility: PostVisibility;
};

export type NewPostMediaInput = {
  kind: PostMediaKind;
  storagePath: string;
  mimeType: string;
  position: number;
  width: number | null;
  height: number | null;
};

// ─────────────────────────────── Normalizers ────────────────────────────────

/** Trim + length-cap a caption. Empty captions are allowed (media-only posts). */
export function normalizeCaption(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw !== "string") throw new Error("Caption must be text.");
  const caption = raw.trim();
  if (caption.length > CAPTION_MAX) {
    throw new Error(`Caption must be ${CAPTION_MAX} characters or fewer.`);
  }
  return caption;
}

/**
 * Resolve a writable post visibility. Only `public` and `followers` are
 * supported in Phase 3; `subscribers`/`purchase` raise a clear "not available
 * yet" error so the UI can guide the creator without silently downgrading.
 */
export function normalizePostVisibility(raw: unknown): PostVisibility {
  if (raw === "public" || raw === "followers") return raw;
  if (raw === "subscribers" || raw === "purchase") {
    throw new Error("Subscriber and paid posts are not available yet.");
  }
  throw new Error("Visibility must be either 'public' or 'followers'.");
}

/** Validate the caption + visibility for a new or edited post. */
export function normalizeNewPost(input: { caption?: unknown; visibility?: unknown }): NewPostInput {
  return {
    caption: normalizeCaption(input.caption),
    visibility: normalizePostVisibility(input.visibility),
  };
}

/** Validate a single media item before its row is recorded. */
export function normalizePostMediaInput(input: {
  kind?: unknown;
  storagePath?: unknown;
  mimeType?: unknown;
  position?: unknown;
  width?: unknown;
  height?: unknown;
}): NewPostMediaInput {
  if (input.kind !== "image") {
    throw new Error("Only image media is supported in this version.");
  }
  if (typeof input.storagePath !== "string" || input.storagePath.trim() === "") {
    throw new Error("A storage path is required for media.");
  }
  if (input.storagePath.includes("..")) {
    throw new Error("Invalid storage path.");
  }
  if (typeof input.mimeType !== "string" || !IMAGE_MIME_ALLOWLIST.includes(input.mimeType)) {
    throw new Error("Unsupported image type.");
  }
  const position = normalizePosition(input.position);
  return {
    kind: "image",
    storagePath: input.storagePath.trim(),
    mimeType: input.mimeType,
    position,
    width: normalizeDimension(input.width),
    height: normalizeDimension(input.height),
  };
}

function normalizePosition(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new Error("Media position must be a non-negative integer.");
  }
  return raw;
}

function normalizeDimension(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new Error("Media dimensions must be positive integers.");
  }
  return raw;
}

// ───────────────────────────── Status transitions ───────────────────────────

const ALLOWED_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  draft: ["scheduled", "published", "archived"],
  scheduled: ["draft", "published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

/**
 * Validate a status change, returning the target status. Throws if the post is
 * already in the target status (idempotent no-ops are surfaced, not silently
 * accepted) or if the transition is not allowed.
 */
export function assertStatusTransition(from: PostStatus, to: PostStatus): PostStatus {
  if (from === to) {
    throw new Error(`Post is already ${to}.`);
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Cannot change a ${from} post to ${to}.`);
  }
  return to;
}

/**
 * Compute the column patch for publishing. `publishedAt` is injected for
 * determinism (the server action passes `new Date().toISOString()`).
 */
export function resolvePublishPatch(
  from: PostStatus,
  publishedAtIso: string,
): { status: PostStatus; published_at: string } {
  assertStatusTransition(from, "published");
  return { status: "published", published_at: publishedAtIso };
}

// ─────────────────────────────── Mappers ────────────────────────────────────

export function mapPost(row: PostRow): Post {
  return {
    id: row.id,
    creatorProfileId: row.creator_profile_id,
    caption: row.caption,
    visibility: row.visibility,
    status: row.status,
    publishedAt: row.published_at,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPostMedia(row: PostMediaRow): PostMediaItem {
  return {
    id: row.id,
    kind: row.kind,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    position: row.position,
  };
}

type RawMediaItem = {
  id?: unknown;
  kind?: unknown;
  width?: unknown;
  height?: unknown;
  position?: unknown;
};

/** Parse the jsonb `media` array returned by the feed RPCs into typed items. */
export function mapFeedMedia(raw: unknown): FeedMediaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): FeedMediaItem | null => {
      if (item == null || typeof item !== "object") return null;
      const m = item as RawMediaItem;
      if (typeof m.id !== "string") return null;
      const kind: PostMediaKind = m.kind === "video" || m.kind === "audio" ? m.kind : "image";
      return {
        id: m.id,
        kind,
        width: typeof m.width === "number" ? m.width : null,
        height: typeof m.height === "number" ? m.height : null,
        position: typeof m.position === "number" ? m.position : 0,
      };
    })
    .filter((item): item is FeedMediaItem => item !== null)
    .sort((a, b) => a.position - b.position);
}

type RawFeedRow = {
  post_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  caption: string | null;
  visibility: PostVisibility;
  published_at: string | null;
  locked?: boolean | null;
  media?: unknown;
};

/** Map a raw feed RPC row (with jsonb media) to a `FeedPost`. */
export function mapFeedPost(row: RawFeedRow): FeedPost {
  return {
    postId: row.post_id,
    username: row.username,
    displayName: row.display_name ?? row.username,
    avatarUrl: row.avatar_url,
    caption: row.caption ?? "",
    visibility: row.visibility,
    publishedAt: row.published_at,
    locked: row.locked === true,
    media: mapFeedMedia(row.media),
  };
}
