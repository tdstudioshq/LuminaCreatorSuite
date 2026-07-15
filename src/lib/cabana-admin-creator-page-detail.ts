// ============================================================================
// CABANA — admin creator-page detail read model (PURE)
// ----------------------------------------------------------------------------
// Validation and row-to-wire mapping for the creator-page editor. The browser
// receives only fields needed to edit the selected page: no email, auth.users
// record, audit network metadata, or service-role-only identity data.
// ============================================================================
import type { Json } from "@/integrations/supabase/types";
import {
  BACKGROUND_STYLES,
  BUTTON_STYLES,
  CREATOR_PAGE_THEMES,
  CREATOR_PAGE_STATUSES,
  FONT_FAMILIES,
  LINK_KINDS,
  type CreatorPageStatus,
  type LinkKind,
} from "@/lib/cabana-creator-pages";

export const ADMIN_CREATOR_PAGE_LINK_LIMIT = 200;
export const ADMIN_CREATOR_PAGE_AUDIT_DEFAULT_LIMIT = 50;
export const ADMIN_CREATOR_PAGE_AUDIT_MAX_LIMIT = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIT_ACTOR_ROLES = ["creator", "moderator", "admin", "system"] as const;

export type AdminCreatorPageLink = {
  id: string;
  title: string;
  url: string;
  icon: string;
  featured: boolean;
  scheduled: string | null;
  position: number;
  kind: LinkKind;
  isVisible: boolean;
  createdAt: string;
};

export type AdminCreatorPageDetail = {
  id: string;
  ownerUserId: string | null;
  claimed: boolean;
  handle: string;
  displayName: string;
  bio: string;
  headline: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  theme: (typeof CREATOR_PAGE_THEMES)[number];
  accentColor: string;
  buttonStyle: (typeof BUTTON_STYLES)[number];
  fontFamily: (typeof FONT_FAMILIES)[number];
  backgroundStyle: (typeof BACKGROUND_STYLES)[number];
  pageStatus: CreatorPageStatus;
  plan: string;
  createdAt: string;
  updatedAt: string;
  links: AdminCreatorPageLink[];
};

export type AdminCreatorPageAuditItem = {
  id: string;
  actorRole: (typeof AUDIT_ACTOR_ROLES)[number];
  action: string;
  targetType: string;
  targetId: string | null;
  before: Record<string, Json>;
  after: Record<string, Json>;
  reason: string | null;
  createdAt: string;
};

/** Local rows include migration 20260537 fields absent from cloud-generated types. */
export type AdminCreatorPageRow = {
  id: string;
  user_id: string | null;
  handle: string;
  name: string;
  bio: string;
  headline: string;
  avatar_url: string | null;
  banner_url: string | null;
  theme: string;
  accent_color: string;
  button_style: string;
  font_family: string;
  background_style: string;
  page_status: string;
  plan: string;
  created_at: string;
  updated_at: string;
};

/** Local rows include migration 20260537 fields absent from cloud-generated types. */
export type AdminCreatorPageLinkRow = {
  id: string;
  profile_id: string;
  title: string;
  url: string;
  icon: string;
  featured: boolean;
  scheduled: string | null;
  position: number;
  kind: string;
  is_visible: boolean;
  created_at: string;
};

export type AdminCreatorPageAuditRow = {
  id: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string | null;
  before: Json | null;
  after: Json | null;
  reason: string | null;
  created_at: string;
};

export type AdminCreatorPageDetailInput = { creatorProfileId: string };
export type AdminCreatorPageAuditInput = { creatorProfileId: string; limit: number };

export function normalizeCreatorProfileId(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("A valid creator page ID is required.");
  const value = raw.trim().toLowerCase();
  if (!UUID_PATTERN.test(value)) throw new Error("A valid creator page ID is required.");
  return value;
}

export function normalizeAdminCreatorPageDetailInput(raw: unknown): AdminCreatorPageDetailInput {
  if (!raw || typeof raw !== "object") throw new Error("A valid creator page ID is required.");
  return {
    creatorProfileId: normalizeCreatorProfileId((raw as Record<string, unknown>).creatorProfileId),
  };
}

