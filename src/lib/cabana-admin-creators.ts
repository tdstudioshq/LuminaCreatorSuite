// ============================================================================
// CABANA — admin creator directory policy (Phase 1, PURE, READ-ONLY)
// ----------------------------------------------------------------------------
// Every DECISION the admin creator directory makes lives here: how a query is
// normalized and clamped, how a search term is made safe for PostgREST, which
// database row shape becomes which view-model, how claimed/unclaimed is derived,
// and how a page is summarized. No React, no Supabase, no browser — the UI and
// the server action are both projections of this module, so the whole directory
// is unit-testable without a DOM or a DB. In the 95% coverage set.
//
// Load-bearing rules, in one place so they cannot drift:
//
//   * `user_id` NEVER crosses the wire. It is `authenticated`-readable on
//     `creator_profiles` (anon is column-revoked by 20260532), so the SERVER
//     reads it and collapses it to a boolean `claimed` here. The browser is
//     never handed another account's auth UUID.
//   * Email is NEVER part of this view-model. `public.profiles` is owner-only
//     SELECT with no admin policy, so an admin genuinely cannot read another
//     user's email — the directory must not imply otherwise.
//   * Reads are PAGINATED, not capped. `rangeForPage` produces an explicit
//     `.range()` window; there is no unbounded select and no silent truncation.
//
// This slice is READ-ONLY. There are no admin write policies on
// `creator_profiles` / `links` (verified — none exist in the migration chain),
// so nothing here may imply an edit capability.
// ============================================================================
import { PUBLIC_SITE_DOMAIN } from "@/lib/site";

// ─────────────────────────────── View model ────────────────────────────────

/** One creator as the admin directory shows them. Deliberately carries no `user_id` and no email. */
export type AdminCreatorRow = {
  id: string;
  handle: string;
  displayName: string;
  /** Headline when set, else a bio excerpt, else "" — never invented copy. */
  excerpt: string;
  avatarUrl: string | null;
  theme: string;
  buttonStyle: string;
  accentColor: string;
  plan: string;
  /** Derived server-side from `user_id != null`. An unclaimed page has no owner yet. */
  claimed: boolean;
  linkCount: number;
  createdAt: string;
  /** Path on this site, e.g. `/aurora`. */
  publicPath: string;
  /** Display form, e.g. `cabanagrp.com/aurora`. */
  publicUrl: string;
};

export type ClaimFilter = "all" | "claimed" | "unclaimed";

const CLAIM_FILTERS: readonly ClaimFilter[] = ["all", "claimed", "unclaimed"];

export function isClaimFilter(value: unknown): value is ClaimFilter {
  return typeof value === "string" && (CLAIM_FILTERS as readonly string[]).includes(value);
}

// ─────────────────────────────── Query normalization ───────────────────────

export const ADMIN_CREATORS_PAGE_SIZE = 25;
export const ADMIN_CREATORS_MAX_PAGE_SIZE = 100;
/** Longer terms are pointless (handles cap well below this) and just widen the ILIKE. */
export const ADMIN_CREATORS_SEARCH_MAX = 64;

export type AdminCreatorsQuery = {
  /** Zero-based. */
  page: number;
  pageSize: number;
  search: string;
  claimed: ClaimFilter;
};

/**
 * Clamp an untrusted query into a safe one. The server action validates with
 * THIS function, so a hand-crafted RPC call cannot request page -1, a 10,000-row
 * page, or a 4 KB search term.
 */
export function normalizeAdminCreatorsQuery(raw: {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  claimed?: unknown;
}): AdminCreatorsQuery {
  const page =
    typeof raw.page === "number" && Number.isFinite(raw.page)
      ? Math.max(0, Math.trunc(raw.page))
      : 0;

  const pageSize =
    typeof raw.pageSize === "number" && Number.isFinite(raw.pageSize)
      ? Math.min(Math.max(Math.trunc(raw.pageSize), 1), ADMIN_CREATORS_MAX_PAGE_SIZE)
      : ADMIN_CREATORS_PAGE_SIZE;

  return {
    page,
    pageSize,
    search: sanitizeSearchTerm(raw.search),
    claimed: isClaimFilter(raw.claimed) ? raw.claimed : "all",
  };
}

/**
 * Make a search term safe to interpolate into a PostgREST `or=(...)` filter.
 *
 * PostgREST parses that filter as a comma-separated list with parenthesised
 * groups, so an unescaped `,` `(` `)` or `.` in user input does not merely fail
 * to match — it changes the FILTER, which is a query-injection surface. `*` and
 * `%` are ILIKE wildcards and would let a term match everything. We strip the
 * structural characters outright rather than trying to escape them, because a
 * creator handle is `[a-z0-9_-]` and a display name has no legitimate need for
 * PostgREST syntax.
 */
