// ============================================================================
// CABANA — audited staff-role mutation server actions
// ============================================================================
// These are intentionally thin caller-scoped wrappers over migration 20260539.
// UI authorization is never trusted: the handler asserts admin using user_roles,
// and the SECURITY DEFINER RPC derives auth.uid() and re-checks admin in SQL.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  type RoleDbError,
  type RoleMutationInput,
  mapRoleMutationError,
  normalizeRoleMutationInput,
} from "@/lib/cabana-admin-roles";

type Db = SupabaseClient<Database>;
export type AdminRoleRpc = "admin_grant_user_role" | "admin_remove_user_role";
export interface AdminRoleRpcResult {
  data: unknown;
  error: RoleDbError;
}
export type AdminRoleRpcFn = (
  fn: AdminRoleRpc,
  args: Record<string, unknown>,
) => Promise<AdminRoleRpcResult>;

export interface AdminRoleDeps {
  assertAdmin: () => Promise<void>;
  rpc: AdminRoleRpcFn;
}

/** Caller-scoped server assertion; SQL repeats this check authoritatively. */
export async function assertAdmin(supabase: Db, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("You are not authorized to perform this action.");
}

function makeRpc(supabase: Db): AdminRoleRpcFn {
  return async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args as never);
    return { data, error };
  };
}

async function mutateRole(
  deps: AdminRoleDeps,
  fn: AdminRoleRpc,
  raw: RoleMutationInput,
): Promise<{ ok: true }> {
  const input = normalizeRoleMutationInput(raw);
  await deps.assertAdmin();
  const { error } = await deps.rpc(fn, {
    _target_user_id: input.targetUserId,
    _role: input.role,
    _reason: input.reason,
  });
  if (error) throw new Error(mapRoleMutationError(error));
  return { ok: true };
}

export function grantUserRole(
  deps: AdminRoleDeps,
  input: RoleMutationInput,
): Promise<{ ok: true }> {
  return mutateRole(deps, "admin_grant_user_role", input);
}

export function removeUserRole(
  deps: AdminRoleDeps,
  input: RoleMutationInput,
): Promise<{ ok: true }> {
  return mutateRole(deps, "admin_remove_user_role", input);
}

function depsFrom(supabase: Db, userId: string): AdminRoleDeps {
  return { assertAdmin: () => assertAdmin(supabase, userId), rpc: makeRpc(supabase) };
}

export const adminGrantUserRole = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(normalizeRoleMutationInput)
  .handler(({ context, data }) => grantUserRole(depsFrom(context.supabase, context.userId), data));

export const adminRemoveUserRole = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(normalizeRoleMutationInput)
  .handler(({ context, data }) => removeUserRole(depsFrom(context.supabase, context.userId), data));
