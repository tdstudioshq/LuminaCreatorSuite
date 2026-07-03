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
    <div
      className="flex items-center gap-1 text-muted-foreground"
      role="group"
      aria-label="Post engagement"
    >
      <button
        type="button"
        onClick={() => requireAuth(() => void like.toggle())}
        disabled={like.pending}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium outline-none transition-all hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
          like.liked ? "bg-rose-400/[0.08] text-rose-300" : ""
        }`}
        aria-pressed={like.liked}
        aria-label={like.liked ? "Unlike post" : "Like post"}
        aria-busy={like.pending}
      >
        <Heart className={`h-[17px] w-[17px] ${like.liked ? "fill-rose-400 text-rose-400" : ""}`} />
        <span>{like.likeCount > 0 ? like.likeCount : "Like"}</span>
      </button>

      <Link
        to="/post/$postId"
        params={{ postId }}
        className="inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium outline-none transition-all hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="View comments"
      >
        <MessageCircle className="h-[17px] w-[17px]" />
        <span>{state && state.commentCount > 0 ? state.commentCount : "Comment"}</span>
      </Link>

      <button
        type="button"
        onClick={() => requireAuth(() => void save.toggle())}
        disabled={save.pending}
        className={`ml-auto inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium outline-none transition-all hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
          save.saved ? "bg-sky-300/[0.08] text-sky-200" : ""
        }`}
        aria-pressed={save.saved}
        aria-label={save.saved ? "Remove saved post" : "Save post"}
        aria-busy={save.pending}
      >
        <Bookmark
          className={`h-[17px] w-[17px] ${save.saved ? "fill-sky-300 text-sky-300" : ""}`}
        />
        <span className="hidden sm:inline">{save.saved ? "Saved" : "Save"}</span>
      </button>
    </div>
  );
}
