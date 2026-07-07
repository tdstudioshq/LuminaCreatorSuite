import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState, type KeyboardEvent } from "react";
import {
  AlertCircle,
  ShoppingBag,
  ArrowUpRight,
  Link2,
  Sparkles,
  Mail,
  Crown,
  Grid2X2,
  Images,
  Package,
  RefreshCw,
  ImageOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreatorByHandle,
  LINK_ICONS,
  type CabanaLink,
  type CabanaProduct,
  type ButtonStyle,
} from "@/lib/cabana-store";

const BUTTON_RADIUS: Record<ButtonStyle, string> = {
  rounded: "rounded-2xl",
  pill: "rounded-full",
  square: "rounded-md",
};
import { trackPageView, trackLinkClick, trackProductClick } from "@/lib/cabana-analytics";
import { comingSoon } from "@/lib/coming-soon";
import { useFollow } from "@/lib/use-relationships";
import { useCreatorFeed, usePostMediaUrls } from "@/lib/use-posts";
import type { FeedPost } from "@/lib/cabana-posts";
import { PostCard } from "@/components/cabana/posts/PostCard";
import { ReportButton } from "@/components/cabana/reporting/ReportButton";
import { CreatorSubscribePanel } from "@/components/cabana/subscriptions/CreatorSubscribePanel";
import { useCreatorTiers } from "@/lib/use-subscriptions";
import { useStartConversationWithUsername } from "@/lib/use-messaging";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { SocialRightRail } from "@/components/cabana/social/SocialRightRail";

export const Route = createFileRoute("/$username")({
  component: CreatorProfileRoute,
  head: ({ params }) => ({
    meta: [
      { title: "CABANA" },
      { name: "description", content: `The official CABANA of @${params.username}.` },
      { property: "og:title", content: "CABANA" },
    ],
  }),
});

const LINK_ACCENTS = [
  "oklch(0.85 0.14 60)",
  "oklch(0.78 0.15 230)",
  "oklch(0.75 0.2 330)",
  "oklch(0.78 0.18 20)",
  "oklch(0.85 0.12 195)",
  "oklch(0.78 0.15 280)",
  "oklch(0.7 0.22 25)",
  "oklch(0.82 0.18 145)",
];

type ProfileTab = "posts" | "media" | "products";

const PROFILE_TABS = [
  { id: "posts", label: "Posts", icon: Grid2X2 },
  { id: "media", label: "Media", icon: Images },
  { id: "products", label: "Products", icon: Package },
] as const;
const PROFILE_LOADING_PLACEHOLDERS = [0, 1] as const;

function CreatorProfileRoute() {
  const { username } = Route.useParams();
  return <CreatorProfile username={username} />;
}

