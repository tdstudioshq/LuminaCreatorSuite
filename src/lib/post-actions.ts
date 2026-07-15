// ============================================================================
// CABANA — protected post & feed server actions (Phase 3)
// ----------------------------------------------------------------------------
// Creator writes and the authenticated home feed run under the caller's RLS via
// `attachSupabaseToken` + `requireSupabaseAuth`. The creator-page feed is
// guest-callable (`optionalSupabaseAuth`) so public posts render for anonymous
// visitors while a signed-in follower still resolves follower-only content via
// `auth.uid()` inside the SECURITY DEFINER feed RPC.
//
// `getPostMediaUrls` is the ONLY place the service role touches storage: it
// first authorizes the viewer with the `can_view_post` RPC (caller's context),
// then signs the post's private-bucket objects with `supabaseAdmin`.
//
// These server functions compile to a client RPC bridge, so this file must NOT
// live under a `**/server/**` path (the start import-protection plugin blocks
// those from client bundles).
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { optionalSupabaseAuth } from "@/integrations/supabase/optional-auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import {
  type FeedPost,
  type Post,
  type PostMediaItem,
  assertStatusTransition,
  mapFeedPost,
  mapPost,
  mapPostMedia,
  normalizeCaption,
  normalizeNewPost,
  normalizePostCurrency,
  normalizePostMediaInput,
  normalizePostPriceCents,
  normalizePostVisibility,
  resolveBatchPostMedia,
  resolvePublishPatch,
} from "@/lib/cabana-posts";
import {
  STREAM_STORAGE_BUCKET,
  type StreamVideoStatus,
  assertPublishableMediaRows,
} from "@/lib/cabana-stream";

type Db = SupabaseClient<Database>;

/** Raw `post_media` row shape read by the batched signer. */
type BatchMediaRow = {
  id: string;
  post_id: string;
  kind: Database["public"]["Enums"]["post_media_kind"];
  storage_path: string;
  width: number | null;
  height: number | null;
  position: number;
};

const MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 minutes
const POST_MEDIA_BUCKET = "post-media";

/** Resolve the caller's creator profile id, or throw if they aren't a creator. */
async function requireCreatorProfileId(supabase: Db, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only creators can publish posts.");
  return data.id;
}

function normalizeUuid(raw: unknown, label: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof raw !== "string" || !uuid.test(raw)) {
    throw new Error(`A valid ${label} is required.`);
  }
  return raw.toLowerCase();
}

/** Validate + dedupe a batch of post ids, clamped to the feed page cap (≤50). */
function normalizePostIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("A list of post ids is required.");
  const seen = new Set<string>();
  for (const item of raw) seen.add(normalizeUuid(item, "post id"));
  const ids = [...seen];
  if (ids.length > 50) throw new Error("Too many post ids (max 50).");
  return ids;
}

function normalizeCursor(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) {
    throw new Error("Invalid feed cursor.");
  }
  return raw;
}

/** Feed page size, clamped to the RPCs' server-side cap (1..50, default 20). */
function normalizeFeedLimit(raw: unknown): number {
  if (raw == null) return 20;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) throw new Error("Invalid feed limit.");
  return Math.min(50, Math.max(1, Math.trunc(n)));
}

// ─────────────────────────────── Creator writes ─────────────────────────────

