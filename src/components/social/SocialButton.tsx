import type { CSSProperties } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { SocialIcon } from "./SocialIcon";
import { BRAND_COLORS, PLATFORM_LABELS } from "./social-icons";
import type { SocialButtonSize, SocialButtonVariant, SocialPlatform } from "./social-types";

const socialButton = cva(
  [
    "relative inline-flex items-center justify-center rounded-full",
    "transition-all duration-200 hover:scale-110 active:scale-95",
    "outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60",
  ].join(" "),
  {
    variants: {
      variant: {
        glass: [
          "border border-white/15 bg-white/10 text-white/90 backdrop-blur-md",
          "hover:border-white/25 hover:bg-white/15 hover:text-[var(--brand)]",
          "hover:shadow-[0_0_18px_-6px_var(--brand)]",
        ].join(" "),
        filled: ["bg-white text-black shadow-lg", "hover:shadow-[0_0_20px_-6px_var(--brand)]"].join(
          " ",
        ),
        outline: [
          "border border-white/30 bg-transparent text-white/90",
          "hover:border-white/50 hover:text-[var(--brand)]",
          "hover:shadow-[0_0_16px_-6px_var(--brand)]",
        ].join(" "),
        minimal: [
          "bg-transparent text-white/80",
          "hover:text-[var(--brand)] hover:drop-shadow-[0_0_10px_var(--brand)]",
        ].join(" "),
      },
      size: {
        sm: "h-8 w-8",
        md: "h-10 w-10",
        lg: "h-12 w-12",
        xl: "h-[3.75rem] w-[3.75rem]",
      },
    },
    defaultVariants: { variant: "glass", size: "md" },
  },
);

const ICON_SIZES: Record<SocialButtonSize, number> = { sm: 14, md: 18, lg: 22, xl: 27 };

export interface SocialButtonProps extends VariantProps<typeof socialButton> {
  platform: SocialPlatform;
  url: string;
  /** Shown in the accessible name, e.g. "Instagram (@handle)". */
  username?: string;
  variant?: SocialButtonVariant;
  size?: SocialButtonSize;
  /** Native tooltip with the platform name. Defaults to true. */
  showTooltip?: boolean;
  /** Disables the brand-color hover accent (stays white). */
  monochrome?: boolean;
  /** Shows the brand color at rest instead of the monochrome default. */
  colored?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * A round, keyboard-accessible social link button in the CABANA luxury style:
 * monochrome at rest (or brand-colored via `colored`), subtle brand-tinted
 * glow + scale on hover.
 */
export function SocialButton({
  platform,
  url,
  username,
  variant = "glass",
  size = "md",
  showTooltip = true,
  monochrome = false,
  colored = false,
  ariaLabel,
  className,
}: SocialButtonProps) {
  const label = PLATFORM_LABELS[platform];
  const accessibleName = ariaLabel ?? (username ? `${label} (${username})` : label);
  const isWebLink = /^https?:\/\//i.test(url);
  const brand = monochrome ? "#FFFFFF" : BRAND_COLORS[platform];

  return (
    <a
      href={url}
      target={isWebLink ? "_blank" : undefined}
      rel={isWebLink ? "noopener noreferrer" : undefined}
      aria-label={accessibleName}
      title={showTooltip ? label : undefined}
      style={{ "--brand": brand, ...(colored ? { color: brand } : {}) } as CSSProperties}
      className={cn(socialButton({ variant, size }), className)}
    >
      <SocialIcon platform={platform} size={ICON_SIZES[size]} />
    </a>
  );
}
