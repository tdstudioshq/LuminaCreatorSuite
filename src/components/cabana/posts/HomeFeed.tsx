import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlignLeft,
  ImagePlus,
  Loader2,
  PenLine,
  Rows3,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { useAuthSession } from "@/lib/cabana-auth";
import { useCabana, type CabanaProfile } from "@/lib/cabana-store";
import { useHomeFeed } from "@/lib/use-posts";
import { PostCard } from "./PostCard";

const FILTERS = ["All", "Photos", "Free", "Locked"] as const;
type Filter = (typeof FILTERS)[number];

export function HomeFeed() {
  const { user, loading: sessionLoading } = useAuthSession();
  const { profile } = useCabana();
  const { data: posts, isLoading } = useHomeFeed();
  const [filter, setFilter] = useState<Filter>("All");

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
      <div className="mx-auto min-h-screen max-w-[680px] border-x border-white/[0.07] bg-[oklch(0.115_0.012_280/0.42)]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-white/[0.07] bg-background/80 px-5 backdrop-blur-2xl sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">Home</h1>
              <span className="h-1.5 w-1.5 rounded-full bg-iridescent shadow-glow-sm" />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Your private creator feed</p>
          </div>
          <Link
            to="/discover"
            className="flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-medium text-muted-foreground outline-none transition-all hover:border-white/[0.16] hover:bg-white/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Discover
          </Link>
        </header>

        <div className="border-b border-white/[0.07] px-4 py-4 sm:px-5">
          {user && profile ? <FeedComposer profile={profile} /> : null}
          <FilterPills active={filter} onChange={setFilter} />
        </div>

        <section aria-label="Feed posts" className="divide-y divide-white/[0.07]">
          {sessionLoading ? (
            <Centered>
              <Loader2 className="h-5 w-5 animate-spin" />
            </Centered>
          ) : !user ? (
            <div className="m-5 rounded-[28px] border border-white/[0.09] bg-white/[0.035] p-10 text-center shadow-luxury">
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
            <Centered>
              <Loader2 className="h-5 w-5 animate-spin" />
            </Centered>
          ) : !posts || posts.length === 0 ? (
            <FeedEmpty message="Your feed is empty. Follow creators to fill it with their latest posts." />
          ) : visiblePosts.length === 0 ? (
            <FeedEmpty message={`No ${filter.toLowerCase()} posts in your feed right now.`} />
          ) : (
            visiblePosts.map((post, i) => <PostCard key={post.postId} post={post} index={i} />)
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
    <div className="mb-4 overflow-hidden rounded-[26px] border border-white/[0.1] bg-[linear-gradient(145deg,oklch(0.22_0.025_280/0.78),oklch(0.15_0.018_280/0.72))] shadow-[0_24px_70px_-42px_oklch(0.78_0.18_280/0.8),inset_0_1px_0_oklch(1_0_0/0.1)]">
      <div className="flex gap-3.5 p-4 sm:p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-iridescent text-sm font-semibold text-background ring-2 ring-white/10">
          {profile?.avatar ? (
            <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <button
          type="button"
          onClick={openComposer}
          className="min-h-20 flex-1 rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3 text-left text-sm text-muted-foreground outline-none transition-all hover:border-white/[0.14] hover:bg-white/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Share an update with your audience…
        </button>
      </div>
      <div className="flex items-center gap-1 border-t border-white/[0.07] px-3 py-2.5 sm:px-4">
        <ComposerAction icon={ImagePlus} label="Photo" onClick={openComposer} />
        <ComposerAction icon={AlignLeft} label="Text" onClick={openComposer} />
        <button
          type="button"
          onClick={openComposer}
          className="btn-luxury ml-auto !rounded-xl !px-4 !py-2 text-xs"
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
    >
      <Icon className="h-4 w-4 text-primary" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FilterPills({ active, onChange }: { active: Filter; onChange: (f: Filter) => void }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
      <span className="mr-1 flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filter
      </span>
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onChange(f)}
            aria-pressed={active === f}
            className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring ${
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

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center py-12 text-muted-foreground">{children}</div>;
}

function FeedEmpty({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="rounded-3xl border border-dashed border-white/[0.1] px-6 py-12 text-center text-sm text-muted-foreground">
        {message}
      </div>
    </div>
  );
}
