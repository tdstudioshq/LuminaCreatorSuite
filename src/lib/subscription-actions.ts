// ============================================================================
// CABANA — protected creator-subscription server actions (Phase 4, DEMO-ONLY)
// ----------------------------------------------------------------------------
// Tier management + (mock) subscribe/cancel + subscription state. No real money
// moves: subscriptions are created by SECURITY DEFINER RPCs that copy the price
// from a creator tier and stamp a `mock_*` reference. Writes use
// `requireSupabaseAuth`; public reads use `optionalSupabaseAuth`. No service
// role. Must stay outside any `**/server/**` path.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { optionalSupabaseAuth } from "@/integrations/supabase/optional-auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  type SubscriptionState,
  type SubscriptionTier,
  mapSubscriptionState,
  mapTier,
  normalizeTierDraft,
} from "@/lib/cabana-subscriptions";

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID.test(raw)) throw new Error(`A valid ${label} is required.`);
  return raw.toLowerCase();
}

function handle(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "")
    throw new Error("Creator username is required.");
  return raw.trim().toLowerCase();
}

async function requireCreatorProfileId(supabase: Db, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only creators can manage subscription tiers.");
  return data.id;
}

// ─────────────────────────────── Tier management ────────────────────────────

export const upsertTier = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(
    (raw: { tierId?: unknown; name?: unknown; priceCents?: unknown; currency?: unknown }) => ({
      tierId: raw?.tierId == null ? null : uuid(raw.tierId, "tier id"),
      draft: normalizeTierDraft(raw ?? {}),
    }),
  )
  .handler(async ({ context, data }): Promise<SubscriptionTier> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    if (data.tierId) {
      const { data: row, error } = await supabase
        .from("creator_subscription_tiers")
        .update({
          name: data.draft.name,
          price_cents: data.draft.priceCents,
          currency: data.draft.currency,
        })
        .eq("id", data.tierId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapTier(row);
    }
    const { data: row, error } = await supabase
      .from("creator_subscription_tiers")
      .insert({
        creator_profile_id: creatorProfileId,
        name: data.draft.name,
        price_cents: data.draft.priceCents,
        currency: data.draft.currency,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapTier(row);
  });

export const setTierActive = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { tierId?: unknown; isActive?: unknown }) => ({
    tierId: uuid(raw?.tierId, "tier id"),
    isActive: raw?.isActive === true,
  }))
  .handler(async ({ context, data }): Promise<SubscriptionTier> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("creator_subscription_tiers")
      .update({ is_active: data.isActive })
      .eq("id", data.tierId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapTier(row);
  });

/** The calling creator's own tiers (all statuses). */
export const getMyTiers = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionTier[]> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    const { data, error } = await supabase
      .from("creator_subscription_tiers")
      .select("*")
      .eq("creator_profile_id", creatorProfileId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTier);
  });

/** A creator's public ACTIVE tiers, by username (guest-callable). */
export const getCreatorTiers = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { username?: unknown }) => ({ username: handle(raw?.username) }))
  .handler(async ({ context, data }): Promise<SubscriptionTier[]> => {
    const supabase = context.supabase as Db;
    const { data: creator, error: cErr } = await supabase
      .from("creator_profiles")
      .select("id")
      .ilike("handle", data.username)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!creator) return [];
    const { data: tiers, error } = await supabase
      .from("creator_subscription_tiers")
      .select("*")
      .eq("creator_profile_id", creator.id)
      .eq("is_active", true)
      .order("price_cents", { ascending: true });
    if (error) throw new Error(error.message);
    return (tiers ?? []).map(mapTier);
  });

// ─────────────────────────────── Subscribe / cancel ─────────────────────────

export const subscribeToCreator = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { username?: unknown; tierId?: unknown }) => ({
    username: handle(raw?.username),
    tierId: uuid(raw?.tierId, "tier id"),
  }))
  .handler(async ({ context, data }): Promise<SubscriptionState> => {
    const { supabase } = context;
    const { error } = await supabase.rpc("subscribe_to_creator", {
      _username: data.username,
      _tier_id: data.tierId,
    });
    if (error) throw new Error(error.message);
    return readSubscriptionState(supabase, data.username);
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { username?: unknown }) => ({ username: handle(raw?.username) }))
  .handler(async ({ context, data }): Promise<SubscriptionState> => {
    const { supabase } = context;
    const { error } = await supabase.rpc("cancel_creator_subscription", {
      _username: data.username,
    });
    if (error) throw new Error(error.message);
    return readSubscriptionState(supabase, data.username);
  });

async function readSubscriptionState(supabase: Db, username: string): Promise<SubscriptionState> {
  const { data, error } = await supabase.rpc("creator_subscription_state", { _username: username });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) throw new Error("Creator not found.");
  return mapSubscriptionState(row);
}

export const getSubscriptionState = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { username?: unknown }) => ({ username: handle(raw?.username) }))
  .handler(async ({ context, data }): Promise<SubscriptionState> => {
    return readSubscriptionState(context.supabase as Db, data.username);
  });

// ─────────────────────────────── Lists ──────────────────────────────────────

export type SubscriberSummary = {
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  tierName: string | null;
  priceCents: number;
  currency: string;
  since: string;
};

/** The calling creator's active subscribers (safe identity). */
export const getCreatorSubscribers = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriberSummary[]> => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("creator_subscribers_list", { _limit: 50 });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      username: r.member_username ?? null,
      displayName: r.member_display_name ?? r.member_username ?? "Member",
      avatarUrl: r.member_avatar_url ?? null,
      tierName: r.tier_name ?? null,
      priceCents: r.price_cents,
      currency: r.currency,
      since: r.since,
    }));
  });
