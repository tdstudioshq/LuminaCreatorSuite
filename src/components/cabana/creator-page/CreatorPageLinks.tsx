import { ArrowUpRight, Crown, Link2 } from "lucide-react";
import { LINK_ICONS } from "@/lib/cabana-store";
import {
  compactCreatorLinkLabel,
  orderedVisibleCreatorLinks,
  safeCreatorLinkHref,
  type ButtonStyle,
  type CabanaLink,
} from "@/lib/cabana-creator-page-view";

const BUTTON_RADIUS: Record<ButtonStyle, string> = {
  rounded: "rounded-2xl",
  pill: "rounded-full",
  square: "rounded-md",
};

const LINK_ACCENTS = [
  "oklch(0.85 0.14 60)",
  "oklch(0.78 0.15 230)",
  "oklch(0.75 0.2 330)",
  "oklch(0.78 0.18 20)",
  "oklch(0.85 0.12 195)",
  "oklch(0.78 0.15 280)",
  "oklch(0.7 0.22 25)",
  "oklch(0.82 0.18 145)",
] as const;

type LinkClickHandler = (link: CabanaLink) => void;

export function CreatorPagePrimaryLink({
  links,
  onLinkClick,
}: {
  links: readonly CabanaLink[];
  onLinkClick?: LinkClickHandler;
}) {
  const primary = orderedVisibleCreatorLinks(links).find(
    (link) => link.kind !== "header" && safeCreatorLinkHref(link.url) !== null,
  );
  if (!primary) return null;

  return (
    <a
      href={safeCreatorLinkHref(primary.url) ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      data-link-kind={primary.kind}
      onClick={() => onLinkClick?.(primary)}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-primary outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Link2 className="h-3.5 w-3.5" />
      {compactCreatorLinkLabel(primary.url)}
    </a>
  );
}

export function CreatorPageLinks({
  links,
  accentColor,
  buttonStyle,
  onLinkClick,
}: {
  links: readonly CabanaLink[];
  accentColor: string;
  buttonStyle: ButtonStyle;
  onLinkClick?: LinkClickHandler;
}) {
  const publicLinks = orderedVisibleCreatorLinks(links);
  if (publicLinks.length === 0) return null;

  const rowRadius = BUTTON_RADIUS[buttonStyle] ?? "rounded-2xl";
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-[linear-gradient(150deg,oklch(0.19_0.02_280/0.68),oklch(0.14_0.015_280/0.58))] p-5 shadow-[0_24px_70px_-50px_oklch(0_0_0/0.95),inset_0_1px_0_oklch(1_0_0/0.08)]">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-primary">
        Creator links
      </p>
      <h2 className="mb-3 mt-1 font-display text-base font-semibold">Around the web</h2>
      <div className="space-y-2">
        {publicLinks.map((link, index) => {
          if (link.kind === "header") {
            return (
              <div
                key={link.id}
                role="heading"
                aria-level={3}
                data-link-kind="header"
                data-link-visible="true"
                className="px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground first:pt-0"
              >
                {link.title}
              </div>
            );
          }

          const href = safeCreatorLinkHref(link.url);
          const Icon = LINK_ICONS[link.icon] ?? LINK_ICONS.globe;
          const accent = accentColor || LINK_ACCENTS[index % LINK_ACCENTS.length];
          const content = (
            <>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl glass-strong"
                style={{ boxShadow: `0 0 20px -8px ${accent}` }}
              >
                <Icon className="h-4 w-4" style={{ color: accent }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {link.title}
                  {link.featured ? <Crown className="h-3 w-3" style={{ color: accent }} /> : null}
                  {link.kind === "embed" ? (
                    <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-muted-foreground">
                      Media
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {link.scheduled ?? link.url}
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:rotate-45 group-hover:text-foreground" />
            </>
          );

          const className = `group flex items-center gap-3 ${rowRadius} p-2.5 outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring`;
          return href ? (
            <a
              key={link.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-link-kind={link.kind}
              data-link-visible="true"
              onClick={() => onLinkClick?.(link)}
              className={className}
            >
              {content}
            </a>
          ) : (
            <div
              key={link.id}
              data-link-kind={link.kind}
              data-link-visible="true"
              aria-disabled="true"
              className={`${className} opacity-60`}
            >
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
