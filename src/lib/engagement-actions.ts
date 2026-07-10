// ============================================================================
// CABANA — protected engagement server actions (Phase 3.2)
// ----------------------------------------------------------------------------
// Comments, likes, and saves. All writes run under the caller's RLS
// (`attachSupabaseToken` + `requireSupabaseAuth`) — viewability and block
// enforcement live in the RLS policies + `can_view_post` / `is_engagement_blocked`
// helpers, never the service role. Reads use `optionalSupabaseAuth` so guests
// can see public comments/counts while a signed-in viewer resolves via
// `auth.uid()`. These files must stay outside any `**/server/**` path.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { optionalSupabaseAuth } from "@/integrations/supabase/optional-auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  type Comment,
  type EngagementState,
  mapComment,
  mapEngagementState,
  normalizeCommentBody,
} from "@/lib/cabana-engagement";
import { type FeedPost, mapFeedPost } from "@/lib/cabana-posts";

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID.test(raw)) throw new Error(`A valid ${label} is required.`);
  return raw.toLowerCase();
}

/** Validate + dedupe a batch of post ids, clamped to the feed page cap (≤50). */
function idList(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("A list of post ids is required.");
  const seen = new Set<string>();
  for (const item of raw) seen.add(uuid(item, "post id"));
  const ids = [...seen];
  if (ids.length > 50) throw new Error("Too many post ids (max 50).");
  return ids;
}

function cursor(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) throw new Error("Invalid cursor.");
  return raw;
}

/** Comments page size, clamped to the RPC's server-side cap (1..100, default 30). */
function commentsLimit(raw: unknown): number {
  if (raw == null) return 30;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) throw new Error("Invalid comments limit.");
  return Math.min(100, Math.max(1, Math.trunc(n)));
}

async function readEngagementState(supabase: Db, postId: string): Promise<EngagementState> {
  const { data, error } = await supabase.rpc("post_engagement_state", { _post_id: postId });
  if (error) throw new Error(error.message);
  return mapEngagementState(data?.[0] ?? null);
}

// ─────────────────────────────── Comments ───────────────────────────────────

export const addComment = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown; body?: unknown }) => ({
    postId: uuid(raw?.postId, "post id"),
    body: normalizeCommentBody(raw?.body),
  }))
  .handler(async ({ context, data }): Promise<{ id: string; createdAt: string }> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("post_comments")
      .insert({ post_id: data.postId, author_id: userId, body: data.body, status: "visible" })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, createdAt: row.created_at };
  });

export const editComment = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { commentId?: unknown; body?: unknown }) => ({
    commentId: uuid(raw?.commentId, "comment id"),
    body: normalizeCommentBody(raw?.body),
  }))
  .handler(async ({ context, data }): Promise<{ id: string; body: string }> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("post_comments")
      .update({ body: data.body })
      .eq("id", data.commentId)
      .select("id, body")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, body: row.body };
  });

/** Author soft-delete: visible → deleted (no hard delete from normal users). */
export const deleteComment = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { commentId?: unknown }) => ({
    commentId: uuid(raw?.commentId, "comment id"),
  }))
  .handler(async ({ context, data }): Promise<{ commentId: string; deleted: true }> => {
    const { supabase } = context;
    const { error } = await supabase
      .from("post_comments")
      .update({ status: "deleted" })
      .eq("id", data.commentId);
    if (error) throw new Error(error.message);
    return { commentId: data.commentId, deleted: true };
  });

/** Creator moderation: hide a comment on a post they own. */
export const hideComment = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { commentId?: unknown }) => ({
    commentId: uuid(raw?.commentId, "comment id"),
  }))
  .handler(async ({ context, data }): Promise<{ commentId: string; hidden: true }> => {
    const { supabase } = context;
    const { error } = await supabase
      .from("post_comments")
      .update({ status: "hidden" })
      .eq("id", data.commentId);
    if (error) throw new Error(error.message);
    return { commentId: data.commentId, hidden: true };
  });

// ─────────────────────────────── Likes / saves ──────────────────────────────

export const likePost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({ postId: uuid(raw?.postId, "post id") }))
  .handler(async ({ context, data }): Promise<EngagementState> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("post_likes")
      .upsert(
        { post_id: data.postId, user_id: userId },
        { onConflict: "post_id,user_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return readEngagementState(supabase, data.postId);
  });

export const unlikePost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({ postId: uuid(raw?.postId, "post id") }))
  .handler(async ({ context, data }): Promise<EngagementState> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", data.postId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return readEngagementState(supabase, data.postId);
  });

export const savePost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({ postId: uuid(raw?.postId, "post id") }))
  .handler(async ({ context, data }): Promise<EngagementState> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("post_saves")
      .upsert(
        { post_id: data.postId, user_id: userId },
        { onConflict: "post_id,user_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return readEngagementState(supabase, data.postId);
  });

export const unsavePost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({ postId: uuid(raw?.postId, "post id") }))
  .handler(async ({ context, data }): Promise<EngagementState> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("post_saves")
      .delete()
      .eq("post_id", data.postId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return readEngagementState(supabase, data.postId);
  });

// ─────────────────────────────── Reads (guest-callable) ──────────────────────

export const getPostEngagementState = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({ postId: uuid(raw?.postId, "post id") }))
  .handler(async ({ context, data }): Promise<EngagementState> => {
    return readEngagementState(context.supabase as Db, data.postId);
  });

/**
 * Batched twin of `getPostEngagementState` (H-08): resolve engagement state for
 * many posts in ONE round-trip instead of one server-fn call per feed card.
 * Security is identical — `post_engagement_state` runs per post under the
 * caller's RLS (counts only; never who liked/saved). Returns a
 * `{ [postId]: EngagementState }` map.
 */
export const getPostEngagementStateBatch = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { postIds?: unknown }) => ({ postIds: idList(raw?.postIds) }))
  .handler(async ({ context, data }): Promise<Record<string, EngagementState>> => {
    const supabase = context.supabase as Db;
    const out: Record<string, EngagementState> = {};
    await Promise.all(
      data.postIds.map(async (postId) => {
        out[postId] = await readEngagementState(supabase, postId);
      }),
    );
    return out;
  });

export const getPostComments = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { postId?: unknown; cursor?: unknown; limit?: unknown }) => ({
    postId: uuid(raw?.postId, "post id"),
    cursor: cursor(raw?.cursor),
    limit: commentsLimit(raw?.limit),
  }))
  .handler(async ({ context, data }): Promise<Comment[]> => {
    const supabase = context.supabase as Db;
    const { data: rows, error } = await supabase.rpc("post_comments_list", {
      _post_id: data.postId,
      _cursor: data.cursor ?? undefined,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapComment);
  });

/** Single safe post card by id (locked-aware), for the post detail page. */
export const getPost = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({ postId: uuid(raw?.postId, "post id") }))
  .handler(async ({ context, data }): Promise<FeedPost | null> => {
    const supabase = context.supabase as Db;
    const { data: rows, error } = await supabase.rpc("post_card", { _post_id: data.postId });
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    return row ? mapFeedPost(row) : null;
  });
