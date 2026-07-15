import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  LockKeyhole,
  MessageCircle,
  Play,
  Send,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import { useDiscoverySnapshot } from "@/lib/use-discovery";

const CAPABILITIES = [
  {
    icon: Sparkles,
    label: "Your world, one destination",
    copy: "Build an image-led profile, curate every link, and make your presence unmistakably yours.",
  },
  {
    icon: ShoppingBag,
    label: "Commerce with context",
    copy: "Place products beside the stories and posts that make your audience care.",
  },
  {
    icon: Send,
    label: "Publish without friction",
    copy: "Share public, follower, and subscriber content from one focused creative workflow.",
  },
  {
    icon: Users,
    label: "A network worth joining",
    copy: "Discover creators, follow their work, and turn passive audiences into real communities.",
  },
  {
    icon: MessageCircle,
    label: "Closer conversations",
    copy: "Keep private creator-to-member communication in the same place as the work.",
  },
  {
    icon: BarChart3,
    label: "Signals, not noise",
    copy: "Understand attention, content, and audience movement with honest, real-data analytics.",
  },
] as const;

const EASE = [0.22, 1, 0.36, 1] as const;

export function LandingPage() {
  const discovery = useDiscoverySnapshot();
  const creators = (discovery.data?.featuredCreators ?? []).slice(0, 4);

  return (
    <main id="main-content" className="landing-page min-h-screen overflow-hidden bg-background">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-8 lg:px-12">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src="/cabana-logo.png" alt="" className="h-9 w-9 object-contain" />
            <span className="font-display text-sm font-semibold tracking-[0.2em]">CABANA</span>
          </Link>
          <div className="hidden items-center gap-7 text-xs text-muted-foreground md:flex">
            <a href="#platform" className="transition-colors hover:text-foreground">
              Platform
            </a>
            <a href="#creators" className="transition-colors hover:text-foreground">
              Creators
            </a>
            <Link to="/discover" className="transition-colors hover:text-foreground">
              Discover
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Sign in
            </Link>
            <Link to="/signup" className="btn-luxury !px-4 !py-2.5 text-xs sm:!px-5">
              Create your CABANA
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative flex min-h-[94svh] items-end border-b border-white/[0.06] px-4 pb-16 pt-32 sm:px-8 sm:pb-24 lg:px-12">
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,oklch(0.73_0.055_75/0.17),transparent_34%),radial-gradient(circle_at_18%_84%,oklch(0.65_0.045_220/0.11),transparent_35%)]" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute right-[7%] top-[17%] h-[44vw] max-h-[640px] w-[32vw] max-w-[470px] rotate-3 overflow-hidden rounded-[2px] border border-white/[0.1] bg-[url('/cabana-og.webp')] bg-cover bg-center opacity-55 shadow-[0_60px_140px_-45px_black] grayscale-[0.1] max-md:right-[-16%] max-md:w-[68vw]" />
          <div className="absolute right-[29%] top-[29%] h-[34vw] max-h-[480px] w-[24vw] max-w-[340px] -rotate-6 border border-white/[0.1] bg-[url('/td.jpg')] bg-cover bg-center opacity-35 shadow-[0_45px_110px_-45px_black] max-md:hidden" />
        </div>
        <div className="relative mx-auto w-full max-w-[1440px]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            className="max-w-4xl"
          >
            <p className="eyebrow mb-6 text-champagne">The creator operating system</p>
            <h1 className="max-w-[900px] font-display text-[clamp(3.4rem,9vw,8.8rem)] font-medium leading-[0.83] tracking-[-0.075em]">
              Own your <span className="font-serif italic text-champagne">world.</span>
            </h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              One cinematic home for your identity, audience, content, storefront, conversations,
              and growth.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/signup" className="btn-luxury min-h-12 !px-6 text-sm">
                Start creating <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/discover" className="btn-ghost min-h-12 !px-6 text-sm">
                <Play className="h-4 w-4" /> Explore CABANA
              </Link>
            </div>
          </motion.div>
          <div className="mt-16 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/[0.09] pt-6 text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:mt-24">
            <span>Creator-first</span>
            <span>Private by design</span>
            <span>Built for mobile</span>
            <span>Real-data analytics</span>
          </div>
        </div>
      </section>

      <section id="platform" className="px-4 py-24 sm:px-8 sm:py-32 lg:px-12">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <p className="eyebrow text-champagne">Everything, composed</p>
              <h2 className="mt-5 max-w-xl font-display text-4xl font-medium leading-[0.95] tracking-[-0.055em] sm:text-6xl">
                A studio, social layer, and storefront in one.
              </h2>
              <p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">
                CABANA keeps the creator experience coherent from first impression to paid
                relationship.
              </p>
            </div>
            <div className="grid gap-px overflow-hidden border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2">
              {CAPABILITIES.map(({ icon: Icon, label, copy }, index) => (
                <article
                  key={label}
                  className="group min-h-64 bg-[oklch(0.105_0.008_75)] p-7 transition-colors hover:bg-[oklch(0.135_0.012_75)] sm:p-9"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      0{index + 1}
                    </span>
                    <Icon className="h-5 w-5 text-champagne" />
                  </div>
                  <h3 className="mt-16 max-w-xs font-display text-2xl font-medium tracking-tight">
                    {label}
                  </h3>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="creators"
        className="border-y border-white/[0.06] bg-white/[0.018] px-4 py-24 sm:px-8 sm:py-32 lg:px-12"
      >
        <div className="mx-auto max-w-[1440px]">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow text-champagne">Inside CABANA</p>
              <h2 className="mt-4 font-display text-4xl font-medium tracking-[-0.05em] sm:text-6xl">
                Find your next obsession.
              </h2>
            </div>
            <Link
              to="/discover"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Discover everyone <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {discovery.isLoading ? (
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="aspect-[3/4] animate-pulse bg-white/[0.04]" />
              ))}
            </div>
          ) : creators.length ? (
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {creators.map((creator, index) => (
                <Link
                  key={creator.profileId}
                  to="/$username"
                  params={{ username: creator.username }}
                  className="group relative aspect-[3/4] overflow-hidden bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {creator.avatarUrl ? (
                    <img
                      src={creator.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-7xl text-white/15">
                      {(creator.displayName || creator.username).charAt(0)}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6">
                    <span className="text-[10px] text-white/50">0{index + 1}</span>
                    <h3 className="mt-2 font-display text-xl font-medium text-white">
                      {creator.displayName}
                    </h3>
                    <p className="mt-1 text-xs text-white/55">@{creator.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-12 border border-white/[0.08] p-10 text-center text-sm text-muted-foreground">
              Featured creators will appear here as the community grows.
            </div>
          )}
        </div>
      </section>

      <section className="px-4 py-24 sm:px-8 sm:py-36 lg:px-12">
        <div className="relative mx-auto max-w-[1440px] overflow-hidden border border-white/[0.09] bg-[linear-gradient(135deg,oklch(0.16_0.018_75),oklch(0.08_0.006_75))] px-6 py-20 text-center sm:px-12 sm:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.76_0.07_75/0.18),transparent_45%)]" />
          <div className="relative">
            <LockKeyhole className="mx-auto h-6 w-6 text-champagne" />
            <p className="eyebrow mt-6 text-champagne">Your audience. Your terms.</p>
            <h2 className="mx-auto mt-5 max-w-4xl font-display text-4xl font-medium leading-[0.95] tracking-[-0.055em] sm:text-7xl">
              Create something worth belonging to.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-muted-foreground">
              Build your page now. Add subscriptions and demo earnings tools when your community is
              ready.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link to="/signup" className="btn-luxury min-h-12 !px-7">
                Create your CABANA
              </Link>
              <Link to="/login" className="btn-ghost min-h-12 !px-7">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] px-4 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <img src="/cabana-logo.png" alt="" className="h-7 w-7 object-contain" />
            <span className="tracking-[0.18em] text-foreground">CABANA</span>
          </div>
          <p>Creator tools, demo financial experiences, and a private social layer.</p>
          <div className="flex gap-5">
            <Link to="/discover">Discover</Link>
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
