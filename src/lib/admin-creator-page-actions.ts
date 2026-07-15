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
  hasHttpScheme,
  isPageStatusAction,
  isValidAccentColor,
  isValidBackgroundStyle,
  isValidButtonStyle,
  isValidFontFamily,
  isValidLinkKind,
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

// ─────────────────────────────── Flow functions ────────────────────────────

export async function createCreatorPage(
  deps: AdminPageDeps,
  input: CreatePageInput,
): Promise<{ id: string }> {
  await deps.assertAdmin();
  const handle = normalizeHandle(input.handle ?? "");
  if (!handle) throw new Error("Handle is required.");
  const { data, error } = await deps.rpc("admin_create_creator_page", {
    _handle: handle,
    _display_name: input.displayName ?? "",
    _bio: input.bio ?? "",
    _headline: input.headline ?? "",
  });
  if (error) fail(error);
  return { id: String(data) };
}

export async function updateCreatorPage(
  deps: AdminPageDeps,
  input: UpdatePageInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  if (input.fontFamily != null && !isValidFontFamily(input.fontFamily))
    throw new Error("Invalid font family.");
  if (input.backgroundStyle != null && !isValidBackgroundStyle(input.backgroundStyle))
    throw new Error("Invalid background style.");
  if (input.buttonStyle != null && !isValidButtonStyle(input.buttonStyle))
    throw new Error("Invalid button style.");
  if (input.accentColor != null && !isValidAccentColor(input.accentColor))
    throw new Error("Invalid accent color.");

  const { error } = await deps.rpc("admin_update_creator_page", {
    _creator_profile_id: input.creatorProfileId,
    _handle: input.handle != null ? normalizeHandle(input.handle) : null,
    _name: input.name ?? null,
    _bio: input.bio ?? null,
    _headline: input.headline ?? null,
    _avatar_url: input.avatarUrl ?? null,
    _banner_url: input.bannerUrl ?? null,
    _theme: input.theme ?? null,
    _accent_color: input.accentColor ?? null,
    _button_style: input.buttonStyle ?? null,
    _font_family: input.fontFamily ?? null,
    _background_style: input.backgroundStyle ?? null,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function setCreatorPageStatus(
  deps: AdminPageDeps,
  input: SetStatusInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  if (!isPageStatusAction(input.action)) throw new Error("Invalid status action.");
  const { error } = await deps.rpc("admin_set_creator_page_status", {
    _creator_profile_id: input.creatorProfileId,
    _action: input.action,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function transferCreatorPage(
  deps: AdminPageDeps,
  input: TransferInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  const { error } = await deps.rpc("admin_transfer_creator_page", {
    _creator_profile_id: input.creatorProfileId,
    _to_user_id: input.toUserId ?? null,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function upsertCreatorLink(
  deps: AdminPageDeps,
  input: UpsertLinkInput,
): Promise<{ id: string }> {
  await deps.assertAdmin();
  if (input.kind != null && !isValidLinkKind(input.kind)) throw new Error("Invalid link kind.");
  if (input.url != null && !hasHttpScheme(input.url))
    throw new Error("Link URL must start with http:// or https://.");
  const { data, error } = await deps.rpc("admin_upsert_creator_link", {
    _creator_profile_id: input.creatorProfileId,
    _title: input.title,
    _url: input.url,
    _id: input.id ?? null,
    _icon: input.icon ?? "globe",
    _featured: input.featured ?? false,
    _scheduled: input.scheduled ?? null,
    _kind: input.kind ?? "link",
    _is_visible: input.isVisible ?? true,
    _position: input.position ?? null,
  });
  if (error) fail(error);
  return { id: String(data) };
}

export async function setCreatorLinkVisibility(
  deps: AdminPageDeps,
  input: SetLinkVisibilityInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  const { error } = await deps.rpc("admin_set_creator_link_visibility", {
    _link_id: input.linkId,
    _is_visible: input.isVisible,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function reorderCreatorLinks(
  deps: AdminPageDeps,
  input: ReorderLinksInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  if (input.orderedIds.length === 0) throw new Error("No links provided.");
  if (new Set(input.orderedIds).size !== input.orderedIds.length)
    throw new Error("Duplicate link ids.");
  const { error } = await deps.rpc("admin_reorder_creator_links", {
    _creator_profile_id: input.creatorProfileId,
    _ordered_ids: input.orderedIds,
  });
  if (error) fail(error);
  return { ok: true };
}

export async function deleteCreatorLink(
  deps: AdminPageDeps,
  input: DeleteLinkInput,
): Promise<{ ok: true }> {
  await deps.assertAdmin();
  const { error } = await deps.rpc("admin_delete_creator_link", { _link_id: input.linkId });
  if (error) fail(error);
  return { ok: true };
}

// ─────────────────────────── createServerFn handlers ───────────────────────

function depsFrom(supabase: Db, userId: string): AdminPageDeps {
  return { assertAdmin: () => assertAdmin(supabase, userId), rpc: makeRpc(supabase) };
}

export const adminCreateCreatorPage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: CreatePageInput) => raw)
  .handler(({ context, data }) =>
    createCreatorPage(depsFrom(context.supabase, context.userId), data),
  );

export const adminUpdateCreatorPage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: UpdatePageInput) => raw)
  .handler(({ context, data }) =>
    updateCreatorPage(depsFrom(context.supabase, context.userId), data),
  );

export const adminSetCreatorPageStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: SetStatusInput) => raw)
  .handler(({ context, data }) =>
    setCreatorPageStatus(depsFrom(context.supabase, context.userId), data),
  );

export const adminTransferCreatorPage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: TransferInput) => raw)
  .handler(({ context, data }) =>
    transferCreatorPage(depsFrom(context.supabase, context.userId), data),
  );

export const adminUpsertCreatorLink = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: UpsertLinkInput) => raw)
  .handler(({ context, data }) =>
    upsertCreatorLink(depsFrom(context.supabase, context.userId), data),
  );

export const adminSetCreatorLinkVisibility = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: SetLinkVisibilityInput) => raw)
  .handler(({ context, data }) =>
    setCreatorLinkVisibility(depsFrom(context.supabase, context.userId), data),
  );

export const adminReorderCreatorLinks = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: ReorderLinksInput) => raw)
  .handler(({ context, data }) =>
    reorderCreatorLinks(depsFrom(context.supabase, context.userId), data),
  );

export const adminDeleteCreatorLink = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: DeleteLinkInput) => raw)
  .handler(({ context, data }) =>
    deleteCreatorLink(depsFrom(context.supabase, context.userId), data),
  );
