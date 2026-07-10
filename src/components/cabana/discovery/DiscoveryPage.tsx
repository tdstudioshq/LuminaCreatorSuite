import { Link, useRouterState } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Clock3,
  Compass,
  Loader2,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PostCard } from "@/components/cabana/posts/PostCard";
import { FeedBatchScope } from "@/components/cabana/posts/FeedBatchScope";
import { EmptyState } from "@/components/cabana/EmptyState";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedField } from "@/hooks/use-debounced-callback";
import type { FeedPost } from "@/lib/cabana-posts";
import {
  countDiscoverySearchResults,
  DISCOVERY_TIME_WINDOWS,
  interleaveDiscoveryFeed,
  type DiscoveryCreator,
  type DiscoveryFeedItem,
  type DiscoverySuggestedCreator,
  type DiscoveryTimeWindow,
} from "@/lib/cabana-discovery";
import { useDiscoverySearch, useDiscoverySnapshot } from "@/lib/use-discovery";

const INITIAL_EXPLORE_ITEMS = 8;
const EXPLORE_PAGE_SIZE = 6;
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function DiscoveryPage() {
  const routeQuery = useRouterState({
    select: (state) => new URLSearchParams(state.location.searchStr).get("q")?.trim() ?? "",
  });
  const [searchTerm, setSearchTerm] = useState(() => routeQuery);
  const [timeWindow, setTimeWindow] = useState<DiscoveryTimeWindow>("7d");
  const [visibleExploreItems, setVisibleExploreItems] = useState(INITIAL_EXPLORE_ITEMS);
  const [searchInput, onSearchInputChange] = useDebouncedField(searchTerm, setSearchTerm, 300);
  const snapshot = useDiscoverySnapshot(timeWindow);
  const search = useDiscoverySearch(searchTerm);
  const hasQuery = searchTerm.trim().length > 0;
  const allMixedFeed = useMemo(
    () =>
      interleaveDiscoveryFeed(
        snapshot.data?.explorePosts ?? [],
        snapshot.data?.featuredCreators ?? [],
        50,
      ),
    [snapshot.data],
  );
  const mixedFeed = allMixedFeed.slice(0, visibleExploreItems);
  const hasMoreExploreItems = mixedFeed.length < allMixedFeed.length;
  const rankedWindow = snapshot.data?.timeWindow ?? timeWindow;

  const handleWindowChange = (nextWindow: DiscoveryTimeWindow) => {
    setTimeWindow(nextWindow);
    setVisibleExploreItems(INITIAL_EXPLORE_ITEMS);
  };

  const clearSearch = () => {
    onSearchInputChange("");
    setSearchTerm("");
  };

  return (
    <SocialShell rightRail={null}>
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 border-x border-border/50 px-4 py-6 sm:px-6 lg:px-8">
        <header className="space-y-3">
          <p className="eyebrow text-muted-foreground">Discovery</p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-2">
              <h1 className="font-display text-4xl font-semibold tracking-tighter md:text-5xl">
                Discover creators and posts
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Explore featured creators, trending posts, and personalized suggestions built from
                the existing public graph.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <StatPill icon={Compass} label="Explore" />
              <StatPill icon={Search} label="Global search" />
              <StatPill icon={Sparkles} label="Suggested creators" />
            </div>
          </div>
        </header>

        <section className="glass-strong rounded-3xl p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-iridescent/10 text-iridescent">
              <Search className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Global search</p>
              <p className="text-xs text-muted-foreground">
                Search public creators, usernames, display names, and post captions.
              </p>
            </div>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => onSearchInputChange(event.target.value)}
              placeholder="Search creators, usernames, posts, or #hashtags"
              aria-label="Search creators and posts"
              className="h-11 rounded-2xl border-border/60 bg-background/40 pl-10 pr-20"
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border/60 px-2.5 py-1">
              Debounced by 300ms
            </span>
            {hasQuery ? (
              <span className="rounded-full border border-border/60 px-2.5 py-1">
                Searching for “{searchTerm}”
              </span>
            ) : (
              <span className="rounded-full border border-border/60 px-2.5 py-1">
                Type to filter the live discovery graph
              </span>
            )}
          </div>
        </section>

        {hasQuery ? (
          <SearchResultsPanel
            query={searchTerm}
            creators={search.data?.creators ?? []}
            posts={search.data?.posts ?? []}
            isLoading={search.isLoading}
            isFetching={search.isFetching}
            isError={search.isError}
            error={search.error}
            onRetry={() => void search.refetch()}
          />
        ) : snapshot.isLoading ? (
          <DiscoveryLoadingState />
        ) : snapshot.isError ? (
          <DiscoveryErrorState
            title="Couldn't load discovery"
            description={
              snapshot.error instanceof Error ? snapshot.error.message : "Please try again."
            }
            onRetry={() => void snapshot.refetch()}
          />
        ) : (
          <>
            <DiscoveryMixedFeed
              items={mixedFeed}
              hasMore={hasMoreExploreItems}
              onLoadMore={() => setVisibleExploreItems((current) => current + EXPLORE_PAGE_SIZE)}
            />
            <CreatorsSection
              title="Featured creators"
              description="A curated starting point built from popularity and freshness."
              creators={snapshot.data?.featuredCreators ?? []}
              badge="Featured"
              icon={Sparkles}
            />
            <TrendingWindowPicker
              value={timeWindow}
              isUpdating={snapshot.isFetching}
              onChange={handleWindowChange}
            />
            <PostsSection
              title="Trending posts"
              description={`Posts with the strongest engagement momentum in the ${timeWindowLabel(rankedWindow).toLowerCase()}.`}
              posts={snapshot.data?.trendingPosts ?? []}
              badge="Trending"
              icon={TrendingUp}
              isLoading={snapshot.isFetching}
            />
            <CreatorsSection
              title="Trending creators"
              description={`Creators with strong momentum in the ${timeWindowLabel(rankedWindow).toLowerCase()}.`}
              creators={snapshot.data?.trendingCreators ?? []}
              badge="Trending"
              icon={TrendingUp}
            />
            <CreatorsSection
              title="Recently active creators"
              description="Creators who have been active most recently on the public graph."
              creators={snapshot.data?.recentlyActiveCreators ?? []}
              badge="Recent"
              icon={Clock3}
            />
            <SuggestedCreatorsSection suggestions={snapshot.data?.suggestedCreators ?? []} />
          </>
        )}
      </div>
    </SocialShell>
  );
}

