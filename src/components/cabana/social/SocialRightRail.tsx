import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Loader2, Search, Sparkles } from "lucide-react";
import { useDiscoverySnapshot } from "@/lib/use-discovery";
import type { DiscoveryCreator } from "@/lib/cabana-discovery";

/**
 * Contextual right sidebar for the social surfaces: post search + suggested
 * creators + footer links. Structure-only; reuses existing glass styling.
 * `searchPlaceholder` lets surfaces relabel the search box (e.g. a creator's
 * own posts on the profile page). Search submits to /discover.
 */
export function SocialRightRail({
  searchPlaceholder = "Search posts and creators",
  contextContent,
}: {
  searchPlaceholder?: string;
  contextContent?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <RailSearch placeholder={searchPlaceholder} />
      {contextContent}
      <SuggestedCreators />
      <RailFooter />
    </div>
  );
}

function RailSearch({ placeholder }: { placeholder: string }) {
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
        placeholder={placeholder}
        className="field-luxury h-12 !rounded-full !border-white/[0.09] !bg-white/[0.045] !pl-10 !pr-5 shadow-[inset_0_1px_0_oklch(1_0_0/0.06)]"
        aria-label="Search"
      />
    </form>
  );
}

function SuggestedCreators() {
  const { data, isLoading } = useDiscoverySnapshot();
  const creators: DiscoveryCreator[] = (
    data?.suggestedCreators?.map((s) => s.creator) ??
    data?.featuredCreators ??
    []
  ).slice(0, 5);

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/[0.09] bg-[linear-gradient(150deg,oklch(0.19_0.02_280/0.68),oklch(0.14_0.015_280/0.58))] shadow-[0_24px_70px_-50px_oklch(0_0_0/0.95),inset_0_1px_0_oklch(1_0_0/0.08)]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-primary">
            For you
          </p>
          <h2 className="mt-1 font-display text-base font-semibold">Suggested creators</h2>
        </div>
        <Link
          to="/discover"
          className="rounded-full px-3 py-1.5 text-[11px] text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          See all
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : creators.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-muted-foreground">
          No suggestions yet — explore Discover.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {creators.map((c) => (
            <li key={c.profileId}>
              <Link
                to="/$username"
                params={{ username: c.username }}
                className="group flex items-center gap-3 px-5 py-3.5 outline-none transition-colors hover:bg-white/[0.045] focus-visible:bg-white/[0.045]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground/10 text-sm font-medium ring-2 ring-white/[0.08] transition-transform group-hover:scale-[1.03]">
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (c.displayName || c.username).charAt(0).toUpperCase()
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.displayName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">@{c.username}</p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-muted-foreground transition-all group-hover:border-primary/30 group-hover:text-primary">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/discover"
        className="flex items-center justify-center gap-2 border-t border-white/[0.07] px-5 py-3.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-white/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Explore more creators
      </Link>
    </section>
  );
}

const FOOTER_LINKS: { label: string; to: string }[] = [
  { label: "Discover", to: "/discover" },
  { label: "Feed", to: "/feed" },
  { label: "Messages", to: "/messages" },
];

function RailFooter() {
  return (
    <footer className="px-2 text-[11px] text-muted-foreground">
      <nav className="flex flex-wrap gap-x-3 gap-y-1">
        {FOOTER_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="hover:text-foreground">
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="mt-2 opacity-70">© CABANA — demo experience.</p>
    </footer>
  );
}
