// ============================================================================
// CABANA — creator-subscription domain layer (PURE, DEMO-ONLY)
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. Validation and
// mapping for the Phase 4 fan-subscription slice. All money is integer cents and
// strictly demo — there is no payment provider. Active-subscription evaluation
// reuses `isSubscriptionActive` from `cabana-entitlements` (the single source of
// truth for the access rule).
// ============================================================================
import type { Database } from "@/integrations/supabase/types";
import { isSubscriptionActive } from "@/lib/cabana-entitlements";

export type CreatorSubscriptionStatus = Database["public"]["Enums"]["creator_subscription_status"];

type TierRow = Database["public"]["Tables"]["creator_subscription_tiers"]["Row"];

export const TIER_NAME_MAX = 60;
export const TIER_PRICE_CENTS_MAX = 100_000_000;

// ─────────────────────────────── Domain types ───────────────────────────────

export type SubscriptionTier = {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  isActive: boolean;
};

export type SubscriptionState = {
  username: string;
  subscribed: boolean;
  status: CreatorSubscriptionStatus | null;
  tierName: string | null;
  priceCents: number | null;
  currency: string | null;
  currentPeriodEnd: string | null;
  isSelf: boolean;
};

export type TierDraft = { name: string; priceCents: number; currency: string };

// ─────────────────────────────── Validation ─────────────────────────────────

export function normalizeTierName(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Tier name must be text.");
  const name = raw.trim();
  if (name.length < 1) throw new Error("Tier name cannot be empty.");
  if (name.length > TIER_NAME_MAX) {
    throw new Error(`Tier name must be ${TIER_NAME_MAX} characters or fewer.`);
  }
  return name;
}

/** Validate a demo price in integer cents (no fractional cents, non-negative). */
export function normalizeTierPriceCents(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new Error("Price must be a whole number of cents.");
  }
  if (raw < 0) throw new Error("Price cannot be negative.");
  if (raw > TIER_PRICE_CENTS_MAX) throw new Error("Price is too large.");
  return raw;
}

export function normalizeCurrency(raw: unknown): string {
  if (raw == null || raw === "") return "USD";
  if (typeof raw !== "string" || !/^[A-Za-z]{3}$/.test(raw)) {
    throw new Error("Currency must be a 3-letter code.");
  }
  return raw.toUpperCase();
}

export function normalizeTierDraft(input: {
  name?: unknown;
  priceCents?: unknown;
  currency?: unknown;
}): TierDraft {
  return {
    name: normalizeTierName(input.name),
    priceCents: normalizeTierPriceCents(input.priceCents),
    currency: normalizeCurrency(input.currency),
  };
}

// ─────────────────────────────── State helpers ──────────────────────────────

/** Whether a state currently entitles the viewer (status + period via shared rule). */
export function isStateEntitled(state: SubscriptionState, nowMs: number = Date.now()): boolean {
  if (!state.subscribed || state.status === null) return false;
  return isSubscriptionActive(
    { status: state.status, currentPeriodEnd: state.currentPeriodEnd },
    nowMs,
  );
}

/** Whether the viewer may subscribe (not themselves, not already subscribed). */
export function canSubscribe(state: SubscriptionState): boolean {
  return !state.isSelf && !state.subscribed;
}

// ─────────────────────────────── Mappers ────────────────────────────────────

export function mapTier(row: TierRow): SubscriptionTier {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    currency: row.currency,
    isActive: row.is_active,
  };
}

type RawStateRow = {
  username: string;
  subscribed?: unknown;
  status?: CreatorSubscriptionStatus | null;
  tier_name?: string | null;
  price_cents?: number | null;
  currency?: string | null;
  current_period_end?: string | null;
  is_self?: unknown;
};

export function mapSubscriptionState(row: RawStateRow): SubscriptionState {
  return {
    username: row.username,
    subscribed: row.subscribed === true,
    status: row.status ?? null,
    tierName: row.tier_name ?? null,
    priceCents: typeof row.price_cents === "number" ? row.price_cents : null,
    currency: row.currency ?? null,
    currentPeriodEnd: row.current_period_end ?? null,
    isSelf: row.is_self === true,
  };
}
