import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bookmark, Heart, MessageCircle } from "lucide-react";
import { usePostEngagementState, usePostLike, usePostSave } from "@/lib/use-engagement";

/**
 * Like / comment / save controls for a post. Guests are bounced to sign-in on
 * write actions. The comment button links to the post detail page.
 */
export function EngagementBar({ postId }: { postId: string }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: state } = usePostEngagementState(postId);
  const like = usePostLike(postId);
  const save = usePostSave(postId);

  function requireAuth(action: () => void) {
    if (!like.signedIn) {
      navigate({ to: "/login", search: { redirect: path } as never });
      return;
    }
    action();
  }

  return (
    <div className="flex items-center gap-1 pt-1 text-muted-foreground">
      <button
        onClick={() => requireAuth(() => void like.toggle())}
        disabled={like.pending}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs transition-colors hover:text-foreground disabled:opacity-60"
        aria-pressed={like.liked}
        aria-label="Like"
      >
        <Heart className={`h-4 w-4 ${like.liked ? "fill-rose-400 text-rose-400" : ""}`} />
        {like.likeCount > 0 && <span>{like.likeCount}</span>}
      </button>

      <Link
        to="/post/$postId"
        params={{ postId }}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs transition-colors hover:text-foreground"
        aria-label="Comments"
      >
        <MessageCircle className="h-4 w-4" />
        {state && state.commentCount > 0 && <span>{state.commentCount}</span>}
      </Link>

      <button
        onClick={() => requireAuth(() => void save.toggle())}
        disabled={save.pending}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs transition-colors hover:text-foreground disabled:opacity-60"
        aria-pressed={save.saved}
        aria-label="Save"
      >
        <Bookmark className={`h-4 w-4 ${save.saved ? "fill-sky-300 text-sky-300" : ""}`} />
      </button>
    </div>
  );
}
