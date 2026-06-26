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
  normalizePostMediaInput,
  normalizePostVisibility,
  resolvePublishPatch,
} from "@/lib/cabana-posts";

type Db = SupabaseClient<Database>;

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

function normalizeCursor(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) {
    throw new Error("Invalid feed cursor.");
  }
  return raw;
}

// ─────────────────────────────── Creator writes ─────────────────────────────

export const createPost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { caption?: unknown; visibility?: unknown }) => normalizeNewPost(raw ?? {}))
  .handler(async ({ context, data }): Promise<Post> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    const { data: row, error } = await supabase
      .from("posts")
      .insert({
        creator_profile_id: creatorProfileId,
        caption: data.caption,
        visibility: data.visibility,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPost(row);
  });

export const updatePost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown; caption?: unknown; visibility?: unknown }) => ({
    postId: normalizeUuid(raw?.postId, "post id"),
    caption: raw?.caption === undefined ? undefined : normalizeCaption(raw.caption),
    visibility: raw?.visibility === undefined ? undefined : normalizePostVisibility(raw.visibility),
  }))
  .handler(async ({ context, data }): Promise<Post> => {
    const { supabase } = context;
    const patch: Database["public"]["Tables"]["posts"]["Update"] = {};
    if (data.caption !== undefined) patch.caption = data.caption;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
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
    // Best-effort storage cleanup before the row (and cascaded media rows) go.
    const { data: media } = await supabase
      .from("post_media")
      .select("storage_path")
      .eq("post_id", data.postId);
    const { error } = await supabase.from("posts").delete().eq("id", data.postId);
    if (error) throw new Error(error.message);
    const paths = (media ?? [])
      .map((m) => m.storage_path)
      .filter((p) => p.startsWith(`${userId}/`));
    if (paths.length > 0) {
      await supabaseAdmin.storage.from(POST_MEDIA_BUCKET).remove(paths);
    }
    return { postId: data.postId, deleted: true };
  });

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
    // Confirm the caller owns the parent post (RLS only lets owners select it).
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
  .inputValidator((raw: { username?: unknown; cursor?: unknown }) => ({
    username: typeof raw?.username === "string" ? raw.username.trim().toLowerCase() : "",
    cursor: normalizeCursor(raw?.cursor),
  }))
  .handler(async ({ context, data }): Promise<FeedPost[]> => {
    if (!data.username) throw new Error("Creator username is required.");
    const supabase = context.supabase as Db;
    const { data: rows, error } = await supabase.rpc("feed_creator_posts", {
      _username: data.username,
      _cursor: data.cursor ?? undefined,
      _limit: 20,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapFeedPost);
  });

/** The authenticated viewer's home feed (followed creators). */
export const getHomeFeed = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { cursor?: unknown }) => ({ cursor: normalizeCursor(raw?.cursor) }))
  .handler(async ({ context, data }): Promise<FeedPost[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("feed_home_posts", {
      _cursor: data.cursor ?? undefined,
      _limit: 20,
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