function SearchResultsPanel({
  query,
  creators,
  posts,
  isLoading,
  isFetching,
  isError,
  error,
  onRetry,
}: {
  query: string;
  creators: DiscoveryCreator[];
  posts: readonly FeedPost[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const counts = countDiscoverySearchResults({ creators, posts });
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-muted-foreground">Search results</p>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Results for “{query}”
          </h2>
          <p className="text-sm text-muted-foreground">
            {isFetching && !isLoading
              ? "Updating results…"
              : `${counts.total} ${counts.total === 1 ? "match" : "matches"} · ${counts.creators} creators · ${counts.posts} posts`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <DiscoveryLoadingState compact />
      ) : isError ? (
        <DiscoveryErrorState
          title="Couldn't search discovery"
          description={error instanceof Error ? error.message : "Please try again."}
          onRetry={onRetry}
        />
      ) : counts.total === 0 ? (
        <EmptyResultsState query={query} />
      ) : (
        <div className="space-y-6">
          <CreatorsSection
            title={`Creators (${counts.creators})`}
            description="Public creators matching a username, display name, or bio."
            creators={creators}
            badge={`${counts.creators} found`}
            icon={Users}
            emptyLabel="No creators match this search."
          />
          <PostsSection
            title={`Posts (${counts.posts})`}
            description="Public posts matching caption text or hashtags."
            posts={posts}
            badge={`${counts.posts} found`}
            icon={Search}
            emptyLabel="No posts match this search."
          />
        </div>
      )}
    </section>
  );
}

