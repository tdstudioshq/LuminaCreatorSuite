/**
 * Public creator-page view model and row mapping.
 *
 * This module deliberately has no React or Supabase dependency. Migration 37 is
 * newer than the checked-in generated Database type, so the data layer casts
 * only its returned rows to these narrow shapes before mapping them here.
 */

export const CABANA_THEMES = ["iridescent", "midnight", "rose", "chrome"] as const;
export type CabanaTheme = (typeof CABANA_THEMES)[number];

export const BUTTON_STYLES = ["rounded", "pill", "square"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export const CREATOR_PAGE_STATUSES = ["draft", "published", "archived"] as const;
export type CreatorPageStatus = (typeof CREATOR_PAGE_STATUSES)[number];

export const CREATOR_PAGE_FONT_FAMILIES = ["default", "sans", "serif", "mono", "display"] as const;
export type CreatorPageFontFamily = (typeof CREATOR_PAGE_FONT_FAMILIES)[number];

export const CREATOR_PAGE_BACKGROUND_STYLES = [
  "default",
  "solid",
  "gradient",
  "iridescent",
] as const;
export type CreatorPageBackgroundStyle = (typeof CREATOR_PAGE_BACKGROUND_STYLES)[number];

export const CREATOR_PAGE_LINK_KINDS = ["link", "header", "social", "embed"] as const;
export type CreatorPageLinkKind = (typeof CREATOR_PAGE_LINK_KINDS)[number];

export const ICON_OPTIONS = [
  "crown",
  "instagram",
  "youtube",
  "music",
  "shop",
  "send",
  "heart",
  "calendar",
  "globe",
  "star",
  "play",
  "sparkles",
  "mail",
  "phone",
  "x",
] as const;
export type LinkIconKey = (typeof ICON_OPTIONS)[number];

export type CabanaProfile = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  banner: string;
  theme: CabanaTheme;
  plan: string;
  /** Short title/tagline under the display name. */
  headline: string;
  /** Optional brand accent hex; empty means use the theme default. */
  accentColor: string;
  buttonStyle: ButtonStyle;
  pageStatus: CreatorPageStatus;
  fontFamily: CreatorPageFontFamily;
  backgroundStyle: CreatorPageBackgroundStyle;
};

export type CabanaLink = {
  id: string;
  title: string;
  url: string;
  icon: LinkIconKey;
  clicks: number;
  ctr: string;
  scheduled?: string;
  featured?: boolean;
  position: number;
  kind: CreatorPageLinkKind;
  isVisible: boolean;
};

/** Narrow database projection used until migration-37 fields reach generated types. */
export type CreatorProfileViewRow = {
  id: string;
  handle: string;
  name: string;
  bio: string;
  avatar_url: string | null;
  banner_url: string | null;
  theme: string;
  plan: string;
  headline?: string | null;
  accent_color?: string | null;
  button_style?: string | null;
  page_status?: string | null;
  font_family?: string | null;
  background_style?: string | null;
};

/** Narrow link projection used until migration-37 fields reach generated types. */
export type CreatorLinkViewRow = {
  id: string;
  profile_id: string;
  title: string;
  url: string;
  icon: string;
  featured: boolean;
  scheduled: string | null;
  position: number;
  clicks: number;
  kind?: string | null;
  is_visible?: boolean | null;
};

function enumValue<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
  fallback: Values[number],
): Values[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as Values[number])
    : fallback;
}

export function mapCreatorProfile(row: CreatorProfileViewRow): CabanaProfile {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    bio: row.bio,
    avatar: row.avatar_url ?? "",
    banner: row.banner_url ?? "",
    theme: enumValue(CABANA_THEMES, row.theme, "iridescent"),
    plan: row.plan,
    headline: row.headline ?? "",
    accentColor: row.accent_color ?? "",
    buttonStyle: enumValue(BUTTON_STYLES, row.button_style, "rounded"),
    pageStatus: enumValue(CREATOR_PAGE_STATUSES, row.page_status, "published"),
    fontFamily: enumValue(CREATOR_PAGE_FONT_FAMILIES, row.font_family, "default"),
    backgroundStyle: enumValue(CREATOR_PAGE_BACKGROUND_STYLES, row.background_style, "default"),
  };
}

export function mapCreatorLink(row: CreatorLinkViewRow, totalClicks: number): CabanaLink {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    icon: enumValue(ICON_OPTIONS, row.icon, "globe"),
    clicks: row.clicks,
    ctr: totalClicks > 0 ? `${((row.clicks / totalClicks) * 100).toFixed(1)}%` : "0%",
    scheduled: row.scheduled ?? undefined,
    featured: row.featured,
    position: row.position,
    kind: enumValue(CREATOR_PAGE_LINK_KINDS, row.kind, "link"),
    isVisible: row.is_visible ?? true,
  };
}

/**
 * Defensive public ordering. The query also orders by position and id, but the
 * renderer repeats the rule so preview/local data cannot expose hidden links or
 * produce an unstable order when positions tie.
 */
export function orderedVisibleCreatorLinks(links: readonly CabanaLink[]): CabanaLink[] {
  return links
    .filter((link) => link.isVisible)
    .slice()
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** Normalize a legacy bare host while rejecting executable/non-HTTP schemes. */
export function safeCreatorLinkHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  if (hasScheme && !/^https?:\/\//i.test(value)) return null;

  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(normalized);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname
      ? normalized
      : null;
  } catch {
    return null;
  }
}

export function compactCreatorLinkLabel(url: string): string {
  const safe = safeCreatorLinkHref(url);
  return (safe ?? url).replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
