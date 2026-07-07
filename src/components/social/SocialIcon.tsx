import type { CSSProperties } from "react";
import { SOCIAL_ICONS } from "./social-icons";
import type { SocialPlatform } from "./social-types";

export interface SocialIconProps {
  platform: SocialPlatform;
  /** Icon size in px (or any CSS length). Defaults to 18. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Accessible name. When omitted the icon is decorative (aria-hidden). */
  title?: string;
}

/**
 * Resolves the correct glyph for a platform id. Pages should never import
 * platform icons directly — always go through this component (or, for raw
 * registry access in data tables, `SOCIAL_ICONS`).
 */
export function SocialIcon({ platform, size = 18, className, style, title }: SocialIconProps) {
  const Icon = SOCIAL_ICONS[platform];
  return (
    <Icon
      size={size}
      className={className}
      style={style}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  );
}