function DiscoveryMixedFeed({
  items,
  hasMore,
  onLoadMore,
}: {
  items: DiscoveryFeedItem[];
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Explore feed"
        title="Start here"
        description="A mixed rail of featured creators and posts that gives the platform some immediate shape."
        badge="Explore"
        icon={Compass}
      />

      {items.length === 0 ? (
        <EmptyFeedState />
      ) : (
        <FeedBatchScope
          mediaPostIds={items
            .flatMap((it) => (it.kind === "post" ? [it.post] : []))
            .filter((p) => !p.locked && p.media.length > 0)
            .map((p) => p.postId)}
          engagementPostIds={items
            .flatMap((it) => (it.kind === "post" ? [it.post] : []))
            .filter((p) => !p.locked)
            .map((p) => p.postId)}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item, index) =>
              item.kind === "post" ? (
                <div key={item.post.postId} className={index % 3 === 0 ? "lg:col-span-2" : ""}>
                  <PostCard post={item.post} index={index} />
                </div>
              ) : (
                <CreatorCard key={item.creator.profileId} creator={item.creator} badge="Featured" />
              ),
            )}
          </div>
        </FeedBatchScope>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" className="rounded-full" onClick={onLoadMore}>
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}

function CreatorsSection({
  title,
  description,
  creators,
  badge,
  icon,
  emptyLabel,
}: {
  title: string;
  description: string;
  creators: DiscoveryCreator[];
  badge: string;
  icon: LucideIcon;
  emptyLabel?: string;
}) {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow={badge}
        title={title}
        description={description}
        badge={badge}
        icon={icon}
      />
      {creators.length === 0 ? (
        <InlineEmptyState label={emptyLabel ?? `No ${title.toLowerCase()} yet.`} icon={icon} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {creators.map((creator) => (
            <CreatorCard key={creator.profileId} creator={creator} badge={badge} />
          ))}
        </div>
      )}
    </section>
  );
}

function PostsSection({
  title,
  description,
  posts,
  badge,
  icon,
  emptyLabel,
  isLoading = false,
}: {
  title: string;
  description: string;
  posts: readonly FeedPost[];
  badge: string;
  icon: LucideIcon;
  emptyLabel?: string;
  isLoading?: boolean;
}) {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow={badge}
        title={title}
        description={description}
        badge={badge}
        icon={icon}
      />
      {isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <InlineEmptyState label={emptyLabel ?? `No ${title.toLowerCase()} yet.`} icon={icon} />
      ) : (
        <FeedBatchScope
          mediaPostIds={posts.filter((p) => !p.locked && p.media.length > 0).map((p) => p.postId)}
          engagementPostIds={posts.filter((p) => !p.locked).map((p) => p.postId)}
        >
          <div className="space-y-4">
            {posts.map((post, index) => (
              <PostCard key={post.postId} post={post} index={index} />
            ))}
          </div>
        </FeedBatchScope>
      )}
    </section>
  );
}

