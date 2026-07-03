import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  ArrowUpRight,
  Link2,
  Sparkles,
  Mail,
  Crown,
  Loader2,
  Search,
  Grid2X2,
  Images,
} from "lucide-react";
import { toast } from "sonner";
import cabanaLogo from "@/assets/cabana-logo.webp";
import {
  useCreatorByHandle,
  LINK_ICONS,
  type CabanaLink,
  type CabanaProduct,
} from "@/lib/cabana-store";
import { trackPageView, trackLinkClick, trackProductClick } from "@/lib/cabana-analytics";
import { comingSoon } from "@/lib/coming-soon";
import { useFollow } from "@/lib/use-relationships";
import { useCreatorFeed } from "@/lib/use-posts";
import { PostCard } from "@/components/cabana/posts/PostCard";
import { ReportButton } from "@/components/cabana/reporting/ReportButton";
import { CreatorSubscribePanel } from "@/components/cabana/subscriptions/CreatorSubscribePanel";
import { useStartConversationWithUsername } from "@/lib/use-messaging";
import { SocialShell } from "@/components/cabana/social/SocialShell";

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

type ProfileTab = "posts" | "media";

function CreatorProfileRoute() {
  const { username } = Route.useParams();
  return <CreatorProfile username={username} />;
}

export function CreatorProfile({ username }: { username: string }) {
  const navigate = useNavigate();
  const relationship = useFollow(username);
  const startConversation = useStartConversationWithUsername();
  const { data, isLoading } = useCreatorByHandle(username);
  const profileId = data?.profile.id;
  const [tab, setTab] = useState<ProfileTab>("posts");

  useEffect(() => {
    if (profileId) trackPageView(profileId, { handle: username });
  }, [profileId, username]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs uppercase tracking-[0.3em] text-muted-foreground animate-pulse">
        Loading creator…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-strong rounded-3xl p-10 text-center max-w-sm">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Not found
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">@{username}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This creator hasn't claimed their CABANA yet.
          </p>
          <Link to="/signup" className="btn-luxury mt-6 !px-5 !py-2.5 text-xs">
            Claim @{username}
          </Link>
        </div>
      </div>
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

  return (
    <div className="relative min-h-screen overflow-x-hidden" data-cabana-theme={profile.theme}>
      <SocialShell
        rightRail={
          <ProfileRightRail links={links} profileId={profileId} creatorName={profile.name} />
        }
      >
        <div className="mx-auto min-h-screen max-w-[680px] border-x border-white/[0.07] bg-[oklch(0.115_0.012_280/0.46)]">
          <header className="sticky top-0 z-20 flex h-[64px] items-center border-b border-white/[0.07] bg-background/80 px-5 backdrop-blur-2xl sm:px-6">
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold">
                {profile.name || `@${handle}`}
              </p>
              <p className="text-[11px] text-muted-foreground">Creator profile</p>
            </div>
          </header>

          {/* COVER + AVATAR */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative h-52 overflow-hidden border-b border-white/[0.08] bg-white/[0.035] sm:h-[280px]">
              {profile.banner ? (
                <img
                  src={profile.banner}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-iridescent" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-black/10" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-iridescent opacity-60" />
            </div>

            {/* Avatar overlapping the cover + action buttons */}
            <div className="px-5 sm:px-6">
              <div className="flex items-end justify-between gap-4">
                <span className="-mt-14 flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-iridescent text-2xl font-semibold text-background shadow-[0_24px_65px_-28px_oklch(0_0_0/0.95)] ring-[5px] ring-background sm:-mt-16 sm:h-32 sm:w-32">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    avatarInitial
                  )}
                </span>

                <div className="mt-4 flex items-center gap-2">
                  {isSelf ? (
                    <Link
                      to="/dashboard/profile"
                      className="btn-ghost !rounded-full !px-5 !py-2.5 text-xs"
                    >
                      Edit profile
                    </Link>
                  ) : (
                    <>
                      <button
                        onClick={() => void handleFollow()}
                        disabled={relationship.pending || relationship.blockedByMe}
                        className="btn-luxury min-w-28 !rounded-full !px-5 !py-2.5 text-xs disabled:opacity-60"
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
                      <button
                        onClick={() => void handleMessage()}
                        disabled={startConversation.isPending}
                        className="btn-ghost flex h-10 w-10 items-center justify-center !rounded-full !p-0 disabled:opacity-50"
                        aria-label="Message creator"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Identity */}
              <div className="pb-5 pt-4">
                <h1 className="font-display text-3xl font-semibold tracking-[-0.035em]">
                  {profile.name || `@${handle}`}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground/70">@{handle}</span>
                  {relationship.signedIn && !relationship.loading && (
                    <>
                      <span aria-hidden>·</span>
                      <span>
                        {relationship.followerCount}{" "}
                        {relationship.followerCount === 1 ? "follower" : "followers"}
                      </span>
                    </>
                  )}
                </div>
                {profile.bio && (
                  <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-foreground/85">
                    {profile.bio}
                  </p>
                )}
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
                {profileId && !isSelf && (
                  <div className="mt-3">
                    <ReportButton
                      subjectType="creator"
                      subjectId={profileId}
                      subjectLabel="creator profile"
                      className="text-[11px] text-muted-foreground/70 hover:bg-transparent hover:text-foreground"
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.section>

          <div className="border-t border-white/[0.07] px-5 sm:px-6">
            <CreatorSubscribePanel username={username} />
          </div>

          {/* TABS */}
          <div className="sticky top-[64px] z-10 mt-8 flex border-y border-white/[0.07] bg-background/80 backdrop-blur-2xl">
            {(["posts", "media"] as const).map((t) => {
              const Icon = t === "posts" ? Grid2X2 : Images;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative flex flex-1 items-center justify-center gap-2 px-4 py-4 text-sm font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t}
                  {tab === t && (
                    <motion.div
                      layoutId="profileTab"
                      className="absolute inset-x-[22%] -bottom-px h-0.5 rounded-full bg-iridescent shadow-glow-sm"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB CONTENT */}
          {tab === "posts" ? (
            <CreatorPosts
              username={username}
              onUnlock={() => void handleFollow()}
              unlockPending={relationship.pending}
              isOwner={isSelf}
            />
          ) : (
            <MediaTab products={products} profileId={profileId} />
          )}
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
  const { data: posts, isLoading } = useCreatorFeed(username);
  if (isLoading) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
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
    <div className="divide-y divide-white/[0.07]">
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

/** Media tab — the creator's storefront drops, presented as a media grid. */
function MediaTab({
  products,
  profileId,
}: {
  products: CabanaProduct[];
  profileId: string | undefined;
}) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title="No products yet"
        message="Products and creator drops will appear here."
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-0.5 bg-white/[0.07] sm:grid-cols-3">
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
          className="group relative aspect-[3/4] overflow-hidden bg-background text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`View ${p.title}`}
        >
          <img
            src={p.img}
            alt={p.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
          <span className="absolute right-2 top-2 rounded-full glass-strong px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest">
            {p.type}
          </span>
          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="line-clamp-2 text-sm font-medium leading-tight">{p.title}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-display text-base font-semibold text-chrome">{p.price}</span>
              <span className="rounded-full glass-strong p-1.5">
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
}: {
  links: CabanaLink[];
  profileId: string | undefined;
  creatorName: string;
}) {
  return (
    <div className="space-y-5">
      <PostSearch creatorName={creatorName} />
      {links.length > 0 ? <LinksCard links={links} profileId={profileId} /> : null}
      <PoweredBy />
    </div>
  );
}

/** Right-rail search box for the creator's posts — submits to Discover. */
function PostSearch({ creatorName }: { creatorName: string }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ to: "/discover", search: q.trim() ? ({ q: q.trim() } as never) : undefined });
      }}
      className="relative"
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${creatorName || "creator"} posts`}
        className="field-luxury !pl-10"
        aria-label="Search posts"
      />
    </form>
  );
}

function LinksCard({ links, profileId }: { links: CabanaLink[]; profileId: string | undefined }) {
  return (
    <section className="glass rounded-3xl p-5">
      <h2 className="mb-3 font-display text-sm font-semibold">Links</h2>
      <div className="space-y-2">
        {links.map((l, i) => {
          const Icon = LINK_ICONS[l.icon] ?? LINK_ICONS.globe;
          const accent = LINK_ACCENTS[i % LINK_ACCENTS.length];
          return (
            <a
              key={l.id}
              href={l.url.startsWith("http") ? l.url : `https://${l.url}`}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                profileId && trackLinkClick(profileId, l.id, { url: l.url, title: l.title })
              }
              className="group flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-foreground/5"
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

function PoweredBy() {
  return (
    <Link
      to="/"
      className="mx-auto flex flex-col items-center justify-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70 transition-colors hover:text-foreground"
    >
      <span>Powered by</span>
      <img src={cabanaLogo} alt="CABANA" className="h-20 w-auto" />
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: typeof Grid2X2;
  title: string;
  message: string;
}) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/[0.1] bg-white/[0.04] text-primary shadow-[inset_0_1px_0_oklch(1_0_0/0.08)]">
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-5 font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function compactLinkLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