export const createPost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(
    (raw: { caption?: unknown; visibility?: unknown; priceCents?: unknown; currency?: unknown }) =>
      normalizeNewPost(raw ?? {}),
  )
  .handler(async ({ context, data }): Promise<Post> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    const { data: row, error } = await supabase
      .from("posts")
      .insert({
        creator_profile_id: creatorProfileId,
        caption: data.caption,
        visibility: data.visibility,
        price_cents: data.priceCents,
        currency: data.currency,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPost(row);
  });

export const updatePost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(
    (raw: {
      postId?: unknown;
      caption?: unknown;
      visibility?: unknown;
      priceCents?: unknown;
      currency?: unknown;
    }) => ({
      postId: normalizeUuid(raw?.postId, "post id"),
      caption: raw?.caption === undefined ? undefined : normalizeCaption(raw.caption),
      visibility:
        raw?.visibility === undefined ? undefined : normalizePostVisibility(raw.visibility),
      priceCents:
        raw?.priceCents === undefined
          ? undefined
          : raw.priceCents === null
            ? null
            : normalizePostPriceCents(raw.priceCents),
      currency: raw?.currency === undefined ? undefined : normalizePostCurrency(raw.currency),
    }),
  )
  .handler(async ({ context, data }): Promise<Post> => {
    const { supabase } = context;
    const patch: Database["public"]["Tables"]["posts"]["Update"] = {};
    if (data.caption !== undefined) patch.caption = data.caption;
    if (data.visibility !== undefined) {
      patch.visibility = data.visibility;
      // Switching away from `purchase` clears any stale unlock price.
      if (data.visibility !== "purchase") patch.price_cents = null;
    }
    if (data.currency !== undefined) patch.currency = data.currency;
    if (data.priceCents !== undefined) patch.price_cents = data.priceCents;
    // A purchase post must carry a positive price.
    if (
      data.visibility === "purchase" &&
      (data.priceCents === undefined || data.priceCents === null)
    ) {
      throw new Error("A purchase post needs a price.");
    }
    if (Object.keys(patch).length === 0) throw new Error("Nothing to update.");
    const { data: row, error } = await supabase
      .from("posts")
      .update(patch)
      .eq("id", data.postId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPost(row);
  });

export const publishPost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({
    postId: normalizeUuid(raw?.postId, "post id"),
  }))
  .handler(async ({ context, data }): Promise<Post> => {
    const { supabase } = context;
    const current = await fetchOwnPostStatus(supabase, data.postId);
    const patch = resolvePublishPatch(current, new Date().toISOString());
    // Readiness is asserted from the DB, never from anything the caller sent,
    // and BEFORE the update — a rejected publish must leave the post untouched.
    await assertOwnPostMediaPublishable(supabase, data.postId);
    const { data: row, error } = await supabase
      .from("posts")
      .update(patch)
      .eq("id", data.postId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPost(row);
  });

export const archivePost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({
    postId: normalizeUuid(raw?.postId, "post id"),
  }))
  .handler(async ({ context, data }): Promise<Post> => {
    const { supabase } = context;
    const current = await fetchOwnPostStatus(supabase, data.postId);
    assertStatusTransition(current, "archived");
    const { data: row, error } = await supabase
      .from("posts")
      .update({ status: "archived" })
      .eq("id", data.postId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPost(row);
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({
    postId: normalizeUuid(raw?.postId, "post id"),
  }))
  .handler(async ({ context, data }): Promise<{ postId: string; deleted: true }> => {
    const { supabase, userId } = context;
    // Read the media inventory BEFORE the delete — the rows cascade away with
    // the post, and afterwards there is nothing left to tell us what to clean up.
    const { data: media } = await supabase
      .from("post_media")
      .select("storage_path, storage_bucket, stream_video_id, stream_videos(uid)")
      .eq("post_id", data.postId);

    const { error } = await supabase.from("posts").delete().eq("id", data.postId);
    if (error) throw new Error(error.message);

    // Everything below is best-effort cleanup AFTER the authoritative delete
    // succeeded. Order matters: if remote cleanup ran first and the row delete
    // then failed, a live post would be left pointing at destroyed media.
    const rows = media ?? [];

    // Supabase-storage objects. Filtering on storage_bucket is load-bearing: a
    // Stream row's path is `<owner>/stream/<uid>`, which passes the owner-prefix
    // check by construction, so without this it was handed to the wrong bucket
    // and silently no-op'd.
    const paths = rows
      .filter((m) => m.storage_bucket === POST_MEDIA_BUCKET)
      .map((m) => m.storage_path)
      .filter((p) => p.startsWith(`${userId}/`));
    if (paths.length > 0) {
      await supabaseAdmin.storage.from(POST_MEDIA_BUCKET).remove(paths);
    }

    // Cloudflare assets. The post's media rows are already cascaded, so these
    // videos are now unattached and reclaimable. Deleting the post used to leave
    // the remote asset alive forever; the sweep is only a backstop for when this
    // fails, so doing it here is what keeps deliberate deletes prompt.
    //
    // Dynamically imported: this file is a client-importable RPC bridge, and the
    // reclaim module reaches the Cloudflare API secrets. Same convention the
    // Stream webhook route uses.
    const videos = rows
      .filter((m) => m.storage_bucket === STREAM_STORAGE_BUCKET && m.stream_video_id !== null)
      .map((m) => ({
        id: m.stream_video_id as string,
        uid: (m.stream_videos as { uid: string } | null)?.uid ?? "",
      }))
      .filter((v) => v.uid !== "");
    if (videos.length > 0) {
      try {
        const { reclaimStreamVideos } = await import("@/lib/stream-reclaim.server");
        await reclaimStreamVideos(supabase, videos);
      } catch {
        // Never fail a completed post delete on cleanup. The `stream_videos`
        // rows survive unattached, which is exactly what the orphan sweep looks
        // for — so the asset stays reclaimable rather than becoming invisible.
      }
    }

    return { postId: data.postId, deleted: true };
  });

/**
 * Publish gate (Stream 5A.4): reject publishing a post whose media is not
 * playback-ready. Reads the caller's OWN rows under their RLS and judges each
 * one by the authoritative source — `stream_videos.status` for Stream rows,
 * `processing_status` otherwise (see `resolveMediaProcessingStatus`).
 *
 * This is the server-side twin of the composer's `evaluateComposerPublish` UI
 * gate. It is the boundary that actually holds: the UI gate is advisory (a stale
 * tab, a reload that resets the session to `idle`, or a direct server-fn call all
 * skip it), and no client-supplied readiness flag is trusted here.
 *
 * A creator can still bypass this via raw PostgREST (`posts` carries a table-wide
 * UPDATE grant under an ownership-only policy), but only against their OWN post,
 * and playback fails closed on non-ready media — so the result self-heals rather
 * than exposing anything. Making the invariant hard needs a trigger + a
 * `stream_videos` INSERT-grant narrowing; that is a separate, gated slice.
 */
async function assertOwnPostMediaPublishable(supabase: Db, postId: string): Promise<void> {
  const { data, error } = await supabase
    .from("post_media")
    .select("storage_bucket, processing_status, stream_videos(status)")
    .eq("post_id", postId);
  if (error) throw new Error(error.message);
  assertPublishableMediaRows(
    (data ?? []).map((row) => ({
      storageBucket: row.storage_bucket,
      processingStatus: row.processing_status,
      // PostgREST nests an embedded to-one as an object (or null when absent).
      streamStatus: (row.stream_videos as { status: StreamVideoStatus } | null)?.status ?? null,
    })),
  );
}

async function fetchOwnPostStatus(
  supabase: Db,
  postId: string,
): Promise<Database["public"]["Enums"]["post_status"]> {
  const { data, error } = await supabase
    .from("posts")
    .select("status")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Post not found.");
  return data.status;
}

// ─────────────────────────────── Media writes ───────────────────────────────

export const addPostMedia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(
    (raw: {
      postId?: unknown;
      kind?: unknown;
      storagePath?: unknown;
      mimeType?: unknown;
      position?: unknown;
      width?: unknown;
      height?: unknown;
    }) => ({
      postId: normalizeUuid(raw?.postId, "post id"),
      media: normalizePostMediaInput(raw ?? {}),
    }),
  )
  .handler(async ({ context, data }): Promise<PostMediaItem> => {
    const { supabase, userId } = context;
    // Pre-flight existence check for a friendly "Post not found" error. Post
    // OWNERSHIP is enforced at the database, not here: the post_media INSERT
    // policy's WITH CHECK (migration 20260533) requires the caller to own the
    // target post and storage_path to sit under the caller's own folder, so a
    // cross-post injection is rejected even via a raw PostgREST insert that
    // bypasses this handler. (This select alone does NOT prove ownership —
    // posts have public/follower SELECT policies.)
    const { data: post, error: postErr } = await supabase
      .from("posts")
      .select("id")
      .eq("id", data.postId)
      .maybeSingle();
    if (postErr) throw new Error(postErr.message);
    if (!post) throw new Error("Post not found.");

    const { data: row, error } = await supabase
      .from("post_media")
      .insert({
        post_id: data.postId,
        owner_user_id: userId,
        kind: data.media.kind,
        storage_bucket: POST_MEDIA_BUCKET,
        storage_path: data.media.storagePath,
        mime_type: data.media.mimeType,
        width: data.media.width,
        height: data.media.height,
        position: data.media.position,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPostMedia(row);
  });

export const deletePostMedia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { mediaId?: unknown }) => ({
    mediaId: normalizeUuid(raw?.mediaId, "media id"),
  }))
  .handler(async ({ context, data }): Promise<{ mediaId: string; deleted: true }> => {
    const { supabase, userId } = context;
    const { data: media } = await supabase
      .from("post_media")
      .select("storage_path")
      .eq("id", data.mediaId)
      .maybeSingle();
    const { error } = await supabase.from("post_media").delete().eq("id", data.mediaId);
    if (error) throw new Error(error.message);
    if (media?.storage_path?.startsWith(`${userId}/`)) {
      await supabaseAdmin.storage.from(POST_MEDIA_BUCKET).remove([media.storage_path]);
    }
    return { mediaId: data.mediaId, deleted: true };
  });

// ─────────────────────────────── Reads ──────────────────────────────────────

/** The caller's own posts (all statuses) for the creator dashboard. */
export const getOwnPosts = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<Post[]> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("creator_profile_id", creatorProfileId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapPost);
  });

/** A creator's visible feed (guest-callable; entitlement enforced in the RPC). */
export const getCreatorFeed = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { username?: unknown; cursor?: unknown; limit?: unknown }) => ({
    username: typeof raw?.username === "string" ? raw.username.trim().toLowerCase() : "",
    cursor: normalizeCursor(raw?.cursor),
    limit: normalizeFeedLimit(raw?.limit),
  }))
  .handler(async ({ context, data }): Promise<FeedPost[]> => {
    if (!data.username) throw new Error("Creator username is required.");
    const supabase = context.supabase as Db;
    const { data: rows, error } = await supabase.rpc("feed_creator_posts", {
      _username: data.username,
      _cursor: data.cursor ?? undefined,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapFeedPost);
  });

/** The authenticated viewer's home feed (followed creators). */
export const getHomeFeed = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { cursor?: unknown; limit?: unknown }) => ({
    cursor: normalizeCursor(raw?.cursor),
    limit: normalizeFeedLimit(raw?.limit),
  }))
  .handler(async ({ context, data }): Promise<FeedPost[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("feed_home_posts", {
      _cursor: data.cursor ?? undefined,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapFeedPost);
  });

export type SignedPostMedia = {
  id: string;
  url: string;
  kind: Database["public"]["Enums"]["post_media_kind"];
  width: number | null;
  height: number | null;
  position: number;
};

/**
 * Issue signed URLs for a post's media — but only after `can_view_post`
 * authorizes the caller. Media rows are read and signed with the service role
 * because non-owners have no direct RLS access to `post_media` or the private
 * bucket; the authorization gate above is what makes that safe.
 */
export const getPostMediaUrls = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({
    postId: normalizeUuid(raw?.postId, "post id"),
  }))
  .handler(async ({ context, data }): Promise<SignedPostMedia[]> => {
    const supabase = context.supabase as Db;
    const { data: allowed, error: authzError } = await supabase.rpc("can_view_post", {
      _post_id: data.postId,
    });
    if (authzError) throw new Error(authzError.message);
    if (!allowed) return [];

    const { data: media, error: mediaError } = await supabaseAdmin
      .from("post_media")
      .select("id, kind, storage_path, width, height, position")
      // Supabase-storage rows ONLY. A Stream row's storage_path addresses a
      // Cloudflare asset, not an object in this bucket, so signing it here would
      // silently return not-found and drop the row. Video is served by
      // `getStreamPlayback(+Batch)` instead. Filtering on storage_bucket (not
      // `kind`) is deliberate: the 20260536 coherence CHECK makes the bucket the
      // authoritative discriminator, tying it to stream_video_id.
      .eq("storage_bucket", POST_MEDIA_BUCKET)
      .eq("post_id", data.postId)
      .order("position", { ascending: true });
    if (mediaError) throw new Error(mediaError.message);
    if (!media || media.length === 0) return [];

    const signed = await Promise.all(
      media.map(async (m) => {
        const { data: urlData } = await supabaseAdmin.storage
          .from(POST_MEDIA_BUCKET)
          .createSignedUrl(m.storage_path, MEDIA_SIGNED_URL_TTL_SECONDS);
        return urlData?.signedUrl
          ? {
              id: m.id,
              url: urlData.signedUrl,
              kind: m.kind,
              width: m.width,
              height: m.height,
              position: m.position,
            }
          : null;
      }),
    );
    return signed.filter((m): m is SignedPostMedia => m !== null);
  });

