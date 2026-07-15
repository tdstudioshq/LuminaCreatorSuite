// ============================================================================
// CABANA — admin creator directory server actions
// ----------------------------------------------------------------------------
// The read side of admin creator management. NO schema change, NO new policy,
// NO write path — `creator_profiles` and `links` have no admin write policy in
// the migration chain, and this slice does not pretend otherwise.
//
// Authorization, in three independent layers (weakest to strongest):
//
//   1. The route renders behind `AdminGate` (UX only — never the boundary).
//   2. THIS handler asserts the caller holds `user_roles.role = 'admin'`, read
//      under the caller's own RLS ("Users can view own roles"). That is a real
//      server-side denial, not UI hiding, and it needs no migration. Authority
//      comes from the ROLE TABLE — never from an email, never from the client.
//   3. RLS is still the final authority on every row returned.
//
// Layer 2 is deliberate: the existing admin actions rely on RLS alone (see
// `admin-finance-actions.ts`), which fails safely but has no second layer. A
// read whose rows are public-by-policy would otherwise have NO admin gate at all
// below the router.
//
// Reads are PAGINATED with `.range()` — not `.limit()`-capped. Nothing is
// silently truncated.
//
// Every handler runs under the caller's RLS (`attachSupabaseToken` +
// `requireSupabaseAuth`). `supabaseAdmin` (service role) is NEVER imported here.
// Must NOT live under any `**/server/**` path (compiles to a client RPC bridge).
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  ADMIN_CREATOR_SELECT,
  ADMIN_CREATOR_LINKS_PER_PAGE_MAX,
  type AdminCreatorsPage,
  type CreatorProfileRow,
  buildSearchFilter,
  mapAdminCreatorPage,
  normalizeAdminCreatorsQuery,
  rangeForPage,
} from "@/lib/cabana-admin-creators";

type Db = SupabaseClient<Database>;

/**
 * Server-side admin assertion. Reads the caller's OWN `user_roles` row under
 * their own RLS — no service role, no email, no client-supplied flag. Throws a
 * safe, generic error: a non-admin learns only that they are not authorized.
 */
async function assertAdmin(supabase: Db, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Admin access is required.");
}

/**
 * One page of the creator directory, newest first.
 *
 * Two bounded queries, never an unbounded select:
 *   1. `creator_profiles` — the requested `.range()` window, plus an exact count
 *      for the current filter (cheap: this table is small and indexed).
 *   2. `links` — restricted to the ids ON THIS PAGE, to derive per-creator link
 *      counts without an N+1 or a full-table scan.
 *
 * `user_id` is read (it is `authenticated`-readable; anon is column-revoked by
 * migration 20260532) purely to derive `claimed`, and is dropped by
 * `mapAdminCreatorPage` — the browser never receives another account's auth UUID.
 * Email is not selected at all: `public.profiles` is owner-only SELECT with no
 * admin policy, so it genuinely is not readable here.
 */
export const getAdminCreators = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(
    (
      raw:
        | {
            page?: unknown;
            pageSize?: unknown;
            search?: unknown;
            claimed?: unknown;
            status?: unknown;
          }
        | undefined,
    ) => normalizeAdminCreatorsQuery(raw ?? {}),
  )
  .handler(async ({ context, data }): Promise<AdminCreatorsPage> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { from, to } = rangeForPage(data.page, data.pageSize);

    let query = supabase
      .from("creator_profiles")
      .select(ADMIN_CREATOR_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.claimed === "claimed") query = query.not("user_id", "is", null);
    if (data.claimed === "unclaimed") query = query.is("user_id", null);
    if (data.status !== "all") {
      const pageStatusColumn: string = "page_status";
      query = query.eq(pageStatusColumn, data.status);
    }

    const searchFilter = buildSearchFilter(data.search);
    if (searchFilter !== null) query = query.or(searchFilter);

    const { data: rows, error, count } = await query;
    if (error) throw new Error("Creator directory could not be loaded.");

    const profiles = (rows ?? []) as unknown as CreatorProfileRow[];

    // Link counts for THIS PAGE only — bounded by pageSize, never a full scan.
    const ids = profiles.map((p) => p.id);
    let linkRows: { profile_id: string }[] = [];
    if (ids.length > 0) {
      const linkReadLimit = data.pageSize * ADMIN_CREATOR_LINKS_PER_PAGE_MAX;
      const { data: links, error: linkError } = await supabase
        .from("links")
        .select("profile_id")
        .in("profile_id", ids)
        .limit(linkReadLimit + 1);
      if (linkError) throw new Error("Creator link counts could not be loaded.");
      if ((links ?? []).length > linkReadLimit) {
        throw new Error("Creator link counts exceed the safe directory limit.");
      }
      linkRows = (links ?? []) as { profile_id: string }[];
    }

    return {
      rows: mapAdminCreatorPage(profiles, linkRows),
      total: count ?? null,
      page: data.page,
      pageSize: data.pageSize,
    };
  });
