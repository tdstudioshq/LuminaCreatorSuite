// ============================================================================
// CABANA — posts domain layer (PURE)
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. Single source of
// truth for post caption/visibility/status validation, media-input validation,
// and row → domain mapping for the Phase 3 publishing slice. The protected
// server actions (`post-actions.ts`) stay thin by delegating all shaping and
// rule enforcement here; hooks live in `use-posts.ts`.
//
// Visibility: `public`, `followers`, `subscribers` (Phase 4), and `purchase`
// (Phase 6 — a one-time paid unlock priced in integer cents, gated by the
// monetization ledger / `content_entitlements`). Media is image-only.
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
/** Max demo unlock price for a `purchase` post, in integer cents ($1,000,000). */
export const POST_PRICE_CENTS_MAX = 100_000_000;

/** Visibility values a creator may publish under (Phase 6 adds `purchase`). */
export const WRITABLE_VISIBILITIES: readonly PostVisibility[] = [
  "public",
  "followers",
  "subscribers",
  "purchase",
] as const;

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
  /** Unlock price in integer cents for a `purchase` post; null otherwise. */
  priceCents: number | null;
  currency: string;
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

/** True when a feed card's media descriptors include a Stream video. */
export function feedPostHasVideo(post: Pick<FeedPost, "media">): boolean {
  return post.media.some((m) => m.kind === "video");
}

/**
 * Split a feed page into the two prefetch batches a <FeedBatchScope> needs.
 *
 * Image media and video media live in different backends behind different
 * actions, so they batch separately. Locked posts are excluded from BOTH: their
 * media is blanked by the feed RPC and the server would deny the request anyway,
 * so asking is pure waste that also leaks intent.
 *
 * The media-mix rule (one video XOR images) means these two lists never overlap
 * — but this derives each independently rather than assuming it, so a post that
 * somehow carried both would still render both instead of silently dropping one.
 */
export function partitionFeedMediaIds(posts: readonly FeedPost[]): {
  imagePostIds: string[];
  videoPostIds: string[];
} {
  const imagePostIds: string[] = [];
  const videoPostIds: string[] = [];
  for (const post of posts) {
    if (post.locked || post.media.length === 0) continue;
    if (feedPostHasVideo(post)) videoPostIds.push(post.postId);
    if (post.media.some((m) => m.kind !== "video")) imagePostIds.push(post.postId);
  }
  return { imagePostIds, videoPostIds };
}

export type NewPostInput = {
  caption: string;
  visibility: PostVisibility;
  /** Required (> 0) for `purchase` posts; null for every other visibility. */
  priceCents: number | null;
  currency: string;
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
 * Resolve a writable post visibility. All four tiers are supported as of Phase 6:
 * `public`, `followers`, `subscribers`, and `purchase` (a one-time paid unlock).
 */
export function normalizePostVisibility(raw: unknown): PostVisibility {
  if (raw === "public" || raw === "followers" || raw === "subscribers" || raw === "purchase") {
    return raw;
  }
  throw new Error("Visibility must be 'public', 'followers', 'subscribers', or 'purchase'.");
}

/** Validate a 3-letter currency code, defaulting to USD. */
export function normalizePostCurrency(raw: unknown): string {
  if (raw == null || raw === "") return "USD";
  if (typeof raw !== "string" || !/^[A-Za-z]{3}$/.test(raw)) {
    throw new Error("Currency must be a 3-letter code.");
  }
  return raw.toUpperCase();
}

/** Validate a demo unlock price in integer cents (whole cents, 1..MAX). */
export function normalizePostPriceCents(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new Error("Price must be a whole number of cents.");
  }
  if (raw <= 0) throw new Error("A purchase post needs a price above zero.");
  if (raw > POST_PRICE_CENTS_MAX) throw new Error("Price is too large.");
  return raw;
}

/**
 * Validate caption + visibility (+ price for purchase posts). A `purchase` post
 * requires a positive integer-cent price; every other visibility forces a null
 * price so a leftover value can never make a free post look paid.
 */
export function normalizeNewPost(input: {
  caption?: unknown;
  visibility?: unknown;
  priceCents?: unknown;
  currency?: unknown;
}): NewPostInput {
  const visibility = normalizePostVisibility(input.visibility);
  const isPurchase = visibility === "purchase";
  return {
    caption: normalizeCaption(input.caption),
    visibility,
    priceCents: isPurchase ? normalizePostPriceCents(input.priceCents) : null,
    currency: normalizePostCurrency(input.currency),
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
    priceCents: row.price_cents,
    currency: row.currency,
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

// ─────────────────────── Batched media access (H-08) ────────────────────────

/**
 * Repository injected into {@link resolveBatchPostMedia}. Keeps the pure
 * orchestration free of Supabase/storage while the security-critical ordering
 * (authorize → fetch only authorized → sign) stays unit-testable.
 */
export type BatchPostMediaRepo<TRow, TSigned> = {
  /** Authorize the caller for one post under their RLS (mirrors `can_view_post`). */
  canView: (postId: string) => Promise<boolean>;
  /** Read media rows for ONLY the authorized post ids (service-role read). */
  fetchMedia: (authorizedPostIds: string[]) => Promise<TRow[]>;
  /** Which post a media row belongs to. */
  postIdOf: (row: TRow) => string;
  /** Sign one media row into an output item; null when signing failed. */
  sign: (row: TRow) => Promise<TSigned | null>;
  /** Position used to order a post's media. */
  positionOf: (signed: TSigned) => number;
};

/**
 * Batched media resolver (H-08 twin of the singular `getPostMediaUrls` flow).
 * For a set of post ids it (1) authorizes EACH post under the caller's RLS,
 * (2) fetches media for ONLY the authorized ids, then (3) signs + groups them by
 * post (sorted by position). Returns a map with an entry for every requested id —
 * `[]` when the caller isn't authorized or the post has no media.
 *
 * Security property (see `cabana-posts.test.ts`): a post that fails
 * authorization is never fetched or signed, and an over-returned row for an
 * unauthorized post is dropped (defense in depth) — so an unauthorized id in the
 * batch can never yield a signed URL while authorized ids still resolve.
 */
export async function resolveBatchPostMedia<TRow, TSigned>(
  postIds: string[],
  repo: BatchPostMediaRepo<TRow, TSigned>,
): Promise<Record<string, TSigned[]>> {
  const out: Record<string, TSigned[]> = {};
  for (const id of postIds) out[id] = [];
  if (postIds.length === 0) return out;

  const authz = await Promise.all(
    postIds.map(async (id) => ((await repo.canView(id)) ? id : null)),
  );
  const authorized = authz.filter((id): id is string => id !== null);
  if (authorized.length === 0) return out;
  const authorizedSet = new Set(authorized);

  const rows = await repo.fetchMedia(authorized);
  await Promise.all(
    rows.map(async (row) => {
      const postId = repo.postIdOf(row);
      // Defense in depth: never surface media for a post the caller wasn't
      // authorized to view, even if the repository over-returned rows. out[postId]
      // is guaranteed present (authorized ⊆ postIds, all pre-initialized above).
      if (!authorizedSet.has(postId)) return;
      const signed = await repo.sign(row);
      if (signed != null) out[postId].push(signed);
    }),
  );

  for (const id of authorized) out[id].sort((a, b) => repo.positionOf(a) - repo.positionOf(b));
  return out;
}
