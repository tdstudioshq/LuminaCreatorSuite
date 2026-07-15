// ============================================================================
// CABANA — admin creator-page policy (Phase 2A.2, PURE)
// ----------------------------------------------------------------------------
// The DECISIONS behind admin creator-page management, in one testable place:
// handle normalization, the page-status transition machine, appearance/link
// allow-lists, reorder-list validation, changed-field diffing for audit
// summaries, and safe error mapping. No React, no Supabase, no DB.
//
// AUTHORITATIVE LAYER: the SQL in migration 20260538 is the security + mutation
// boundary — it re-checks admin, re-validates every rule, and writes the audit
// rows inside SECURITY DEFINER RPCs. This module MIRRORS those rules so the
// future admin UI (and the thin server-action layer) can validate/label
// pre-flight and map errors, WITHOUT reimplementing authorization. Where a rule
// lives in both places (status transitions, allow-lists, the URL scheme guard,
// reorder validation) the SQL is canonical and this module is kept in lockstep;
// each such function notes its SQL counterpart.
// ============================================================================

// ─────────────────────────────── Page status ───────────────────────────────

export const CREATOR_PAGE_STATUSES = ["draft", "published", "archived"] as const;
export type CreatorPageStatus = (typeof CREATOR_PAGE_STATUSES)[number];

export const PAGE_STATUS_ACTIONS = ["publish", "unpublish", "archive", "restore"] as const;
export type PageStatusAction = (typeof PAGE_STATUS_ACTIONS)[number];

export function isCreatorPageStatus(value: unknown): value is CreatorPageStatus {
  return typeof value === "string" && (CREATOR_PAGE_STATUSES as readonly string[]).includes(value);
}

export function isPageStatusAction(value: unknown): value is PageStatusAction {
  return typeof value === "string" && (PAGE_STATUS_ACTIONS as readonly string[]).includes(value);
}

/**
 * The next status for a (current, action) pair, or null if the transition is
 * not allowed. Mirrors `admin_set_creator_page_status`'s CASE table exactly:
 *   publish:   draft      -> published
 *   unpublish: published  -> draft
 *   archive:   draft|published -> archived
 *   restore:   archived   -> draft
 * No-op transitions and archived->published (directly) return null.
 */
export function nextPageStatus(
  from: CreatorPageStatus,
  action: PageStatusAction,
): CreatorPageStatus | null {
  switch (action) {
    case "publish":
      return from === "draft" ? "published" : null;
    case "unpublish":
      return from === "published" ? "draft" : null;
    case "archive":
      return from === "draft" || from === "published" ? "archived" : null;
    case "restore":
      return from === "archived" ? "draft" : null;
    default:
      return null;
  }
}

export function canTransitionPageStatus(
  from: CreatorPageStatus,
  action: PageStatusAction,
): boolean {
  return nextPageStatus(from, action) !== null;
}

/** The actions currently allowed from a given status (for enabling UI controls). */
export function allowedPageStatusActions(from: CreatorPageStatus): PageStatusAction[] {
  return PAGE_STATUS_ACTIONS.filter((a) => canTransitionPageStatus(from, a));
}

/** The stable audit action name an admin status change writes (mirrors SQL). */
export function pageStatusAuditAction(action: PageStatusAction): string {
  switch (action) {
    case "publish":
      return "creator_page.published";
    case "unpublish":
      return "creator_page.unpublished";
    case "archive":
      return "creator_page.archived";
    case "restore":
      return "creator_page.restored";
  }
}

// ─────────────────────────────── Handles ───────────────────────────────────

/** Normalize a handle the same way the RPCs do: lower-case + trim. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Advisory handle-shape check for pre-flight UI validation. The DATABASE only
 * enforces non-empty + reserved (validate_creator_handle) + unique
 * (lower(handle) index); it does NOT enforce a charset on creator handles. This
 * is a friendlier client-side hint, not the authoritative rule.
 */
export function isPlausibleHandle(handle: string): boolean {
  return /^[a-z0-9_-]{1,64}$/.test(normalizeHandle(handle));
}

// ─────────────────────────── Appearance allow-lists ────────────────────────
// Each mirrors a CHECK constraint (20260528 button_style/accent_color, 20260537
// font_family/background_style).

export const FONT_FAMILIES = ["default", "sans", "serif", "mono", "display"] as const;
export const BACKGROUND_STYLES = ["default", "solid", "gradient", "iridescent"] as const;
export const BUTTON_STYLES = ["rounded", "pill", "square"] as const;
export const CREATOR_PAGE_THEMES = ["iridescent", "midnight", "rose", "chrome"] as const;

export function isValidFontFamily(value: unknown): boolean {
  return typeof value === "string" && (FONT_FAMILIES as readonly string[]).includes(value);
}

export function isValidBackgroundStyle(value: unknown): boolean {
  return typeof value === "string" && (BACKGROUND_STYLES as readonly string[]).includes(value);
}

export function isValidButtonStyle(value: unknown): boolean {
  return typeof value === "string" && (BUTTON_STYLES as readonly string[]).includes(value);
}

export function isValidCreatorPageTheme(value: unknown): boolean {
  return typeof value === "string" && (CREATOR_PAGE_THEMES as readonly string[]).includes(value);
}

