// ============================================================================
// CABANA — posts & feed React hooks (Phase 3)
// ----------------------------------------------------------------------------
// React Query bindings over the protected post server actions. Media uploads go
// straight to the private `post-media` bucket via the authed browser client
// (owner-scoped by RLS), then the row is recorded through `addPostMedia`.
// ============================================================================
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/lib/cabana-auth";
import { useFeedBatchGate } from "@/lib/feed-batch-context";
import {
  addPostMedia,
  archivePost,
  createPost,
  deletePost,
  deletePostMedia,
  getCreatorFeed,
  getHomeFeed,
  getOwnPosts,
  getPostMediaUrls,
  publishPost,
  updatePost,
} from "@/lib/post-actions";
import type { PostVisibility } from "@/lib/cabana-posts";

const POST_MEDIA_BUCKET = "post-media";

const ownPostsKey = ["own-posts"] as const;
const homeFeedKey = ["home-feed"] as const;
const creatorFeedKey = (username: string) => ["creator-feed", username.toLowerCase()] as const;
const postMediaKey = (postId: string) => ["post-media", postId] as const;

// ─────────────────────────────── Reads ──────────────────────────────────────

/** A creator's visible feed (works for guests; entitlement enforced server-side). */
export function useCreatorFeed(username: string, limit = 20) {
  const normalized = username.toLowerCase();
  return useQuery({
    queryKey: [...creatorFeedKey(normalized), limit],
    enabled: !!normalized,
    // Keep the current page rendered while "Load more" grows the limit.
    placeholderData: keepPreviousData,
    queryFn: () => getCreatorFeed({ data: { username: normalized, limit } }),
  });
}

/** The signed-in viewer's home feed (followed creators). */
export function useHomeFeed(limit = 20) {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: [...homeFeedKey, limit],
    enabled: !loading && !!user,
    // Keep the current page rendered while "Load more" grows the limit.
    placeholderData: keepPreviousData,
    queryFn: () => getHomeFeed({ data: { limit } }),
  });
}

/** The caller's own posts (all statuses) for the creator dashboard. */
export function useOwnPosts() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: ownPostsKey,
    enabled: !loading && !!user,
    queryFn: () => getOwnPosts(),
  });
}

/** Authorization-gated signed media URLs for one post. */
export function usePostMediaUrls(postId: string | null, enabled = true) {
  // Inside a <FeedBatchScope> the scope batch-fetches + seeds this exact cache,
  // so the card only OBSERVES it (no per-card request). Outside a scope this is
  // a no-op and the hook fetches individually (e.g. post detail).
  const batched = useFeedBatchGate();
  return useQuery({
    queryKey: postMediaKey(postId ?? ""),
    enabled: enabled && !!postId && !batched,
    queryFn: () => getPostMediaUrls({ data: { postId: postId! } }),
    // Signed URLs are valid ~30 min; hold the cached URL just under that TTL so
    // navigation/refocus doesn't needlessly re-sign and re-download byte-identical
    // media. Access-changing mutations still invalidate ["post-media"] explicitly.
    staleTime: 25 * 60_000,
  });
}

// ─────────────────────────────── Mutations ──────────────────────────────────

function useFeedInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ownPostsKey });
    qc.invalidateQueries({ queryKey: homeFeedKey });
    qc.invalidateQueries({ queryKey: ["creator-feed"] });
  };
}

export function useCreatePost() {
  const invalidate = useFeedInvalidation();
  return useMutation({
    mutationFn: (input: {
      caption: string;
      visibility: PostVisibility;
      priceCents?: number | null;
      currency?: string;
    }) => createPost({ data: input }),
    onSuccess: invalidate,
  });
}

export function useUpdatePost() {
  const invalidate = useFeedInvalidation();
  return useMutation({
    mutationFn: (input: {
      postId: string;
      caption?: string;
      visibility?: PostVisibility;
      priceCents?: number | null;
      currency?: string;
    }) => updatePost({ data: input }),
    onSuccess: invalidate,
  });
}

export function usePublishPost() {
  const invalidate = useFeedInvalidation();
  return useMutation({
    mutationFn: (postId: string) => publishPost({ data: { postId } }),
    onSuccess: invalidate,
  });
}

export function useArchivePost() {
  const invalidate = useFeedInvalidation();
  return useMutation({
    mutationFn: (postId: string) => archivePost({ data: { postId } }),
    onSuccess: invalidate,
  });
}

export function useDeletePost() {
  const invalidate = useFeedInvalidation();
  return useMutation({
    mutationFn: (postId: string) => deletePost({ data: { postId } }),
    onSuccess: invalidate,
  });
}

export function useDeletePostMedia() {
  const qc = useQueryClient();
  const invalidate = useFeedInvalidation();
  return useMutation({
    mutationFn: (input: { mediaId: string; postId: string }) =>
      deletePostMedia({ data: { mediaId: input.mediaId } }),
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: postMediaKey(input.postId) });
      invalidate();
    },
  });
}

/**
 * Upload an image to the private post-media bucket, then record its row.
 * Path layout `<user_id>/<post_id>/<file>` satisfies the owner-scoped storage
 * RLS policy.
 */
export function useUploadPostMedia() {
  const qc = useQueryClient();
  const invalidate = useFeedInvalidation();
  return useMutation({
    mutationFn: async (input: { postId: string; file: File; position?: number }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("You must be signed in to upload media.");

      const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${input.postId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(POST_MEDIA_BUCKET)
        .upload(path, input.file, { contentType: input.file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const size = await readImageSize(input.file);
      return addPostMedia({
        data: {
          postId: input.postId,
          kind: "image",
          storagePath: path,
          mimeType: input.file.type,
          position: input.position ?? 0,
          width: size?.width,
          height: size?.height,
        },
      });
    },
    onSuccess: (_media, input) => {
      qc.invalidateQueries({ queryKey: postMediaKey(input.postId) });
      invalidate();
    },
  });
}

/** Best-effort image dimension read; returns null if it can't be determined. */
async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}
