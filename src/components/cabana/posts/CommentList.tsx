import { formatDistanceToNow } from "date-fns";
import { EyeOff, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePostComments, useDeleteComment, useHideComment } from "@/lib/use-engagement";

export function CommentList({ postId, isOwner = false }: { postId: string; isOwner?: boolean }) {
  const { data: comments, isLoading, isError } = usePostComments(postId);
  const deleteComment = useDeleteComment(postId);
  const hideComment = useHideComment(postId);

  async function run(action: Promise<unknown>, ok: string) {
    try {
      await action;
      toast.success(ok);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
        Couldn’t load comments.
      </div>
    );
  }
  if (!comments || comments.length === 0) {
    return (
      <div className="glass flex flex-col items-center gap-2 rounded-2xl p-8 text-center text-sm text-muted-foreground">
        <MessageCircle className="h-5 w-5" />
        No comments yet. Be the first to reply.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {comments.map((c) => {
        const initial = (c.authorDisplayName || c.authorUsername || "?").charAt(0).toUpperCase();
        return (
          <li key={c.id} className="glass flex gap-3 rounded-2xl p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5 text-xs font-medium">
              {c.authorAvatarUrl ? (
                <img src={c.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{c.authorDisplayName}</span>
                {c.authorUsername && (
                  <span className="truncate text-[11px] text-muted-foreground">
                    @{c.authorUsername}
                  </span>
                )}
                <time className="ml-auto text-[10px] text-muted-foreground/70">
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">
                {c.body}
              </p>
              {(c.mine || isOwner) && (
                <div className="mt-1.5 flex gap-2">
                  {c.mine && (
                    <button
                      onClick={() => void run(deleteComment.mutateAsync(c.id), "Comment deleted.")}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-300/80"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  )}
                  {isOwner && !c.mine && (
                    <button
                      onClick={() => void run(hideComment.mutateAsync(c.id), "Comment hidden.")}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-amber-300/80"
                    >
                      <EyeOff className="h-3 w-3" /> Hide
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
