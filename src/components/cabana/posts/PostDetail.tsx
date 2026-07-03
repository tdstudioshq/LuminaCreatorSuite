import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { useCabana } from "@/lib/cabana-store";
import { usePost } from "@/lib/use-engagement";
import { usePurchaseUnlock } from "@/lib/use-money";
import { PostCard } from "./PostCard";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";

export function PostDetail({ postId }: { postId: string }) {
  const { data: post, isLoading, isError } = usePost(postId);
  const { profile } = useCabana();
  const purchaseUnlock = usePurchaseUnlock();
  const isOwner =
    !!profile?.handle && !!post && profile.handle.toLowerCase() === post.username.toLowerCase();

  const onUnlock =
    post && post.locked && post.visibility === "purchase"
      ? () =>
          purchaseUnlock.mutate(post.postId, {
            onSuccess: () => toast.success("Unlocked (demo) — no real payment was processed."),
            onError: (e) => toast.error(e instanceof Error ? e.message : "Could not unlock."),
          })
      : undefined;

  return (
    <SocialShell>
      <div className="mx-auto min-h-screen max-w-2xl border-x border-border/50 px-4 py-6 sm:px-6">
        <Link
          to="/feed"
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to feed
        </Link>

        {isLoading ? (
          <Centered>
            <Loader2 className="h-5 w-5 animate-spin" />
          </Centered>
        ) : isError || !post ? (
          <div className="glass-strong rounded-3xl p-8 text-center">
            <p className="text-sm font-medium">Post not found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              It may have been removed, or you don’t have access to it.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <PostCard
              post={post}
              onUnlock={onUnlock}
              unlockPending={purchaseUnlock.isPending}
              isOwner={isOwner}
            />
            {!post.locked && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">Comments</h2>
                <CommentComposer postId={post.postId} />
                <CommentList postId={post.postId} isOwner={isOwner} />
              </section>
            )}
          </div>
        )}
      </div>
    </SocialShell>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center py-12 text-muted-foreground">{children}</div>;
}
