import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { BadgeCheck, ShoppingBag, ArrowUpRight, Play, Sparkles, Mail, Crown } from "lucide-react";
import { toast } from "sonner";
import cabanaLogo from "@/assets/cabana-logo.webp";
import { useCreatorByHandle, LINK_ICONS } from "@/lib/cabana-store";
import { trackPageView, trackLinkClick, trackProductClick } from "@/lib/cabana-analytics";
import { comingSoon } from "@/lib/coming-soon";
import { useFollow } from "@/lib/use-relationships";
import { useCreatorFeed } from "@/lib/use-posts";
import { PostCard } from "@/components/cabana/posts/PostCard";
import { CreatorSubscribePanel } from "@/components/cabana/subscriptions/CreatorSubscribePanel";

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

function CreatorProfileRoute() {
  const { username } = Route.useParams();
  return <CreatorProfile username={username} />;
}

export function CreatorProfile({ username }: { username: string }) {
  const navigate = useNavigate();
  const relationship = useFollow(username);
  const { data, isLoading } = useCreatorByHandle(username);
  const profileId = data?.profile.id;

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
  const heroImage = profile.banner || profile.avatar;
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

  return (
    <div className="relative min-h-screen overflow-x-hidden" data-cabana-theme={profile.theme}>
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--gradient-iridescent)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.7 0.2 195), transparent 70%)" }}
        />
      </div>

      <div className="max-w-md mx-auto px-4 sm:px-6 pt-10 pb-32">
        {/* HERO */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="relative rounded-[2rem] overflow-hidden aspect-[4/5] glass-strong shadow-luxury">
            {heroImage ? (
              <motion.img
                src={heroImage}
                alt={profile.name || username}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: "var(--gradient-iridescent)" }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

            <div className="absolute top-4 right-4">
              <button
                onClick={() => comingSoon("Story playback")}
                className="glass rounded-full p-2"
                aria-label="Play story"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-display text-4xl font-semibold tracking-tighter leading-none">
                  {profile.name || `@${profile.handle || username}`}
                </h1>
                <BadgeCheck
                  className="w-6 h-6 fill-current"
                  style={{ color: "oklch(0.85 0.15 195)" }}
                />
              </div>
              <div className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
                <span>@{profile.handle || username}</span>
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
                <motion.p
                  key={profile.bio}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.8 }}
                  className="text-[13px] leading-relaxed text-foreground/85 max-w-xs"
                >
                  {profile.bio}
                </motion.p>
              )}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7 }}
            className="mt-4 grid grid-cols-[1fr_auto] gap-2"
          >
            <button
              onClick={() => void handleFollow()}
              disabled={
                relationship.pending || relationship.data?.isSelf || relationship.blockedByMe
              }
              className={`btn-luxury !w-full !py-4 disabled:opacity-60 ${
                relationship.following ? "!bg-none" : ""
              }`}
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
                : relationship.data?.isSelf
                  ? "Your profile"
                  : relationship.blockedByMe
                    ? "Blocked"
                    : relationship.following
                      ? "Following"
                      : `Follow ${profile.name || "creator"}`}
              {!relationship.following &&
                !relationship.data?.isSelf &&
                !relationship.blockedByMe &&
                !relationship.pending && <Sparkles className="w-4 h-4" />}
            </button>
            <button
              onClick={() => comingSoon("Direct messaging")}
              className="btn-ghost !px-4 flex items-center justify-center"
              aria-label="Message creator"
            >
              <Mail className="w-4 h-4" />
            </button>
          </motion.div>
        </motion.section>

        {/* POSTS */}
        <CreatorPosts
          username={username}
          onUnlock={() => void handleFollow()}
          unlockPending={relationship.pending}
        />

        {/* SUBSCRIBE (demo) */}
        <CreatorSubscribePanel username={username} />

        {/* LINKS */}
        {links.length > 0 && (
          <Section eyebrow="The hub" title="Links">
            <div className="space-y-2.5">
              {links.map((l, i) => {
                const Icon = LINK_ICONS[l.icon] ?? LINK_ICONS.globe;
                const accent = LINK_ACCENTS[i % LINK_ACCENTS.length];
                return (
                  <motion.a
                    key={l.id}
                    href={l.url.startsWith("http") ? l.url : `https://${l.url}`}
                    target="_blank"
                    rel="noreferrer"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-30px" }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    whileHover={{ x: 4 }}
                    onClick={() =>
                      profileId && trackLinkClick(profileId, l.id, { url: l.url, title: l.title })
                    }
                    className={`group relative block rounded-2xl p-4 overflow-hidden ${l.featured ? "glass-strong" : "glass"}`}
                  >
                    {l.featured && (
                      <div
                        className="absolute inset-0 opacity-30 pointer-events-none"
                        style={{
                          background: `radial-gradient(circle at 0% 50%, ${accent}, transparent 60%)`,
                        }}
                      />
                    )}
                    <div className="relative flex items-center gap-4">
                      <div
                        className="w-11 h-11 rounded-xl glass-strong flex items-center justify-center shrink-0"
                        style={{ boxShadow: `0 0 24px -8px ${accent}` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm flex items-center gap-1.5">
                          {l.title}
                          {l.featured && <Crown className="w-3 h-3" style={{ color: accent }} />}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {l.scheduled ?? l.url}
                        </p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:rotate-45 group-hover:text-foreground" />
                    </div>
                  </motion.a>
                );
              })}
            </div>
          </Section>
        )}

        {/* PRODUCTS */}
        {products.length > 0 && (
          <Section eyebrow="Storefront" title="Featured drops">
            <div className="grid grid-cols-2 gap-3">
              {products.map((p, i) => (
                <motion.button
                  key={p.id}
                  type="button"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.07 }}
                  whileHover={{ y: -4 }}
                  onClick={() => {
                    if (profileId) trackProductClick(profileId, p.id, { title: p.title });
                    comingSoon("Product checkout");
                  }}
                  className="group relative rounded-2xl overflow-hidden glass aspect-[3/4] text-left"
                >
                  <img
                    src={p.img}
                    alt={p.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                  <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest font-semibold glass-strong px-2 py-0.5 rounded-full">
                    {p.type}
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      {p.sales} sold
                    </p>
                    <p className="font-medium text-sm leading-tight mt-0.5 line-clamp-2">
                      {p.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-chrome font-display text-base font-semibold">
                        {p.price}
                      </span>
                      <span className="glass-strong rounded-full p-1.5">
                        <ShoppingBag className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </Section>
        )}

        {links.length === 0 && products.length === 0 && (
          <div className="mt-12 glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
            This creator hasn't added any links or products yet.
          </div>
        )}

        {/* Powered by */}
        <Link
          to="/"
          className="mt-12 mx-auto flex flex-col items-center justify-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <span>Powered by</span>
          <img src={cabanaLogo} alt="CABANA" className="h-[7.5rem] w-auto" />
        </Link>
      </div>
    </div>
  );
}

function CreatorPosts({
  username,
  onUnlock,
  unlockPending,
}: {
  username: string;
  onUnlock: () => void;
  unlockPending: boolean;
}) {
  const { data: posts, isLoading } = useCreatorFeed(username);
  if (isLoading || !posts || posts.length === 0) return null;
  return (
    <Section eyebrow="Latest" title="Posts">
      <div className="space-y-4">
        {posts.map((post, i) => (
          <PostCard
            key={post.postId}
            post={post}
            index={i}
            onUnlock={onUnlock}
            unlockPending={unlockPending}
          />
        ))}
      </div>
    </Section>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="mb-5">
        <p className="eyebrow text-muted-foreground mb-1.5">{eyebrow}</p>
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}