export function sanitizeSearchTerm(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[,()*%\\"'.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ADMIN_CREATORS_SEARCH_MAX);
}

/**
 * The PostgREST `or` expression for a search, or null when there is nothing to
 * search for (the caller then omits the filter entirely rather than sending a
 * match-everything one).
 */
export function buildSearchFilter(search: string): string | null {
  const term = sanitizeSearchTerm(search);
  if (term.length === 0) return null;
  return `handle.ilike.*${term}*,name.ilike.*${term}*`;
}

/** The inclusive `.range(from, to)` window for a page. */
export function rangeForPage(page: number, pageSize: number): { from: number; to: number } {
  const from = page * pageSize;
  return { from, to: from + pageSize - 1 };
}

// ─────────────────────────────── Row mapping ───────────────────────────────

/** The raw `creator_profiles` columns this directory selects. */
export type CreatorProfileRow = {
  id: string;
  user_id: string | null;
  handle: string;
  name: string | null;
  bio: string | null;
  headline: string | null;
  avatar_url: string | null;
  theme: string | null;
  button_style: string | null;
  accent_color: string | null;
  plan: string | null;
  created_at: string;
};

export const ADMIN_CREATOR_SELECT =
  "id, user_id, handle, name, bio, headline, avatar_url, theme, button_style, accent_color, plan, created_at";

/** Headline wins; otherwise a trimmed bio excerpt; otherwise empty. Never fabricated. */
export function creatorExcerpt(
  headline: string | null,
  bio: string | null,
  maxLength = 120,
): string {
  const head = (headline ?? "").trim();
  if (head.length > 0) return truncate(head, maxLength);
  const body = (bio ?? "").replace(/\s+/g, " ").trim();
  if (body.length > 0) return truncate(body, maxLength);
  return "";
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function publicCreatorPath(handle: string): string {
  return `/${handle}`;
}

export function publicCreatorUrl(handle: string): string {
  return `${PUBLIC_SITE_DOMAIN}/${handle}`;
}

/**
 * Collapse the DB row into the wire shape. `user_id` becomes `claimed` HERE, on
 * the server, and is dropped — see the module header.
 */
export function mapAdminCreatorRow(row: CreatorProfileRow, linkCount = 0): AdminCreatorRow {
  const handle = row.handle;
  return {
    id: row.id,
    handle,
    displayName: (row.name ?? "").trim() || handle,
    excerpt: creatorExcerpt(row.headline, row.bio),
    avatarUrl: row.avatar_url,
    theme: (row.theme ?? "").trim() || "iridescent",
    buttonStyle: (row.button_style ?? "").trim() || "rounded",
    accentColor: (row.accent_color ?? "").trim(),
    plan: (row.plan ?? "").trim() || "free",
    claimed: row.user_id !== null,
    linkCount,
    createdAt: row.created_at,
    publicPath: publicCreatorPath(handle),
    publicUrl: publicCreatorUrl(handle),
  };
}

/**
 * Link counts for the CURRENT PAGE only, from a bounded `links` read filtered to
 * the page's profile ids. Keeps the directory a two-query page rather than an
 * N+1 or a full-table scan.
 */
export function countLinksByProfile(rows: readonly { profile_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
  }
  return counts;
}

export function mapAdminCreatorPage(
  rows: readonly CreatorProfileRow[],
  linkRows: readonly { profile_id: string }[],
): AdminCreatorRow[] {
  const counts = countLinksByProfile(linkRows);
  return rows.map((row) => mapAdminCreatorRow(row, counts.get(row.id) ?? 0));
}

// ─────────────────────────────── Pagination view ───────────────────────────

export type AdminCreatorsPage = {
  rows: AdminCreatorRow[];
  /** Server-reported total for the CURRENT filter, or null when unavailable. */
  total: number | null;
  page: number;
  pageSize: number;
};

export type PageSummary = {
  /** 1-based index of the first row on this page; 0 when the page is empty. */
  firstIndex: number;
  /** 1-based index of the last row on this page; 0 when the page is empty. */
  lastIndex: number;
  total: number | null;
  pageCount: number | null;
  hasPrev: boolean;
  hasNext: boolean;
  isEmpty: boolean;
  /** e.g. "1–25 of 84", or "1–25" when no total is available. Never invents a total. */
  label: string;
};

/**
 * Everything the pager needs. When `total` is null (count unavailable) we do NOT
 * guess: `hasNext` falls back to "this page came back full", and the label omits
 * the total rather than printing a made-up one.
 */
export function summarizeAdminCreatorsPage(input: AdminCreatorsPage): PageSummary {
  const { rows, total, page, pageSize } = input;
  const isEmpty = rows.length === 0;
  const firstIndex = isEmpty ? 0 : page * pageSize + 1;
  const lastIndex = isEmpty ? 0 : page * pageSize + rows.length;

  const pageCount = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 0;
  const hasNext = total === null ? rows.length === pageSize : lastIndex < total;

  const label = isEmpty
    ? total === null
      ? "No creators"
      : `0 of ${total}`
    : total === null
      ? `${firstIndex}–${lastIndex}`
      : `${firstIndex}–${lastIndex} of ${total}`;

  return { firstIndex, lastIndex, total, pageCount, hasPrev, hasNext, isEmpty, label };
}

/** Stable, human date for the directory. UTC — never the viewer's timezone. */
export function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The single source of truth for what this read-only slice can and cannot do. */
export const ADMIN_CREATORS_READONLY_NOTICE =
  "Read-only directory. Editing a creator's page, inviting a creator, and publishing controls are not built yet.";

/** Why no email column exists — stated plainly rather than shown as a blank cell. */
export const ADMIN_CREATORS_NO_EMAIL_NOTICE =
  "Email isn’t shown: account emails live in a table only the account owner can read, so an admin genuinely can’t see them.";