function SuggestedCreatorsSection({ suggestions }: { suggestions: DiscoverySuggestedCreator[] }) {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Suggested"
        title="Suggested creators"
        description="Explainable recommendations based on existing follows, subscriptions, activity, and popularity."
        badge="Suggested"
        icon={UserPlus}
      />
      {suggestions.length === 0 ? (
        <InlineEmptyState label="No suggested creators yet." icon={UserPlus} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suggestions.map(({ creator, reason }) => (
            <CreatorCard
              key={creator.profileId}
              creator={creator}
              badge="Suggested"
              recommendationReason={reason.label}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TrendingWindowPicker({
  value,
  isUpdating,
  onChange,
}: {
  value: DiscoveryTimeWindow;
  isUpdating: boolean;
  onChange: (window: DiscoveryTimeWindow) => void;
}) {
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">Trending window</p>
        <p className="text-xs text-muted-foreground">
          Rank creators and posts using activity inside a deterministic time range.
        </p>
      </div>
      <div
        role="group"
        aria-label="Trending time window"
        className="flex flex-wrap items-center gap-2"
      >
        {DISCOVERY_TIME_WINDOWS.map((window) => (
          <Button
            key={window}
            type="button"
            size="sm"
            variant={value === window ? "primary" : "outline"}
            aria-pressed={value === window}
            onClick={() => onChange(window)}
            className="rounded-full"
          >
            {timeWindowLabel(window)}
          </Button>
        ))}
        {isUpdating && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating
          </span>
        )}
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  badge,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow text-muted-foreground">{eyebrow}</p>
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1 text-[11px]">
        <Icon className="h-3.5 w-3.5" />
        {badge}
      </Badge>
    </div>
  );
}

function CreatorCard({
  creator,
  badge,
  recommendationReason,
}: {
  creator: DiscoveryCreator;
  badge: string;
  recommendationReason?: string;
}) {
  const fallback =
    creator.displayName.trim().charAt(0).toUpperCase() || creator.username.charAt(0).toUpperCase();
  const stats = [
    `Followers ${formatCompactNumber(creator.followerCount)}`,
    `${formatCompactNumber(creator.postCount)} posts`,
    `Active ${formatDistanceToNow(new Date(creator.updatedAt), { addSuffix: true })}`,
  ];

  return (
    <article className="glass flex h-full flex-col rounded-3xl p-5">
      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12 border border-border/50">
          <AvatarImage src={creator.avatarUrl ?? undefined} alt={creator.displayName} />
          <AvatarFallback>{fallback}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/$username"
              params={{ username: creator.username }}
              className="truncate text-base font-semibold transition-colors hover:text-iridescent"
            >
              {creator.displayName}
            </Link>
            <Badge variant="outline" className="rounded-full text-[10px]">
              {badge}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">@{creator.username}</p>
        </div>
      </div>

      {creator.bio && <p className="mt-4 line-clamp-3 text-sm text-foreground/85">{creator.bio}</p>}

      {recommendationReason && (
        <div className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-iridescent/10 px-3 py-1.5 text-[11px] text-iridescent">
          <Sparkles className="h-3.5 w-3.5" />
          {recommendationReason}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {stats.map((item) => (
          <span key={item} className="rounded-full border border-border/50 px-2.5 py-1">
            {item}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Link
          to="/$username"
          params={{ username: creator.username }}
          className="btn-ghost !px-3.5 !py-2 text-xs"
        >
          Open profile
        </Link>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
          Public profile
        </span>
      </div>
    </article>
  );
}

function DiscoveryLoadingState({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-6">
      <LoadingPanel />
      <div className="space-y-4">
        <SectionHeader
          eyebrow="Featured"
          title="Featured creators"
          description="Loading creator discovery…"
          badge="Loading"
          icon={Sparkles}
        />
        <div
          className={`grid gap-4 ${compact ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}
        >
          {Array.from({ length: 3 }).map((_, index) => (
            <CreatorSkeleton key={index} />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <SectionHeader
          eyebrow="Trending"
          title="Trending posts"
          description="Loading post discovery…"
          badge="Loading"
          icon={TrendingUp}
        />
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <PostSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <section className="glass rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-72" />
        </div>
      </div>
    </section>
  );
}

function CreatorSkeleton() {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
      </div>
      <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
    </div>
  );
}

function DiscoveryErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <section className="glass rounded-3xl p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <button onClick={onRetry} className="btn-ghost mt-4 !px-3 !py-2 text-xs">
        Try again
      </button>
    </section>
  );
}

function EmptyFeedState() {
  return (
    <section className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
      No discovery content is available yet.
    </section>
  );
}

function EmptyResultsState({ query }: { query: string }) {
  return (
    <section className="glass rounded-3xl p-8 text-center">
      <p className="text-sm font-medium">No results for “{query}”</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Check the spelling or try a shorter creator name, username, post phrase, or hashtag.
        Hashtags are matched against post captions; CABANA does not maintain a separate taxonomy.
      </p>
    </section>
  );
}

function InlineEmptyState({ label, icon: Icon = Sparkles }: { label: string; icon?: LucideIcon }) {
  // Standardized empty state (Batch 2) — a visible icon + message instead of the
  // near-invisible faint card that read as a blank void.
  return <EmptyState icon={Icon} title={label} />;
}

function StatPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-foreground/[0.03] px-3 py-1">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function formatCompactNumber(value: number): string {
  return COMPACT_NUMBER_FORMATTER.format(value);
}

function timeWindowLabel(window: DiscoveryTimeWindow): string {
  if (window === "24h") return "Past 24 hours";
  if (window === "7d") return "Past 7 days";
  if (window === "30d") return "Past 30 days";
  return "All time";
}
