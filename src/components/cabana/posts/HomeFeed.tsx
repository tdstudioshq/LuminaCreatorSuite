import { Link } from "@tanstack/react-router";
import { Loader2, Rows3 } from "lucide-react";
import { GlobalNav } from "@/components/cabana/GlobalNav";
import { useAuthSession } from "@/lib/cabana-auth";
import { useHomeFeed } from "@/lib/use-posts";
import { PostCard } from "./PostCard";

export function HomeFeed() {
  const { user, loading: sessionLoading } = useAuthSession();
  const { data: posts, isLoading } = useHomeFeed();

  return (
    <div className="relative min-h-screen overflow-x-hidden px-4 pb-24 pt-32 sm:px-6">
      <GlobalNav />
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <p className="eyebrow text-muted-foreground mb-1.5">Member experience</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Feed</h1>
          <p className="mt-2 text-sm text-muted-foreground">Updates from creators you follow.</p>
        </div>

        {sessionLoading ? (
          <Centered>
            <Loader2 className="h-5 w-5 animate-spin" />
          </Centered>
        ) : !user ? (
          <div className="glass-strong rounded-3xl p-8 text-center">
            <Rows3 className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Sign in to see your feed</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Follow creators to get their latest public and followers-only posts here.
            </p>
            <Link
              to="/login"
              search={{ redirect: "/feed" } as never}
              className="btn-luxury mt-6 !px-5 !py-2.5 text-xs"
            >
              Sign in
            </Link>
          </div>
        ) : isLoading ? (
          <Centered>
            <Loader2 className="h-5 w-5 animate-spin" />
          </Centered>
        ) : !posts || posts.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
            Your feed is empty. Follow creators to fill it with their latest posts.
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post, i) => (
              <PostCard key={post.postId} post={post} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center py-12 text-muted-foreground">{children}</div>;
}
