// ============================================================================
// CABANA — admin creator-page mutation server actions (Phase 2A.2)
// ----------------------------------------------------------------------------
// The thin, caller-RLS-scoped write layer over the migration-20260538 admin
// RPCs. These do NOT reimplement authorization — the SQL RPCs re-check admin,
// re-validate every rule, and write the audit rows. Each action:
//   * composes attachSupabaseToken (client) + requireSupabaseAuth (server) so it
//     runs under the CALLER's RLS — never the service role;
//   * asserts admin a second time in-handler via `assertAdmin` (defense in depth,
//     the convention from admin-creator-actions.ts) — authority is user_roles,
//     never an email or a client-supplied flag;
//   * does light pre-flight validation/normalization via the pure
//     cabana-creator-pages module (nicer errors) and maps RPC failures to stable,
//     safe messages.
//
// The mutation logic is exposed as injected-dependency flow functions (deps =
// { assertAdmin, rpc }) so they are unit-tested without a browser or DB; the
// createServerFn handlers just wire the real deps.
//
// Must NOT live under any **/server/** path (createServerFn compiles to a
// client-importable RPC bridge). supabaseAdmin (service role) is never imported.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  type DbErrorLike,
  type PageStatusAction,
  isPlausibleHandle,
  isPageStatusAction,
  isValidAccentColor,
  isValidBackgroundStyle,
  isValidButtonStyle,
  isValidCreatorPageTheme,
  isValidFontFamily,
  isValidHttpUrl,
  isValidLinkKind,
  isUuid,
  mapCreatorPageError,
  normalizeHandle,
} from "@/lib/cabana-creator-pages";

type Db = SupabaseClient<Database>;

// The 2A.2 RPCs are defined in local migration 20260538 and are NOT yet in the
// Lovable-generated types.ts (which tracks the cloud schema), so they are called
// through a narrowly-typed shim rather than regenerating types (which would
// require a cloud apply). SQL remains the authoritative security layer.
export type CreatorPageRpc =
  | "admin_create_creator_page"
  | "admin_update_creator_page"
  | "admin_set_creator_page_status"
  | "admin_transfer_creator_page"
  | "admin_upsert_creator_link"
  | "admin_set_creator_link_visibility"
  | "admin_reorder_creator_links"
  | "admin_delete_creator_link";

export interface RpcResult {
  data: unknown;
  error: DbErrorLike;
}
export type RpcFn = (fn: CreatorPageRpc, args: Record<string, unknown>) => Promise<RpcResult>;

export interface AdminPageDeps {
  assertAdmin: () => Promise<void>;
  rpc: RpcFn;
}

/**
 * Server-side admin assertion — reads the caller's OWN user_roles row under
 * their own RLS. No service role, no email, no client-supplied flag. Generic
 * error: a non-admin learns only that they are not authorized.
 */
export async function assertAdmin(supabase: Db, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("You are not authorized to perform this action.");
}

function makeRpc(supabase: Db): RpcFn {
  return (fn, args) =>
    (
      supabase.rpc as unknown as (
        name: string,
        params?: Record<string, unknown>,
      ) => Promise<RpcResult>
    )(fn, args);
}

function fail(error: DbErrorLike): never {
  throw new Error(mapCreatorPageError(error));
}

// ─────────────────────────────── Input shapes ──────────────────────────────

export interface CreatePageInput {
  handle: string;
  displayName: string;
  bio?: string | null;
  headline?: string | null;
}
export interface UpdatePageInput {
  creatorProfileId: string;
  handle?: string | null;
  name?: string | null;
  bio?: string | null;
  headline?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  theme?: string | null;
  accentColor?: string | null;
  buttonStyle?: string | null;
  fontFamily?: string | null;
  backgroundStyle?: string | null;
}
export interface SetStatusInput {
  creatorProfileId: string;
  action: PageStatusAction;
}
export interface TransferInput {
  creatorProfileId: string;
  toUserId?: string | null;
}
export interface UpsertLinkInput {
  creatorProfileId: string;
  id?: string | null;
  title: string;
  url: string;
  icon?: string | null;
  featured?: boolean | null;
  scheduled?: string | null;
  kind?: string | null;
  isVisible?: boolean | null;
  position?: number | null;
}
export interface SetLinkVisibilityInput {
  linkId: string;
  isVisible: boolean;
}
export interface ReorderLinksInput {
  creatorProfileId: string;
  orderedIds: string[];
}
export interface DeleteLinkInput {
  linkId: string;
}

