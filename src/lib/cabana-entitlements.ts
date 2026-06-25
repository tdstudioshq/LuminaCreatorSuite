/**
 * CABANA entitlement rules — pure, deterministic content-access logic.
 *
 * This is the single decision function for "can this viewer see this content."
 * It is a frontend/demo projection of the production rule: in production the
 * authoritative check runs server-side against `content_entitlements`. The
 * shape here is designed to map cleanly to that server check.
 *
 * Free of React, Supabase, browser APIs, and side effects. The only clock read
 * is an explicit, injectable `now` (defaulting to Date.now()) used for
 * subscription-expiry comparison; tests always inject it for determinism.
 */

import type { ContentVisibility, CreatorSubscription } from "@/lib/cabana-types";

export type ViewerRole = "guest" | "member" | "creator" | "moderator" | "admin";

export interface EntitlementViewer {
  /** Authenticated user id, or null for a guest. */
  userId: string | null;
  role: ViewerRole;
}

export interface EntitlementContent {
  creatorProfileId: string;
  /** Owning creator's user id, used to detect creator self-access. */
  creatorUserId: string | null;
  visibility: ContentVisibility;
  priceCents?: number | null;
}

export interface ViewerSubscription {
  status: CreatorSubscription["status"];
  /** ISO string for the end of the current paid period, or null if open-ended. */
  currentPeriodEnd: string | null;
}

export interface EntitlementContext {
  /** Whether the viewer actively follows the content's creator. */
  isFollowing?: boolean;
  /** The viewer's subscription to the content's creator, if any. */
  subscription?: ViewerSubscription | null;
  /** Whether the viewer has individually purchased/unlocked this content. */
  hasPurchased?: boolean;
  /** Injectable clock (ms since epoch) for subscription-expiry checks. */
  now?: number;
}

export type EntitlementReason =
  | "public"
  | "creator_self"
  | "admin_override"
  | "moderator_override"
  | "follower"
  | "active_subscription"
  | "purchased"
  | "not_authenticated"
  | "not_following"
  | "no_subscription"
  | "subscription_expired"
  | "subscription_inactive"
  | "not_purchased";

export interface EntitlementResult {
  granted: boolean;
  reason: EntitlementReason;
}

/** Roles that may view restricted content for moderation/operations. */
export function isPrivilegedRole(role: ViewerRole): boolean {
  return role === "admin" || role === "moderator";
}

/**
 * Whether a subscription currently entitles its holder. Active or trialing
 * subscriptions grant access while their current period has not elapsed.
 * `nowMs` is explicit for determinism.
 */
export function isSubscriptionActive(
  subscription: ViewerSubscription | null | undefined,
  nowMs: number,
): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "trialing") return false;
  if (subscription.currentPeriodEnd === null) return true;
  const periodEnd = Date.parse(subscription.currentPeriodEnd);
  if (Number.isNaN(periodEnd)) return false;
  return periodEnd >= nowMs;
}

/**
 * Decide whether `viewer` may access `content`, returning the deciding reason.
 *
 * Order of precedence:
 *   1. Public content is always granted.
 *   2. The owning creator always sees their own content.
 *   3. Admins/moderators may view restricted content (operations override).
 *   4. Restricted content requires authentication.
 *   5. Visibility-specific checks (follower / subscriber / purchase).
 */
export function evaluateEntitlement(
  viewer: EntitlementViewer,
  content: EntitlementContent,
  context: EntitlementContext = {},
): EntitlementResult {
  // 1. Public content — open to everyone, no auth required.
  if (content.visibility === "public") {
    return { granted: true, reason: "public" };
  }

  // 2. Creator self-access.
  if (content.creatorUserId !== null && viewer.userId === content.creatorUserId) {
    return { granted: true, reason: "creator_self" };
  }

  // 3. Operations override for privileged roles.
  if (viewer.role === "admin") {
    return { granted: true, reason: "admin_override" };
  }
  if (viewer.role === "moderator") {
    return { granted: true, reason: "moderator_override" };
  }

  // 4. Beyond this point, content is restricted and requires authentication.
  if (viewer.userId === null || viewer.role === "guest") {
    return { granted: false, reason: "not_authenticated" };
  }

  // 5. Visibility-specific checks.
  switch (content.visibility) {
    case "followers":
      return context.isFollowing
        ? { granted: true, reason: "follower" }
        : { granted: false, reason: "not_following" };

    case "subscribers": {
      const subscription = context.subscription ?? null;
      if (!subscription) return { granted: false, reason: "no_subscription" };
      const now = context.now ?? Date.now();
      if (isSubscriptionActive(subscription, now)) {
        return { granted: true, reason: "active_subscription" };
      }
      // Distinguish "ran out of time" from "never/no longer entitled".
      if (subscription.status === "active" || subscription.status === "trialing") {
        return { granted: false, reason: "subscription_expired" };
      }
      return { granted: false, reason: "subscription_inactive" };
    }

    case "purchase":
      return context.hasPurchased
        ? { granted: true, reason: "purchased" }
        : { granted: false, reason: "not_purchased" };
  }
}

/** Convenience boolean wrapper around {@link evaluateEntitlement}. */
export function canAccessContent(
  viewer: EntitlementViewer,
  content: EntitlementContent,
  context: EntitlementContext = {},
): boolean {
  return evaluateEntitlement(viewer, content, context).granted;
}
