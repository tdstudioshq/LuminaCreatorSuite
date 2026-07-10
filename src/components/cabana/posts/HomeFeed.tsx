import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  AlignLeft,
  ImagePlus,
  PenLine,
  RefreshCw,
  Rows3,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { useAuthSession } from "@/lib/cabana-auth";
import { useCabana, type CabanaProfile } from "@/lib/cabana-store";
import { useHomeFeed } from "@/lib/use-posts";
import { PostCard } from "./PostCard";
import { FeedBatchScope } from "./FeedBatchScope";

const FILTERS = ["All", "Photos", "Free", "Locked"] as const;
const LOADING_PLACEHOLDERS = [0, 1] as const;
const FEED_PAGE_SIZE = 20;
const FEED_MAX_LIMIT = 50; // server-side clamp on the feed RPCs
type Filter = (typeof FILTERS)[number];

export function HomeFeed() {
  const { user, loading: sessionLoading } = useAuthSession();
  const { profile } = useCabana();
  const [limit, setLimit] = useState(FEED_PAGE_SIZE);
  const { data: posts, isLoading, isError, refetch } = useHomeFeed(limit);
  const [filter, setFilter] = useState<Filter>("All");

  // Batch media/engagement for the whole fetched set (not just the current
  // filter) so switching filters never triggers new per-card requests.
  const nonLocked = (posts ?? []).filter((p) => !p.locked);
  const engagementPostIds = nonLocked.map((p) => p.postId);
  const mediaPostIds = nonLocked.filter((p) => p.media.length > 0).map((p) => p.postId);

  // Client-side, presentational filtering over the already-fetched feed.
  const visiblePosts = (posts ?? []).filter((p) => {
    switch (filter) {
      case "Photos":
        return p.media.some((m) => m.kind === "image");
      case "Free":
        return !p.locked && p.visibility === "public";
      case "Locked":
        return p.locked;
      default:
        return true;
    }
  });

  return (
    <SocialShell>
      <div className="mx-auto min-h-screen max-w-[720px] border-x border-white/[0.07] bg-[oklch(0.115_0.012_280/0.42)]">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between gap-4 border-b border-white/[0.07] bg-background/82 px-5 py-3 backdrop-blur-2xl sm:px-7">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-primary">
              Creator updates
            </p>
            <div className="mt-0.5 flex items-baseline gap-2.5">
              <h1 className="font-display text-2xl font-semibold tracking-tight">Home feed</h1>
              {user && posts ? (
                <span className="text-[11px] text-muted-foreground">
                  {visiblePosts.length < posts.length
                    ? `${visiblePosts.length} of ${posts.length} posts`
                    : `${posts.length} ${posts.length === 1 ? "post" : "posts"}`}
                </span>
              ) : null}
            </div>
          </div>
          <Link
            to="/discover"
            className="flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-4 text-xs font-medium text-muted-foreground outline-none transition-all hover:border-primary/25 hover:bg-white/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Discover
          </Link>
        </header>

        <div className="border-b border-white/[0.07] px-4 py-5 sm:px-5">
          {user && profile ? <FeedComposer profile={profile} /> : null}
          <FilterPills active={filter} onChange={setFilter} />
        </div>

        <section aria-label="Feed posts" className="space-y-5 p-4 sm:p-5">
          {sessionLoading ? (
            <FeedLoading />
          ) : !user ? (
            <div className="rounded-xl border border-white/[0.09] bg-[linear-gradient(145deg,oklch(0.2_0.022_280/0.62),oklch(0.145_0.016_280/0.58))] p-8 text-center shadow-luxury sm:p-10">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-iridescent text-background shadow-glow-sm">
                <Rows3 className="h-6 w-6" />
              </span>
              <p className="mt-5 font-display text-xl font-semibold">Your feed starts here</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Sign in and follow creators to see their latest public and members-only updates.
              </p>
              <Link
                to="/login"
                search={{ redirect: "/feed" } as never}
                className="btn-luxury mt-6 !px-6 !py-3 text-xs"
              >
                Sign in to CABANA
              </Link>
            </div>
          ) : isLoading ? (
            <FeedLoading />
          ) : isError ? (
            <FeedState
              icon={AlertCircle}
              title="Your feed couldn’t load"
              message="CABANA couldn’t retrieve the latest posts. Check your connection and try again."
              action={
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="btn-luxury !px-5 !py-2.5 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again
                </button>
              }
            />
          ) : !posts || posts.length === 0 ? (
            <FeedState
              icon={Rows3}
              title="Your feed is ready for creators"
              message="Follow creators to collect their latest public and members-only updates here."
              action={
                <Link to="/discover" className="btn-luxury !px-5 !py-2.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Find creators
                </Link>
              }
            />
          ) : visiblePosts.length === 0 ? (
            <FeedState
              icon={SlidersHorizontal}
              title={`No ${filter.toLowerCase()} posts`}
              message="Try another filter to see more from the creators you follow."
              action={
                <button
                  type="button"
                  onClick={() => setFilter("All")}
                  className="btn-ghost text-xs"
                >
                  Show all posts
                </button>
              }
            />
          ) : (
            <FeedBatchScope mediaPostIds={mediaPostIds} engagementPostIds={engagementPostIds}>
              {visiblePosts.map((post, i) => (
                <PostCard key={post.postId} post={post} index={i} />
              ))}
              {posts.length >= limit && limit < FEED_MAX_LIMIT ? (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setLimit(FEED_MAX_LIMIT)}
                    className="btn-ghost text-xs"
                  >
                    Load more posts
                  </button>
                </div>
              ) : posts.length >= FEED_MAX_LIMIT ? (
                <p className="pt-1 text-center text-[11px] text-muted-foreground">
                  Showing your latest 50 posts.
                </p>
              ) : null}
            </FeedBatchScope>
          )}
        </section>
      </div>
    </SocialShell>
  );
}

