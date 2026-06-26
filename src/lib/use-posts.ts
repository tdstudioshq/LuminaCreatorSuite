// ============================================================================
// CABANA — posts & feed React hooks (Phase 3)
// ----------------------------------------------------------------------------
// React Query bindings over the protected post server actions. Media uploads go
// straight to the private `post-media` bucket via the authed browser client
// (owner-scoped by RLS), then the row is recorded through `addPostMedia`.
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/lib/cabana-auth";
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
export function useCreatorFeed(username: string) {
  const normalized = username.toLowerCase();
  return useQuery({
    queryKey: creatorFeedKey(normalized),
    enabled: !!normalized,
    queryFn: () => getCreatorFeed({ data: { username: normalized } }),
  });
}

/** The signed-in viewer's home feed (followed creators). */
export function useHomeFeed() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: homeFeedKey,
    enabled: !loading && !!user,
    queryFn: () => getHomeFeed({ data: {} }),
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
  return useQuery({
    queryKey: postMediaKey(postId ?? ""),
    enabled: enabled && !!postId,
    queryFn: () => getPostMediaUrls({ data: { postId: postId! } }),
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
    mutationFn: (input: { caption: string; visibility: PostVisibility }) =>
      createPost({ data: input }),
    onSuccess: invalidate,
  });
}

export function useUpdatePost() {
  const invalidate = useFeedInvalidation();
  return useMutation({
    mutationFn: (input: { postId: string; caption?: string; visibility?: PostVisibility }) =>
      updatePost({ data: input }),
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
