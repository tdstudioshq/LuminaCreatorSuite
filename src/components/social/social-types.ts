// Shared contracts for the reusable social-link system.
// Creator data should only ever store the `SocialLink` shape — icons, labels,
// and brand colors all resolve from the platform id at render time.

export type SocialPlatform =
  | "instagram"
  | "x"
  | "threads"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "discord"
  | "telegram"
  | "whatsapp"
  | "spotify"
  | "applemusic"
  | "soundcloud"
  | "snapchat"
  | "linkedin"
  | "github"
  | "reddit"
  | "twitch"
  | "kick"
  | "patreon"
  | "onlyfans"
  | "fansly"
  | "fanvue"
  | "website"
  | "email"
  | "phone"
  | "lock";

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
  username?: string;
  enabled?: boolean;
  order?: number;
}

export type SocialButtonVariant = "glass" | "filled" | "outline" | "minimal";

export type SocialButtonSize = "sm" | "md" | "lg" | "xl";