export function CreatorProfile({ username }: { username: string }) {
  const navigate = useNavigate();
  const relationship = useFollow(username);
  const startConversation = useStartConversationWithUsername();
  const { data: subscriptionTiers } = useCreatorTiers(username);
  const { data, isLoading, isError, refetch } = useCreatorByHandle(username);
  const profileId = data?.profile.id;
  const [tab, setTab] = useState<ProfileTab>("posts");

  useEffect(() => {
    if (profileId) trackPageView(profileId, { handle: username });
  }, [profileId, username]);

  if (isLoading) {
    return <ProfileLoading />;
  }

  if (isError) {
    return (
      <ProfileStatus
        icon={AlertCircle}
        eyebrow="Unable to load"
        title="This profile is temporarily unavailable"
        message="CABANA couldn’t load the creator data. Check your connection and try again."
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
    );
  }

  if (!data) {
    return (
      <ProfileStatus
        icon={Grid2X2}
        eyebrow="Creator not found"
        title={`@${username} isn’t here yet`}
        message="This handle does not currently have a public creator profile."
        action={
          <Link to="/discover" className="btn-luxury !px-5 !py-2.5 text-xs">
            Explore creators
          </Link>
        }
      />
    );
  }

  const { profile, links, products } = data;
  const handle = profile.handle || username;
  const isSelf = !!relationship.data?.isSelf;
  const avatarInitial = (profile.name || handle).charAt(0).toUpperCase();

  const handleFollow = async () => {
    if (!relationship.signedIn) {
      navigate({ to: "/login", search: { redirect: `/${username}` } as never });
      return;
    }
    try {
      await relationship.toggle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t update follow status.");
    }
  };
  const handleMessage = async () => {
    if (!relationship.signedIn) {
      navigate({ to: "/login", search: { redirect: `/${username}` } as never });
      return;
    }
    try {
      const { conversationId } = await startConversation.mutateAsync(username);
      navigate({ to: "/messages/$conversationId", params: { conversationId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t start a conversation.");
    }
  };
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: ProfileTab) => {
    const currentIndex = PROFILE_TABS.findIndex(({ id }) => id === currentTab);
    const lastIndex = PROFILE_TABS.length - 1;
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % PROFILE_TABS.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + PROFILE_TABS.length) % PROFILE_TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = PROFILE_TABS[nextIndex].id;
    setTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`profile-tab-${nextTab}`)?.focus());
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden" data-cabana-theme={profile.theme}>
      <SocialShell
        rightRail={
          <ProfileRightRail
            links={links}
            profileId={profileId}
            creatorName={profile.name}
            creatorHandle={handle}
            accentColor={profile.accentColor}
            buttonStyle={profile.buttonStyle}
          />
        }
      >
        <div className="mx-auto min-h-screen max-w-[720px] border-x border-white/[0.07] bg-[oklch(0.115_0.012_280/0.46)]">
          <header className="sticky top-0 z-30 flex h-[68px] items-center border-b border-white/[0.07] bg-background/82 px-5 backdrop-blur-2xl sm:px-7">
            <div className="min-w-0">
              <p className="truncate font-display text-[17px] font-semibold tracking-[-0.015em]">
                {profile.name || `@${handle}`}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">@{handle}</p>
            </div>
          </header>

          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.55 }}
          >
            <div className="relative h-56 overflow-hidden border-b border-white/[0.08] bg-white/[0.035] sm:h-[310px]">
              {profile.banner ? (
                <img
                  src={profile.banner}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <>
                  <div className="absolute inset-0 bg-iridescent opacity-75" />
                  <div className="absolute -left-16 top-5 h-52 w-52 rounded-full bg-white/15 blur-3xl" />
                  <div className="absolute -right-12 bottom-0 h-64 w-64 rounded-full bg-black/30 blur-3xl" />
                </>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/20" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/70 to-transparent" />
            </div>

            <div className="px-5 sm:px-7">
              <div className="flex items-end justify-between gap-3">
                <span className="-mt-[58px] flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-iridescent text-2xl font-semibold text-background shadow-[0_24px_65px_-24px_oklch(0_0_0/0.95)] ring-[5px] ring-background sm:-mt-[72px] sm:h-36 sm:w-36">
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={profile.name || `@${handle}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    avatarInitial
                  )}
                </span>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  {isSelf ? (
                    <Link
                      to="/dashboard/profile"
                      className="btn-ghost min-h-10 !rounded-full !px-5 !py-2.5 text-xs"
                    >
                      Edit profile
                    </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleFollow()}
                        disabled={relationship.pending || relationship.blockedByMe}
                        className="btn-luxury min-h-10 min-w-28 !rounded-full !px-5 !py-2.5 text-xs disabled:opacity-60"
                        style={
                          relationship.following
                            ? {
                                background: "oklch(1 0 0 / 0.06)",
                                color: "var(--foreground)",
                                border: "1px solid oklch(1 0 0 / 0.12)",
                                boxShadow: "none",
                              }
                            : {}
                        }
                      >
                        {relationship.pending
                          ? "Updating…"
                          : relationship.blockedByMe
                            ? "Blocked"
                            : relationship.following
                              ? "Following"
                              : "Follow"}
                        {!relationship.following &&
                          !relationship.blockedByMe &&
                          !relationship.pending && <Sparkles className="h-3.5 w-3.5" />}
                      </button>
                      {subscriptionTiers && subscriptionTiers.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            document
                              .getElementById("membership")
                              ?.scrollIntoView({ behavior: "smooth", block: "center" })
                          }
                          className="btn-ghost flex min-h-10 items-center gap-2 !rounded-full !px-3.5 !py-2.5 text-xs sm:!px-4"
                          aria-label="View subscription options"
                        >
                          <Crown className="h-4 w-4 text-iridescent" />
                          <span className="hidden sm:inline">Subscribe</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleMessage()}
                        disabled={startConversation.isPending}
                        className="btn-ghost flex min-h-10 items-center justify-center gap-2 !rounded-full !px-3.5 !py-2.5 text-xs disabled:opacity-50 sm:!px-4"
                        aria-label="Message creator"
                      >
                        <Mail className="h-4 w-4" />
                        <span className="hidden sm:inline">
                          {startConversation.isPending ? "Opening…" : "Message"}
                        </span>
                      </button>
                      {profileId ? (
                        <ReportButton
                          subjectType="creator"
                          subjectId={profileId}
                          subjectLabel="creator profile"
                          iconOnly
                          className="h-10 w-10 rounded-full border border-white/[0.08] bg-white/[0.035] hover:bg-white/[0.07]"
                        />
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              <div className="pb-6 pt-5">
                <h1 className="font-display text-[2rem] font-semibold leading-none tracking-[-0.04em] sm:text-[2.4rem]">
                  {profile.name || `@${handle}`}
                </h1>
                {profile.headline ? (
                  <p
                    className="mt-1.5 text-[15px] font-medium text-foreground/90"
                    style={profile.accentColor ? { color: profile.accentColor } : undefined}
                  >
                    {profile.headline}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span>@{handle}</span>
                  {relationship.signedIn && !relationship.loading ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-medium text-foreground/75">
                        {relationship.followerCount}{" "}
                        {relationship.followerCount === 1 ? "follower" : "followers"}
                      </span>
                    </>
                  ) : null}
                </div>
                {profile.bio ? (
                  <p className="mt-5 max-w-2xl whitespace-pre-wrap text-[15px] leading-7 text-foreground/88">
                    {profile.bio}
                  </p>
                ) : null}
                {links[0] ? (
                  <a
                    href={
                      links[0].url.startsWith("http") ? links[0].url : `https://${links[0].url}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      profileId &&
                      trackLinkClick(profileId, links[0].id, {
                        url: links[0].url,
                        title: links[0].title,
                      })
                    }
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-primary outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {compactLinkLabel(links[0].url)}
                  </a>
                ) : null}
              </div>
            </div>
          </motion.section>

          <div className="border-t border-white/[0.07] px-5 pb-6 sm:px-7">
            <CreatorSubscribePanel username={username} />
          </div>

          <div
            role="tablist"
            aria-label={`${profile.name || handle} content`}
            className="sticky top-[68px] z-20 flex border-y border-white/[0.07] bg-background/88 backdrop-blur-2xl"
          >
            {PROFILE_TABS.map(({ id, label, icon: Icon }) => {
              return (
                <button
                  key={id}
                  id={`profile-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  aria-controls="profile-panel"
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setTab(id)}
                  onKeyDown={(event) => handleTabKeyDown(event, id)}
                  className={`relative flex min-h-14 flex-1 items-center justify-center gap-2 px-2 py-4 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:text-sm ${
                    tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {tab === id ? (
                    <motion.div
                      layoutId="profileTab"
                      className="absolute inset-x-[18%] -bottom-px h-0.5 rounded-full bg-iridescent shadow-glow-sm"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <section
            id="profile-panel"
            role="tabpanel"
            aria-labelledby={`profile-tab-${tab}`}
            className="min-h-64"
          >
            {tab === "posts" ? (
              <CreatorPosts
                username={username}
                onUnlock={() => void handleFollow()}
                unlockPending={relationship.pending}
                isOwner={isSelf}
              />
            ) : tab === "media" ? (
              <CreatorMedia username={username} />
            ) : (
              <ProductsTab products={products} profileId={profileId} />
            )}
          </section>
        </div>
      </SocialShell>
    </div>
  );
}

function CreatorPosts({
  username,
  onUnlock,
  unlockPending,
  isOwner,
}: {
  username: string;
  onUnlock: () => void;
  unlockPending: boolean;
  isOwner: boolean;
}) {
  const { data: posts, isLoading, isError, refetch } = useCreatorFeed(username);
  if (isLoading) {
    return <ProfileContentLoading />;
  }
  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Posts couldn’t load"
        message="Try again to reconnect to this creator’s feed."
        action={
          <button type="button" onClick={() => void refetch()} className="btn-ghost text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        }
      />
    );
  }
  if (!posts || posts.length === 0) {
    return (
      <EmptyState
        icon={Grid2X2}
        title="No posts yet"
        message="New posts from this creator will appear here."
      />
    );
  }
  return (
    <div className="space-y-5 p-4 sm:p-5">
      {posts.map((post, i) => (
        <PostCard
          key={post.postId}
          post={post}
          index={i}
          onUnlock={onUnlock}
          unlockPending={unlockPending}
          isOwner={isOwner}
        />
      ))}
    </div>
  );
}

function CreatorMedia({ username }: { username: string }) {
  const { data: posts, isLoading, isError, refetch } = useCreatorFeed(username);
  const mediaPosts = (posts ?? []).filter((post) => !post.locked && post.media.length > 0);

  if (isLoading) return <ProfileContentLoading />;
  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Media couldn’t load"
        message="Try again to reload this creator’s media."
        action={
          <button type="button" onClick={() => void refetch()} className="btn-ghost text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        }
      />
    );
  }
  if (mediaPosts.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title="No media yet"
        message="Photos from this creator’s accessible posts will appear here."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 p-1 sm:grid-cols-3" aria-label="Creator media">
      {mediaPosts.map((post, index) => (
        <ProfileMediaTile key={post.postId} post={post} index={index} />
      ))}
    </div>
  );
}

function ProfileMediaTile({ post, index }: { post: FeedPost; index: number }) {
  const { data: media, isLoading, isError } = usePostMediaUrls(post.postId);
  const firstMedia = media?.[0];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay: index * 0.035 }}
    >
      <Link
        to="/post/$postId"
        params={{ postId: post.postId }}
        className="group relative block aspect-square overflow-hidden rounded-md bg-white/[0.04] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`View post${post.caption ? `: ${post.caption}` : ""}`}
      >
        {isLoading ? (
          <span className="absolute inset-0 animate-pulse bg-white/[0.06]" />
        ) : firstMedia?.url ? (
          <img
            src={firstMedia.url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] group-hover:opacity-90"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            {isError ? <ImageOff className="h-5 w-5" /> : <Images className="h-5 w-5" />}
          </span>
        )}
        {post.media.length > 1 ? (
          <span className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-medium backdrop-blur-md">
            +{post.media.length - 1}
          </span>
        ) : null}
        <span className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8 text-xs text-white transition-transform group-hover:translate-y-0 group-focus-visible:translate-y-0">
          {post.caption || "View post"}
        </span>
      </Link>
    </motion.div>
  );
}

function ProductsTab({
  products,
  profileId,
}: {
  products: CabanaProduct[];
  profileId: string | undefined;
}) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No products yet"
        message="Products and creator drops will appear here."
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5">
      {products.map((p, i) => (
        <motion.button
          key={p.id}
          type="button"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: i * 0.05 }}
          whileHover={{ y: -4 }}
          onClick={() => {
            if (profileId) trackProductClick(profileId, p.id, { title: p.title });
            comingSoon("Product checkout");
          }}
          className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/[0.08] bg-background text-left shadow-[0_24px_55px_-38px_oklch(0_0_0/0.95)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`View ${p.title}`}
        >
          <img
            src={p.img}
            alt={p.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
          <span className="absolute right-2.5 top-2.5 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest backdrop-blur-md">
            {p.type}
          </span>
          <div className="absolute inset-x-0 bottom-0 p-3.5">
            <p className="line-clamp-2 text-sm font-medium leading-tight">{p.title}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-display text-base font-semibold text-chrome">{p.price}</span>
              <span className="rounded-full border border-white/15 bg-black/35 p-2 backdrop-blur-md">
                <ShoppingBag className="h-3 w-3" />
              </span>
            </div>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

function ProfileRightRail({
  links,
  profileId,
  creatorName,
  creatorHandle,
  accentColor,
  buttonStyle,
}: {
  links: CabanaLink[];
  profileId: string | undefined;
  creatorName: string;
  creatorHandle: string;
  accentColor: string;
  buttonStyle: ButtonStyle;
}) {
  return (
    <SocialRightRail
      searchPlaceholder={`Search ${creatorName || creatorHandle} posts`}
      contextContent={
        links.length > 0 ? (
          <LinksCard
            links={links}
            profileId={profileId}
            accentColor={accentColor}
            buttonStyle={buttonStyle}
          />
        ) : undefined
      }
    />
  );
}

function LinksCard({
  links,
  profileId,
  accentColor,
  buttonStyle,
}: {
  links: CabanaLink[];
  profileId: string | undefined;
  accentColor: string;
  buttonStyle: ButtonStyle;
}) {
  const rowRadius = BUTTON_RADIUS[buttonStyle] ?? "rounded-2xl";
  return (
    <section className="overflow-hidden rounded-[28px] border border-white/[0.09] bg-[linear-gradient(150deg,oklch(0.19_0.02_280/0.68),oklch(0.14_0.015_280/0.58))] p-5 shadow-[0_24px_70px_-50px_oklch(0_0_0/0.95),inset_0_1px_0_oklch(1_0_0/0.08)]">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-primary">
        Creator links
      </p>
      <h2 className="mb-3 mt-1 font-display text-base font-semibold">Around the web</h2>
      <div className="space-y-2">
        {links.map((l, i) => {
          const Icon = LINK_ICONS[l.icon] ?? LINK_ICONS.globe;
          // A creator-set accent overrides the rotating palette; older profiles
          // (accentColor === "") keep the varied per-link palette.
          const accent = accentColor || LINK_ACCENTS[i % LINK_ACCENTS.length];
          return (
            <a
              key={l.id}
              href={l.url.startsWith("http") ? l.url : `https://${l.url}`}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                profileId && trackLinkClick(profileId, l.id, { url: l.url, title: l.title })
              }
              className={`group flex items-center gap-3 ${rowRadius} p-2.5 outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl glass-strong"
                style={{ boxShadow: `0 0 20px -8px ${accent}` }}
              >
                <Icon className="h-4 w-4" style={{ color: accent }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {l.title}
                  {l.featured && <Crown className="h-3 w-3" style={{ color: accent }} />}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {l.scheduled ?? l.url}
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:rotate-45 group-hover:text-foreground" />
            </a>
          );
        })}
      </div>
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: typeof Grid2X2;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="p-5 sm:p-6">
      <div className="rounded-[28px] border border-dashed border-white/[0.1] bg-white/[0.02] px-6 py-14 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/[0.1] bg-white/[0.04] text-primary shadow-[inset_0_1px_0_oklch(1_0_0/0.08)]">
          <Icon className="h-6 w-6" />
        </span>
        <h2 className="mt-5 font-display text-xl font-semibold">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

function ProfileLoading() {
  return (
    <SocialShell>
      <div className="mx-auto min-h-screen max-w-[720px] border-x border-white/[0.07]">
        <div className="h-[68px] animate-pulse border-b border-white/[0.07] bg-white/[0.025]" />
        <div className="h-56 animate-pulse bg-white/[0.045] sm:h-[310px]" />
        <div className="px-5 sm:px-7">
          <div className="-mt-14 h-28 w-28 animate-pulse rounded-full bg-white/[0.08] ring-[5px] ring-background sm:-mt-[72px] sm:h-36 sm:w-36" />
          <div className="space-y-3 pb-8 pt-5">
            <div className="h-8 w-52 animate-pulse rounded-full bg-white/[0.07]" />
            <div className="h-4 w-28 animate-pulse rounded-full bg-white/[0.05]" />
            <div className="h-4 w-full max-w-md animate-pulse rounded-full bg-white/[0.05]" />
            <div className="h-4 w-2/3 max-w-sm animate-pulse rounded-full bg-white/[0.05]" />
          </div>
        </div>
        <ProfileContentLoading />
      </div>
    </SocialShell>
  );
}

function ProfileContentLoading() {
  return (
    <div className="space-y-5 p-5" role="status">
      <span className="sr-only">Loading creator content</span>
      {PROFILE_LOADING_PLACEHOLDERS.map((item) => (
        <div
          key={item}
          className="h-64 animate-pulse rounded-[28px] border border-white/[0.07] bg-white/[0.035]"
        />
      ))}
    </div>
  );
}

function ProfileStatus({
  icon: Icon,
  eyebrow,
  title,
  message,
  action,
}: {
  icon: typeof Grid2X2;
  eyebrow: string;
  title: string;
  message: string;
  action: React.ReactNode;
}) {
  return (
    <SocialShell>
      <div className="mx-auto flex min-h-screen max-w-[720px] items-center justify-center border-x border-white/[0.07] px-5 py-16">
        <div className="w-full max-w-md rounded-[32px] border border-white/[0.09] bg-white/[0.035] p-8 text-center shadow-luxury sm:p-10">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/[0.1] bg-white/[0.05] text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>
          <div className="mt-6 flex justify-center">{action}</div>
        </div>
      </div>
    </SocialShell>
  );
}

function compactLinkLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
