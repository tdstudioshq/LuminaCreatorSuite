// ============================================================================
// CABANA — admin creator-page detail server reads
// ----------------------------------------------------------------------------
// Caller-scoped, explicitly admin-gated reads for the editor. The local schema
// includes migrations 20260537-40 while generated cloud types still lag, so the
// new columns and audit RPC use narrow casts. No service-role client is used.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  ADMIN_CREATOR_PAGE_LINK_LIMIT,
  type AdminCreatorPageAuditInput,
  type AdminCreatorPageAuditItem,
  type AdminCreatorPageAuditRow,
  type AdminCreatorPageDetail,
  type AdminCreatorPageDetailInput,
  type AdminCreatorPageLinkRow,
  type AdminCreatorPageReadError,
  type AdminCreatorPageRow,
  mapAdminCreatorPageAuditItem,
  mapAdminCreatorPageDetail,
  mapAdminCreatorPageReadError,
  normalizeAdminCreatorPageAuditInput,
  normalizeAdminCreatorPageDetailInput,
} from "@/lib/cabana-admin-creator-page-detail";

type Db = SupabaseClient<Database>;

export const ADMIN_CREATOR_PAGE_DETAIL_SELECT =
  "id, user_id, handle, name, bio, headline, avatar_url, banner_url, theme, accent_color, button_style, font_family, background_style, page_status, plan, created_at, updated_at";
export const ADMIN_CREATOR_PAGE_LINK_SELECT =
  "id, profile_id, title, url, icon, featured, scheduled, position, kind, is_visible, created_at";
export const ADMIN_CREATOR_PAGE_AUDIT_SELECT =
  "id, actor_role, action, target_type, target_id, before, after, reason, created_at";

export interface ReadResult<T> {
  data: T;
  error: AdminCreatorPageReadError;
}

export interface AdminCreatorPageReadDeps {
  assertAdmin: () => Promise<void>;
  getProfile: (creatorProfileId: string) => Promise<ReadResult<AdminCreatorPageRow | null>>;
  getLinks: (creatorProfileId: string) => Promise<ReadResult<AdminCreatorPageLinkRow[]>>;
  getAuditHistory: (
    creatorProfileId: string,
    limit: number,
  ) => Promise<ReadResult<AdminCreatorPageAuditRow[]>>;
}

/** Server-side authorization from trusted user_roles, never email/JWT flags. */
export async function assertAdmin(supabase: Db, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Admin access is required.");
}

function fail(error: AdminCreatorPageReadError): never {
  throw new Error(mapAdminCreatorPageReadError(error));
}

export async function readAdminCreatorPageDetail(
  deps: AdminCreatorPageReadDeps,
  raw: unknown,
): Promise<AdminCreatorPageDetail | null> {
  const input = normalizeAdminCreatorPageDetailInput(raw);
  await deps.assertAdmin();

  const profileResult = await deps.getProfile(input.creatorProfileId);
  if (profileResult.error) fail(profileResult.error);
  if (!profileResult.data) return null;

  const linksResult = await deps.getLinks(input.creatorProfileId);
  if (linksResult.error) fail(linksResult.error);
  if (linksResult.data.length > ADMIN_CREATOR_PAGE_LINK_LIMIT) {
    throw new Error("This creator page has too many links to manage safely.");
  }
  return mapAdminCreatorPageDetail(profileResult.data, linksResult.data);
}

export async function readAdminCreatorPageAuditHistory(
  deps: AdminCreatorPageReadDeps,
  raw: unknown,
): Promise<AdminCreatorPageAuditItem[]> {
  const input = normalizeAdminCreatorPageAuditInput(raw);
  await deps.assertAdmin();
  const result = await deps.getAuditHistory(input.creatorProfileId, input.limit);
  if (result.error) fail(result.error);
  return result.data.slice(0, input.limit).map(mapAdminCreatorPageAuditItem);
}

async function selectProfile(
  supabase: Db,
  creatorProfileId: string,
): Promise<ReadResult<AdminCreatorPageRow | null>> {
  const result = await supabase
    .from("creator_profiles")
    .select(ADMIN_CREATOR_PAGE_DETAIL_SELECT)
    .eq("id", creatorProfileId)
    .maybeSingle();
  return result as unknown as ReadResult<AdminCreatorPageRow | null>;
}

async function selectLinks(
  supabase: Db,
  creatorProfileId: string,
): Promise<ReadResult<AdminCreatorPageLinkRow[]>> {
  const result = await supabase
    .from("links")
    .select(ADMIN_CREATOR_PAGE_LINK_SELECT)
    .eq("profile_id", creatorProfileId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(ADMIN_CREATOR_PAGE_LINK_LIMIT + 1);
  return result as unknown as ReadResult<AdminCreatorPageLinkRow[]>;
}

type AuditRpcBuilder = {
  select: (columns: string) => {
    limit: (limit: number) => PromiseLike<ReadResult<AdminCreatorPageAuditRow[]>>;
  };
};

async function selectAuditHistory(
  supabase: Db,
  creatorProfileId: string,
  limit: number,
): Promise<ReadResult<AdminCreatorPageAuditRow[]>> {
  const rpc = supabase.rpc as unknown as (
    name: "admin_get_creator_page_audit_history",
    args: { _creator_profile_id: string; _limit: number },
  ) => AuditRpcBuilder;
  return rpc("admin_get_creator_page_audit_history", {
    _creator_profile_id: creatorProfileId,
    _limit: limit,
  })
    .select(ADMIN_CREATOR_PAGE_AUDIT_SELECT)
    .limit(limit);
}

function depsFrom(supabase: Db, userId: string): AdminCreatorPageReadDeps {
  return {
    assertAdmin: () => assertAdmin(supabase, userId),
    getProfile: (creatorProfileId) => selectProfile(supabase, creatorProfileId),
    getLinks: (creatorProfileId) => selectLinks(supabase, creatorProfileId),
    getAuditHistory: (creatorProfileId, limit) =>
      selectAuditHistory(supabase, creatorProfileId, limit),
  };
}

export const getAdminCreatorPageDetail = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(normalizeAdminCreatorPageDetailInput)
  .handler(
    ({ context, data }): Promise<AdminCreatorPageDetail | null> =>
      readAdminCreatorPageDetail(depsFrom(context.supabase, context.userId), data),
  );

export const getAdminCreatorPageAuditHistory = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(normalizeAdminCreatorPageAuditInput)
  .handler(
    ({ context, data }): Promise<AdminCreatorPageAuditItem[]> =>
      readAdminCreatorPageAuditHistory(depsFrom(context.supabase, context.userId), data),
  );