const MAX_NAME = 120;
const MAX_BIO = 2_000;
const MAX_HEADLINE = 160;
const MAX_URL = 2_048;
const MAX_LINK_TITLE = 200;
const MAX_ICON = 50;
const MAX_LINKS_PER_REORDER = 200;

function inputRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid creator-page request.");
  }
  return raw as Record<string, unknown>;
}

function requiredUuid(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!isUuid(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function optionalText(value: unknown, label: string, maximum: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error(`${label} is too long.`);
  return normalized;
}

function optionalBoolean(value: unknown, label: string): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "boolean") throw new Error(`${label} is invalid.`);
  return value;
}

export function validateCreatePageInput(raw: unknown): CreatePageInput {
  const value = inputRecord(raw);
  const handle = normalizeHandle(typeof value.handle === "string" ? value.handle : "");
  const displayName = typeof value.displayName === "string" ? value.displayName.trim() : "";
  const bio = optionalText(value.bio, "Biography", MAX_BIO);
  const headline = optionalText(value.headline, "Headline", MAX_HEADLINE);
  if (!isPlausibleHandle(handle)) {
    throw new Error("Handle must use 1–64 letters, numbers, hyphens, or underscores.");
  }
  if (!displayName || displayName.length > MAX_NAME) {
    throw new Error("Display name must be between 1 and 120 characters.");
  }
  return { handle, displayName, bio, headline };
}

export function validateUpdatePageInput(raw: unknown): UpdatePageInput {
  const value = inputRecord(raw);
  const result: UpdatePageInput = {
    creatorProfileId: requiredUuid(value.creatorProfileId, "Creator page ID"),
  };
  result.handle = optionalText(value.handle, "Handle", 64);
  if (result.handle != null) {
    result.handle = normalizeHandle(result.handle);
    if (!isPlausibleHandle(result.handle)) {
      throw new Error("Handle must use 1–64 letters, numbers, hyphens, or underscores.");
    }
  }
  result.name = optionalText(value.name, "Display name", MAX_NAME);
  if (result.name !== undefined && result.name !== null && !result.name) {
    throw new Error("Display name is required.");
  }
  result.bio = optionalText(value.bio, "Biography", MAX_BIO);
  result.headline = optionalText(value.headline, "Headline", MAX_HEADLINE);
  result.avatarUrl = optionalText(value.avatarUrl, "Avatar URL", MAX_URL);
  result.bannerUrl = optionalText(value.bannerUrl, "Banner URL", MAX_URL);
  for (const [label, asset] of [
    ["Avatar URL", result.avatarUrl],
    ["Banner URL", result.bannerUrl],
  ] as const) {
    if (asset != null && asset !== "" && !isValidHttpUrl(asset)) {
      throw new Error(`${label} must be a valid HTTP or HTTPS URL.`);
    }
  }
  result.theme = optionalText(value.theme, "Theme", 30);
  if (result.theme != null && !isValidCreatorPageTheme(result.theme)) {
    throw new Error("Invalid theme.");
  }
  result.accentColor = optionalText(value.accentColor, "Accent color", 7);
  if (result.accentColor != null && !isValidAccentColor(result.accentColor)) {
    throw new Error("Invalid accent color.");
  }
  result.buttonStyle = optionalText(value.buttonStyle, "Button style", 20);
  if (result.buttonStyle != null && !isValidButtonStyle(result.buttonStyle)) {
    throw new Error("Invalid button style.");
  }
  result.fontFamily = optionalText(value.fontFamily, "Font family", 20);
  if (result.fontFamily != null && !isValidFontFamily(result.fontFamily)) {
    throw new Error("Invalid font family.");
  }
  result.backgroundStyle = optionalText(value.backgroundStyle, "Background style", 20);
  if (result.backgroundStyle != null && !isValidBackgroundStyle(result.backgroundStyle)) {
    throw new Error("Invalid background style.");
  }
  return result;
}

export function validateSetStatusInput(raw: unknown): SetStatusInput {
  const value = inputRecord(raw);
  if (!isPageStatusAction(value.action)) throw new Error("Invalid status action.");
  return {
    creatorProfileId: requiredUuid(value.creatorProfileId, "Creator page ID"),
    action: value.action,
  };
}

