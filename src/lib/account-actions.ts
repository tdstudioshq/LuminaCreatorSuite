// ============================================================================
// CABANA — protected account server actions (T2 tier)
// ----------------------------------------------------------------------------
// The first real protected server-action layer. Each action composes:
//   1. attachSupabaseToken  (client) — sends the session bearer token
//   2. requireSupabaseAuth  (server) — validates it, yields an RLS-scoped
//                                      per-request Supabase client + userId
// All data access therefore runs under the caller's RLS, never the service
// role. Handlers stay thin and delegate shaping/validation to the pure
// `cabana-account` module.
//
// Scope (Phase 2B): authenticated account context, current account type/role,
// and member-profile read/update. No posts/feed/messaging/payments.
//
// NOTE: createServerFn modules are intentionally client-importable (they
// compile to an RPC bridge), so this file must NOT live under a `**/server/**`
// path — the start import-protection plugin blocks those from client bundles.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type AccountContext,
  type MemberProfile,
  mapMemberProfile,
  normalizeMemberProfileInput,
  shapeAccountContext,
} from "@/lib/cabana-account";

/** Authenticated user context: id, account type, roles, and basic identity. */
export const getAccountContext = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountContext> => {
    const { supabase, userId } = context;
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("account_type, name, email").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (profileRes.error) throw new Error(profileRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    return shapeAccountContext({
      userId,
      profile: profileRes.data ?? null,
      roleRows: rolesRes.data ?? null,
    });
  });

/** Read the caller's member profile (null if they don't have one). */
export const getMemberProfile = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberProfile | null> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("member_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapMemberProfile(data) : null;
  });

/**
 * Create-or-update the caller's member profile. Upsert keeps it idempotent
 * whether or not the signup trigger already provisioned a row. RLS guarantees a
 * caller can only ever touch their own row.
 */
export const updateMemberProfile = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { displayName?: string; bio?: string }) =>
    normalizeMemberProfileInput(raw ?? {}),
  )
  .handler(async ({ context, data }): Promise<MemberProfile> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("member_profiles")
      .upsert(
        { user_id: userId, display_name: data.displayName, bio: data.bio },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapMemberProfile(row);
  });