/** '' (theme default) or a 6-digit hex color; mirrors creator_profiles_accent_color_hex. */
export function isValidAccentColor(value: unknown): boolean {
  return typeof value === "string" && (value === "" || /^#[0-9a-fA-F]{6}$/.test(value));
}

// ──────────────────────────────── Links ────────────────────────────────────

export const LINK_KINDS = ["link", "header", "social", "embed"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export function isValidLinkKind(value: unknown): boolean {
  return typeof value === "string" && (LINK_KINDS as readonly string[]).includes(value);
}

/**
 * Scheme-prefix guard mirroring the SQL `links_url_http_scheme` CHECK
 * (`url ~* '^https?://'`). This is NOT full URL validation — it only asserts an
 * http/https scheme prefix, rejecting javascript:/data:/vbscript:/ftp:,
 * protocol-relative (`//host`), and plain non-URL text, while accepting the
 * bare `https://` placeholder. Host/path validity is a separate app concern.
 */
export function hasHttpScheme(url: unknown): boolean {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/** Strict admin-editor URL validation; unlike the SQL scheme guard, bare placeholders fail. */
export function isValidHttpUrl(url: unknown): boolean {
  if (typeof url !== "string" || !hasHttpScheme(url.trim())) return false;
  try {
    const parsed = new URL(url.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0 &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export type ReorderValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validate a reorder request: the ordered id list must be non-empty, contain no
 * duplicates, and be exactly the set of the page's current link ids (no missing,
 * no foreign). Mirrors the guards in `admin_reorder_creator_links`.
 */
export function validateReorder(
  orderedIds: readonly string[],
  actualIds: readonly string[],
): ReorderValidation {
  if (orderedIds.length === 0) {
    return { ok: false, reason: "No links provided" };
  }
  const ordered = new Set(orderedIds);
  if (ordered.size !== orderedIds.length) {
    return { ok: false, reason: "Duplicate link ids" };
  }
  const actual = new Set(actualIds);
  for (const id of orderedIds) {
    if (!actual.has(id)) {
      return { ok: false, reason: "Ordered list contains links not on this page" };
    }
  }
  if (orderedIds.length !== actual.size) {
    return { ok: false, reason: "Ordered list must contain exactly the page's links" };
  }
  return { ok: true };
}

// ─────────────────────────── Changed-field diffing ─────────────────────────

/**
 * The names of the fields whose values differ between `before` and `after`,
 * limited to `fields`. Used to build the changed-field audit summary the UI can
 * echo (SQL computes the authoritative version inside admin_update_creator_page).
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T)[],
): string[] {
  const changed: string[] = [];
  for (const field of fields) {
    if (field in after && !Object.is(before[field], after[field])) {
      changed.push(String(field));
    }
  }
  return changed;
}

// ─────────────────────────────── Error mapping ─────────────────────────────

export type DbErrorLike =
  | { code?: string | null; message?: string | null }
  | string
  | null
  | undefined;

/**
 * Map a Postgres/Supabase error from an admin RPC to a stable, safe, human
 * message — never leaking internals or whether an unauthorized target exists.
 * Keyed on SQLSTATE where available, falling back to message inspection.
 */
export function mapCreatorPageError(err: DbErrorLike): string {
  const code = typeof err === "object" && err ? (err.code ?? "") : "";
  const message = typeof err === "string" ? err : (err?.message ?? "");

  const lower = message.toLowerCase();

  switch (code) {
    case "23505": // unique_violation
      return "That handle is already taken.";
    case "42501": // insufficient_privilege
      return "You are not authorized to perform this action.";
    case "P0002": // no_data_found
      return "That item could not be found.";
    case "23514": // check_violation — only return reviewed, stable meanings below
      break;
  }

  if (lower.includes("already taken") || lower.includes("duplicate")) {
    return "That handle is already taken.";
  }
  if (lower.includes("admin role required") || lower.includes("authentication required")) {
    return "You are not authorized to perform this action.";
  }
  if (lower.includes("not found")) {
    return "That item could not be found.";
  }
  if (lower.includes("reserved")) return "That handle is reserved.";
  if (lower.includes("invalid status transition")) return "That status change is not allowed.";
  if (lower.includes("destination account already owns")) {
    return "That creator account already owns a page.";
  }
  if (lower.includes("destination account is not a valid creator")) {
    return "That account is not eligible to own a creator page.";
  }
  if (lower.includes("invalid font_family")) return "Invalid font family.";
  if (lower.includes("invalid background_style")) return "Invalid background style.";
  if (lower.includes("invalid button_style")) return "Invalid button style.";
  if (lower.includes("invalid accent_color")) return "Invalid accent color.";
  if (lower.includes("invalid link kind")) return "Invalid link kind.";
  if (lower.includes("visibility is required")) return "Link visibility is required.";
  if (lower.includes("no links provided")) return "No links were provided.";
  if (
    lower.includes("duplicate link ids") ||
    lower.includes("ordered list") ||
    lower.includes("link cannot be moved")
  ) {
    return "The link order could not be saved.";
  }
  if (code === "23514") return "That change is not allowed.";
  return "Something went wrong. Please try again.";
}