export function validateTransferInput(raw: unknown): TransferInput {
  const value = inputRecord(raw);
  return {
    creatorProfileId: requiredUuid(value.creatorProfileId, "Creator page ID"),
    toUserId: value.toUserId == null ? null : requiredUuid(value.toUserId, "Creator account ID"),
  };
}

export function validateUpsertLinkInput(raw: unknown): UpsertLinkInput {
  const value = inputRecord(raw);
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (!title || title.length > MAX_LINK_TITLE) {
    throw new Error("Link title must be between 1 and 200 characters.");
  }
  if (!url || url.length > MAX_URL || !isValidHttpUrl(url)) {
    throw new Error("Link URL must be a valid HTTP or HTTPS URL.");
  }
  const icon = optionalText(value.icon, "Link icon", MAX_ICON);
  if (icon === "") throw new Error("Link icon is required.");
  const scheduled = optionalText(value.scheduled, "Link schedule", 120);
  const kind = optionalText(value.kind, "Link kind", 20);
  if (kind != null && !isValidLinkKind(kind)) throw new Error("Invalid link kind.");
  const position = value.position;
  if (
    position !== undefined &&
    position !== null &&
    (!Number.isInteger(position) || Number(position) < 0 || Number(position) > 10_000)
  ) {
    throw new Error("Link position is invalid.");
  }
  return {
    creatorProfileId: requiredUuid(value.creatorProfileId, "Creator page ID"),
    id: value.id == null ? null : requiredUuid(value.id, "Link ID"),
    title,
    url,
    icon,
    featured: optionalBoolean(value.featured, "Featured value"),
    scheduled,
    kind,
    isVisible: optionalBoolean(value.isVisible, "Visibility value"),
    position: position == null ? position : Number(position),
  };
}

export function validateSetLinkVisibilityInput(raw: unknown): SetLinkVisibilityInput {
  const value = inputRecord(raw);
  if (typeof value.isVisible !== "boolean") throw new Error("Visibility value is invalid.");
  return { linkId: requiredUuid(value.linkId, "Link ID"), isVisible: value.isVisible };
}

export function validateReorderLinksInput(raw: unknown): ReorderLinksInput {
  const value = inputRecord(raw);
  if (!Array.isArray(value.orderedIds) || value.orderedIds.length === 0) {
    throw new Error("No links provided.");
  }
  if (value.orderedIds.length > MAX_LINKS_PER_REORDER) throw new Error("Too many links provided.");
  const orderedIds = value.orderedIds.map((id) => requiredUuid(id, "Link ID"));
  if (new Set(orderedIds).size !== orderedIds.length) throw new Error("Duplicate link ids.");
  return {
    creatorProfileId: requiredUuid(value.creatorProfileId, "Creator page ID"),
    orderedIds,
  };
}

export function validateDeleteLinkInput(raw: unknown): DeleteLinkInput {
  const value = inputRecord(raw);
  return { linkId: requiredUuid(value.linkId, "Link ID") };
}

// ─────────────────────────────── Flow functions ────────────────────────────

export async function createCreatorPage(
  deps: AdminPageDeps,
  input: CreatePageInput,
): Promise<{ id: string }> {
  await deps.assertAdmin();
  const valid = validateCreatePageInput(input);
  const { data, error } = await deps.rpc("admin_create_creator_page", {
    _handle: valid.handle,
    _display_name: valid.displayName,
    _bio: valid.bio ?? "",
    _headline: valid.headline ?? "",
  });
  if (error) fail(error);
  if (!isUuid(data)) throw new Error("The creator page could not be created. Please try again.");
  return { id: data };
}