export function normalizeAdminCreatorPageAuditInput(raw: unknown): AdminCreatorPageAuditInput {
  if (!raw || typeof raw !== "object") throw new Error("Invalid audit-history request.");
  const candidate = raw as Record<string, unknown>;
  const limit = candidate.limit ?? ADMIN_CREATOR_PAGE_AUDIT_DEFAULT_LIMIT;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > ADMIN_CREATOR_PAGE_AUDIT_MAX_LIMIT
  ) {
    throw new Error(
      `Audit history limit must be between 1 and ${ADMIN_CREATOR_PAGE_AUDIT_MAX_LIMIT}.`,
    );
  }
  return {
    creatorProfileId: normalizeCreatorProfileId(candidate.creatorProfileId),
    limit,
  };
}

function isOneOf<const T extends readonly string[]>(value: string, values: T): value is T[number] {
  return values.includes(value);
}

function asJsonObject(value: Json | null): Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function invalidRow(): never {
  throw new Error("Creator page data is unavailable.");
}

export function mapAdminCreatorPageLink(row: AdminCreatorPageLinkRow): AdminCreatorPageLink {
  if (
    !UUID_PATTERN.test(row.id) ||
    !UUID_PATTERN.test(row.profile_id) ||
    !isOneOf(row.kind, LINK_KINDS) ||
    !Number.isInteger(row.position)
  ) {
    invalidRow();
  }
  return {
    id: row.id.toLowerCase(),
    title: row.title,
    url: row.url,
    icon: row.icon,
    featured: row.featured,
    scheduled: row.scheduled,
    position: row.position,
    kind: row.kind,
    isVisible: row.is_visible,
    createdAt: row.created_at,
  };
}

export function mapAdminCreatorPageDetail(
  row: AdminCreatorPageRow,
  linkRows: readonly AdminCreatorPageLinkRow[],
): AdminCreatorPageDetail {
  if (
    !UUID_PATTERN.test(row.id) ||
    (row.user_id !== null && !UUID_PATTERN.test(row.user_id)) ||
    !isOneOf(row.page_status, CREATOR_PAGE_STATUSES) ||
    !isOneOf(row.theme, CREATOR_PAGE_THEMES) ||
    !isOneOf(row.button_style, BUTTON_STYLES) ||
    !isOneOf(row.font_family, FONT_FAMILIES) ||
    !isOneOf(row.background_style, BACKGROUND_STYLES)
  ) {
    invalidRow();
  }

  const links = linkRows.map(mapAdminCreatorPageLink).sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return a.id.localeCompare(b.id);
  });

  return {
    id: row.id.toLowerCase(),
    ownerUserId: row.user_id?.toLowerCase() ?? null,
    claimed: row.user_id !== null,
    handle: row.handle,
    displayName: row.name,
    bio: row.bio,
    headline: row.headline,
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
    theme: row.theme,
    accentColor: row.accent_color,
    buttonStyle: row.button_style,
    fontFamily: row.font_family,
    backgroundStyle: row.background_style,
    pageStatus: row.page_status,
    plan: row.plan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    links,
  };
}

export function mapAdminCreatorPageAuditItem(
  row: AdminCreatorPageAuditRow,
): AdminCreatorPageAuditItem {
  if (
    !UUID_PATTERN.test(row.id) ||
    (row.target_id !== null && !UUID_PATTERN.test(row.target_id)) ||
    !isOneOf(row.actor_role, AUDIT_ACTOR_ROLES)
  ) {
    throw new Error("Creator page audit data is unavailable.");
  }
  return {
    id: row.id.toLowerCase(),
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id?.toLowerCase() ?? null,
    before: asJsonObject(row.before),
    after: asJsonObject(row.after),
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export type AdminCreatorPageReadError =
  | { code?: string | null; message?: string | null }
  | string
  | null
  | undefined;

/** Never return raw PostgREST/Postgres diagnostics to the browser. */
export function mapAdminCreatorPageReadError(error: AdminCreatorPageReadError): string {
  const code = typeof error === "object" && error ? (error.code ?? "") : "";
  if (code === "42501") return "Admin access is required.";
  if (code === "P0002") return "That creator page could not be found.";
  return "Creator page data could not be loaded. Please try again.";
}
