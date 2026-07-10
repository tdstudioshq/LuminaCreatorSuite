import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { COMMENT_BODY_MAX } from "@/lib/cabana-engagement";
import { useAuthSession } from "@/lib/cabana-auth";
import { useAddComment } from "@/lib/use-engagement";

export function CommentComposer({ postId }: { postId: string }) {
  const [body, setBody] = useState("");
  const { user } = useAuthSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const addComment = useAddComment(postId);

  if (!user) {
    return (
      <div className="glass rounded-2xl px-4 py-3 text-center text-xs text-muted-foreground">
        <Link
          to="/login"
          search={{ redirect: path } as never}
          className="text-foreground underline-offset-2 hover:underline"
        >
          Sign in
        </Link>{" "}
        to join the conversation.
      </div>
    );
  }

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await addComment.mutateAsync(trimmed);
      setBody("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t post your comment.");
    }
  }

  return (
    <div className="glass flex items-end gap-2 rounded-2xl p-2">
      <textarea
        value={body}
        maxLength={COMMENT_BODY_MAX}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment…"
        rows={1}
        className="min-h-[2.25rem] flex-1 resize-none rounded-xl bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-white/20"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      <button
        onClick={() => void submit()}
        disabled={addComment.isPending || body.trim().length === 0}
        className="btn-luxury !px-3 !py-2 text-xs disabled:opacity-60"
        aria-label="Post comment"
      >
        {addComment.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