export async function updateCreatorPage(
  deps: AdminPageDeps,
  input: UpdatePageInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  const valid = validateUpdatePageInput(input);

  const { error } = await deps.rpc("admin_update_creator_page", {
    _creator_profile_id: valid.creatorProfileId,
    _handle: valid.handle ?? null,
    _name: valid.name ?? null,
    _bio: valid.bio ?? null,
    _headline: valid.headline ?? null,
    _avatar_url: valid.avatarUrl ?? null,
    _banner_url: valid.bannerUrl ?? null,
    _theme: valid.theme ?? null,
    _accent_color: valid.accentColor ?? null,
    _button_style: valid.buttonStyle ?? null,
    _font_family: valid.fontFamily ?? null,
    _background_style: valid.backgroundStyle ?? null,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function setCreatorPageStatus(
  deps: AdminPageDeps,
  input: SetStatusInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  const valid = validateSetStatusInput(input);
  const { error } = await deps.rpc("admin_set_creator_page_status", {
    _creator_profile_id: valid.creatorProfileId,
    _action: valid.action,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function transferCreatorPage(
  deps: AdminPageDeps,
  input: TransferInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  const valid = validateTransferInput(input);
  const { error } = await deps.rpc("admin_transfer_creator_page", {
    _creator_profile_id: valid.creatorProfileId,
    _to_user_id: valid.toUserId ?? null,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function upsertCreatorLink(
  deps: AdminPageDeps,
  input: UpsertLinkInput,
): Promise<{ id: string }> {
  await deps.assertAdmin();
  const valid = validateUpsertLinkInput(input);
  const { data, error } = await deps.rpc("admin_upsert_creator_link", {
    _creator_profile_id: valid.creatorProfileId,
    _title: valid.title,
    _url: valid.url,
    _id: valid.id ?? null,
    _icon: valid.icon ?? "globe",
    _featured: valid.featured ?? false,
    _scheduled: valid.scheduled ?? null,
    _kind: valid.kind ?? "link",
    _is_visible: valid.isVisible ?? true,
    _position: valid.position ?? null,
  });
  if (error) fail(error);
  if (!isUuid(data)) throw new Error("The link could not be saved. Please try again.");
  return { id: data };
}

export async function setCreatorLinkVisibility(
  deps: AdminPageDeps,
  input: SetLinkVisibilityInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  const valid = validateSetLinkVisibilityInput(input);
  const { error } = await deps.rpc("admin_set_creator_link_visibility", {
    _link_id: valid.linkId,
    _is_visible: valid.isVisible,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function reorderCreatorLinks(
  deps: AdminPageDeps,
  input: ReorderLinksInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  const valid = validateReorderLinksInput(input);
  const { error } = await deps.rpc("admin_reorder_creator_links", {
    _creator_profile_id: valid.creatorProfileId,
    _ordered_ids: valid.orderedIds,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function deleteCreatorLink(
  deps: AdminPageDeps,
  input: DeleteLinkInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  const valid = validateDeleteLinkInput(input);
  const { error } = await deps.rpc("admin_delete_creator_link", { _link_id: valid.linkId });
  if (error) fail(error);
  return { ok: true };
}

// ─────────────────────────── createServerFn handlers ───────────────────────

function depsFrom(supabase: Db, userId: string): AdminPageDeps {
  return { assertAdmin: () => assertAdmin(supabase, userId), rpc: makeRpc(supabase) };
}

export const adminCreateCreatorPage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(validateCreatePageInput)
  .handler(({ context, data }) =>
    createCreatorPage(depsFrom(context.supabase, context.userId), data),
  );

export const adminUpdateCreatorPage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(validateUpdatePageInput)
  .handler(({ context, data }) =>
    updateCreatorPage(depsFrom(context.supabase, context.userId), data),
  );

export const adminSetCreatorPageStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(validateSetStatusInput)
  .handler(({ context, data }) =>
    setCreatorPageStatus(depsFrom(context.supabase, context.userId), data),
  );

export const adminTransferCreatorPage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(validateTransferInput)
  .handler(({ context, data }) =>
    transferCreatorPage(depsFrom(context.supabase, context.userId), data),
  );

export const adminUpsertCreatorLink = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(validateUpsertLinkInput)
  .handler(({ context, data }) =>
    upsertCreatorLink(depsFrom(context.supabase, context.userId), data),
  );

export const adminSetCreatorLinkVisibility = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(validateSetLinkVisibilityInput)
  .handler(({ context, data }) =>
    setCreatorLinkVisibility(depsFrom(context.supabase, context.userId), data),
  );

export const adminReorderCreatorLinks = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(validateReorderLinksInput)
  .handler(({ context, data }) =>
    reorderCreatorLinks(depsFrom(context.supabase, context.userId), data),
  );

export const adminDeleteCreatorLink = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(validateDeleteLinkInput)
  .handler(({ context, data }) =>
    deleteCreatorLink(depsFrom(context.supabase, context.userId), data),
  );
