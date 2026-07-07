import { cn } from "@/lib/utils";
import { SocialButton } from "./SocialButton";
import type { SocialButtonSize, SocialButtonVariant, SocialLink } from "./social-types";

const GAP_CLASSES = {
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
} as const;

export interface SocialLinksProps {
  socials: readonly SocialLink[];
  variant?: SocialButtonVariant;
  size?: SocialButtonSize;
  /** Spacing between buttons. Defaults to "md"; override precisely via className. */
  gap?: keyof typeof GAP_CLASSES;
  /** Disables brand-color hover accents for the whole row. */
  monochrome?: boolean;
  /** Shows brand colors at rest instead of the monochrome default. */
  colored?: boolean;
  showTooltip?: boolean;
  className?: string;
}

/**
 * Renders a creator's social links as a wrapping row of SocialButtons.
 * Disabled links are filtered out and the rest are sorted by `order`
 * (falling back to array position), so a future DB-backed `SocialLink[]`
 * renders correctly with no additional code.
 */
export function SocialLinks({
  socials,
  variant,
  size,
  gap = "md",
  monochrome,
  colored,
  showTooltip,
  className,
}: SocialLinksProps) {
  const visible = socials
    .map((social, index) => ({ social, index }))
    .filter(({ social }) => social.enabled !== false)
    .sort((a, b) => (a.social.order ?? a.index) - (b.social.order ?? b.index) || a.index - b.index);

  if (visible.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center justify-center", GAP_CLASSES[gap], className)}>
      {visible.map(({ social }) => (
        <SocialButton
          key={`${social.platform}:${social.url}`}
          platform={social.platform}
          url={social.url}
          username={social.username}
          variant={variant}
          size={size}
          monochrome={monochrome}
          colored={colored}
          showTooltip={showTooltip}
        />
      ))}
    </div>
  );
}