function FeedComposer({ profile }: { profile: CabanaProfile }) {
  const navigate = useNavigate();
  const initial = (profile?.name || profile?.handle || "?").charAt(0).toUpperCase();

  const openComposer = () => navigate({ to: "/dashboard/posts" });

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-white/[0.1] bg-[linear-gradient(145deg,oklch(0.22_0.025_280/0.78),oklch(0.15_0.018_280/0.72))] shadow-[0_24px_70px_-42px_oklch(0.78_0.18_280/0.8),inset_0_1px_0_oklch(1_0_0/0.1)]">
      <div className="flex gap-3.5 p-4 pb-3 sm:p-5 sm:pb-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-iridescent text-sm font-semibold text-background ring-2 ring-white/10">
          {profile?.avatar ? (
            <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <button
          type="button"
          onClick={openComposer}
          className="min-h-11 flex-1 rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3 text-left text-sm text-muted-foreground outline-none transition-all hover:border-white/[0.14] hover:bg-white/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Share something with your audience…
        </button>
      </div>
      <div className="flex items-center gap-1 border-t border-white/[0.07] px-3 py-2.5 sm:px-4">
        <ComposerAction icon={ImagePlus} label="Photo" onClick={openComposer} />
        <ComposerAction icon={AlignLeft} label="Text" onClick={openComposer} />
        <button
          type="button"
          onClick={openComposer}
          className="btn-luxury ml-auto min-h-9 !rounded-xl !px-4 !py-2 text-xs"
        >
          <PenLine className="h-3.5 w-3.5" />
          Create post
        </button>
      </div>
    </div>
  );
}

function ComposerAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ImagePlus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Create ${label.toLowerCase()} post`}
    >
      <Icon className="h-4 w-4 text-primary" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FilterPills({ active, onChange }: { active: Filter; onChange: (f: Filter) => void }) {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto pb-0.5"
      role="group"
      aria-label="Filter feed posts"
    >
      <span className="mr-1 flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filter
      </span>
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            aria-pressed={active === f}
            className={`min-h-9 shrink-0 rounded-full border px-4 py-2 text-xs font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring ${
              active === f
                ? "border-white/[0.14] bg-white/[0.1] text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]"
                : "border-transparent bg-transparent text-muted-foreground hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeedLoading() {
  return (
    <div className="space-y-5" role="status">
      <span className="sr-only">Loading feed</span>
      {LOADING_PLACEHOLDERS.map((item) => (
        <div
          key={item}
          className="h-72 animate-pulse rounded-xl border border-white/[0.07] bg-white/[0.035]"
        />
      ))}
    </div>
  );
}

function FeedState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: typeof Rows3;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] px-6 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.045] text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mt-5 font-display text-xl font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {message}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
