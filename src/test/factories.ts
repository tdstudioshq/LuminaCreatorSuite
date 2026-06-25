/**
 * Reusable test factories. Deterministic builders for the pure business-logic
 * suites so individual tests stay focused on the field under assertion.
 */
import type {
  EntitlementContent,
  EntitlementContext,
  EntitlementViewer,
  ViewerRole,
  ViewerSubscription,
} from "@/lib/cabana-entitlements";
import type { LedgerPayout, LedgerTransaction } from "@/lib/cabana-money";
import type { ContentVisibility } from "@/lib/cabana-types";

/** A fixed reference clock so subscription-expiry tests are deterministic. */
export const TEST_NOW = Date.parse("2026-06-25T12:00:00.000Z");
export const DAY_MS = 86_400_000;

/** ISO string `days` from TEST_NOW (negative = past, positive = future). */
export function isoFromNow(days: number): string {
  return new Date(TEST_NOW + days * DAY_MS).toISOString();
}

export function makeViewer(
  role: ViewerRole,
  userId: string | null = "viewer-1",
): EntitlementViewer {
  return { role, userId: role === "guest" ? null : userId };
}

export function makeContent(
  visibility: ContentVisibility,
  overrides: Partial<EntitlementContent> = {},
): EntitlementContent {
  return {
    creatorProfileId: "creator-profile-1",
    creatorUserId: "creator-user-1",
    visibility,
    priceCents: visibility === "purchase" ? 900 : null,
    ...overrides,
  };
}

export function makeSubscription(overrides: Partial<ViewerSubscription> = {}): ViewerSubscription {
  return {
    status: "active",
    currentPeriodEnd: isoFromNow(15),
    ...overrides,
  };
}

export function makeContext(overrides: Partial<EntitlementContext> = {}): EntitlementContext {
  return { now: TEST_NOW, ...overrides };
}

export function makeTransaction(overrides: Partial<LedgerTransaction> = {}): LedgerTransaction {
  return {
    type: "creator_subscription",
    status: "succeeded",
    grossCents: 1900,
    platformFeeCents: 190,
    processorFeeCents: 57,
    creatorNetCents: 1653,
    ...overrides,
  };
}

export function makePayout(overrides: Partial<LedgerPayout> = {}): LedgerPayout {
  return { status: "paid", amountCents: 1000, ...overrides };
}