/**
 * Batched twin of `getPostMediaUrls` (H-08): sign media for many posts in ONE
 * round-trip instead of one server-fn call per feed card. Security is identical
 * to the singular fn — `can_view_post` authorizes EACH post under the caller's
 * RLS, and only allowed posts' objects are read/signed with the service role.
 * Returns a `{ [postId]: SignedPostMedia[] }` map with an entry for every
 * requested id (empty array when not viewable or media-less).
 */
export const getPostMediaUrlsBatch = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { postIds?: unknown }) => ({
    postIds: normalizePostIdList(raw?.postIds),
  }))
  .handler(async ({ context, data }): Promise<Record<string, SignedPostMedia[]>> => {
    const supabase = context.supabase as Db;
    // Pure orchestration (authorize → fetch only authorized → sign) lives in
    // `resolveBatchPostMedia`; this just wires the RLS-scoped authz check and the
    // service-role reads/signing into it. The service role is safe ONLY because
    // `can_view_post` gates every post first — see the pure fn's security tests.
    return resolveBatchPostMedia<BatchMediaRow, SignedPostMedia>(data.postIds, {
      canView: async (postId) => {
        const { data: allowed, error } = await supabase.rpc("can_view_post", { _post_id: postId });
        if (error) throw new Error(error.message);
        return allowed === true;
      },
      fetchMedia: async (authorizedIds) => {
        const { data: media, error } = await supabaseAdmin
          .from("post_media")
          .select("id, post_id, kind, storage_path, width, height, position")
          // Supabase-storage rows ONLY — see the singular fn for why. Video
          // rides `getStreamPlaybackBatch`, which signs Cloudflare tokens.
          .eq("storage_bucket", POST_MEDIA_BUCKET)
          .in("post_id", authorizedIds)
          .order("position", { ascending: true });
        if (error) throw new Error(error.message);
        return (media ?? []) as BatchMediaRow[];
      },
      postIdOf: (row) => row.post_id,
      sign: async (row) => {
        const { data: urlData } = await supabaseAdmin.storage
          .from(POST_MEDIA_BUCKET)
          .createSignedUrl(row.storage_path, MEDIA_SIGNED_URL_TTL_SECONDS);
        return urlData?.signedUrl
          ? {
              id: row.id,
              url: urlData.signedUrl,
              kind: row.kind,
              width: row.width,
              height: row.height,
              position: row.position,
            }
          : null;
      },
      positionOf: (signed) => signed.position,
    });
  });
