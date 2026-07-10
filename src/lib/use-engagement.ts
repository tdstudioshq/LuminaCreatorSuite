// ============================================================================
// CABANA — engagement React hooks (Phase 3.2)
// ----------------------------------------------------------------------------
// React Query bindings over the engagement server actions. Like/save toggles
// update optimistically (pure `nextLikeState`/`nextSaveState`) and reconcile
// with the server-returned `EngagementState`.
// ============================================================================
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthSession } from "@/lib/cabana-auth";
import { useFeedBatchGate } from "@/lib/feed-batch-context";
import {
  type EngagementState,
  EMPTY_ENGAGEMENT,
  nextLikeState,
  nextSaveState,
} from "@/lib/cabana-engagement";
import {
  addComment,
  deleteComment,
  editComment,
  getPost,
  getPostComments,
  getPostEngagementState,
  hideComment,
  likePost,
  savePost,
  unlikePost,
  unsavePost,
} from "@/lib/engagement-actions";

const engagementKey = (postId: string) => ["engagement", postId] as const;
const commentsKey = (postId: string) => ["post-comments", postId] as const;

// ─────────────────────────────── Reads ──────────────────────────────────────

/** A single post card by id (locked-aware) for the post detail page. */
export function usePost(postId: string | null) {
  return useQuery({
    queryKey: ["post", postId ?? ""],
    enabled: !!postId,
    // A missing post resolves deterministically (null / not-found) — retrying
    // the same lookup just delays the terminal state.
    retry: false,
    queryFn: () => getPost({ data: { postId: postId! } }),
  });
}

export function usePostEngagementState(postId: string | null) {
  // Inside a <FeedBatchScope> the scope batch-fetches + seeds this cache, so the
  // card only OBSERVES it (no per-card request); outside a scope it fetches as
  // before. usePostLike/usePostSave read through this hook, so the whole card
  // (bar + like + save) makes zero engagement requests when batched.
  const batched = useFeedBatchGate();
  return useQuery({
    queryKey: engagementKey(postId ?? ""),
    enabled: !!postId && !batched,
    queryFn: () => getPostEngagementState({ data: { postId: postId! } }),
  });
}

export function usePostComments(postId: string | null, enabled = true, limit = 30) {
  return useQuery({
    queryKey: [...commentsKey(postId ?? ""), limit],
    enabled: enabled && !!postId,
    // Keep the current page rendered while "Load more" grows the limit.
    placeholderData: keepPreviousData,
    queryFn: () => getPostComments({ data: { postId: postId!, limit } }),
  });
}

// ─────────────────────────────── Like / save ────────────────────────────────

function useEngagementToggle(
  postId: string,
  action: (postId: string) => Promise<EngagementState>,
  optimistic: (state: EngagementState) => EngagementState,
) {
  const qc = useQueryClient();
  const key = engagementKey(postId);
  return useMutation({
    mutationFn: () => action(postId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<EngagementState>(key);
      if (previous) qc.setQueryData<EngagementState>(key, optimistic(previous));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error("Couldn’t update. Please try again.");
    },
    onSuccess: (state) => qc.setQueryData(key, state),
  });
}

export function usePostLike(postId: string) {
  const { user } = useAuthSession();
  const { data } = usePostEngagementState(postId);
  const state = data ?? EMPTY_ENGAGEMENT;
  const like = useEngagementToggle(
    postId,
    (id) => likePost({ data: { postId: id } }),
    nextLikeState,
  );
  const unlike = useEngagementToggle(
    postId,
    (id) => unlikePost({ data: { postId: id } }),
    nextLikeState,
  );
  return {
    liked: state.likedByMe,
    likeCount: state.likeCount,
    canEngage: state.canEngage,
    signedIn: !!user,
    pending: like.isPending || unlike.isPending,
    toggle: () => (state.likedByMe ? unlike.mutateAsync() : like.mutateAsync()),
  };
}

export function usePostSave(postId: string) {
  const { user } = useAuthSession();
  const { data } = usePostEngagementState(postId);
  const state = data ?? EMPTY_ENGAGEMENT;
  const save = useEngagementToggle(
    postId,
    (id) => savePost({ data: { postId: id } }),
    nextSaveState,
  );
  const unsave = useEngagementToggle(
    postId,
    (id) => unsavePost({ data: { postId: id } }),
    nextSaveState,
  );
  return {
    saved: state.savedByMe,
    canEngage: state.canEngage,
    signedIn: !!user,
    pending: save.isPending || unsave.isPending,
    toggle: () => (state.savedByMe ? unsave.mutateAsync() : save.mutateAsync()),
  };
}

// ─────────────────────────────── Comment mutations ──────────────────────────

function useCommentInvalidation(postId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: commentsKey(postId) });
    qc.invalidateQueries({ queryKey: engagementKey(postId) });
  };
}

export function useAddComment(postId: string) {
  const invalidate = useCommentInvalidation(postId);
  return useMutation({
    mutationFn: (body: string) => addComment({ data: { postId, body } }),
    onSuccess: invalidate,
  });
}

export function useEditComment(postId: string) {
  const invalidate = useCommentInvalidation(postId);
  return useMutation({
    mutationFn: (input: { commentId: string; body: string }) => editComment({ data: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteComment(postId: string) {
  const invalidate = useCommentInvalidation(postId);
  return useMutation({
    mutationFn: (commentId: string) => deleteComment({ data: { commentId } }),
    onSuccess: invalidate,
  });
}

export function useHideComment(postId: string) {
  const invalidate = useCommentInvalidation(postId);
  return useMutation({
    mutationFn: (commentId: string) => hideComment({ data: { commentId } }),
    onSuccess: invalidate,
  });
}
