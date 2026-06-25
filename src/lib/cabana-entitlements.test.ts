import { describe, expect, it } from "vitest";
import {
  canAccessContent,
  evaluateEntitlement,
  isPrivilegedRole,
  isSubscriptionActive,
} from "@/lib/cabana-entitlements";
import {
  isoFromNow,
  makeContent,
  makeContext,
  makeSubscription,
  makeViewer,
  TEST_NOW,
} from "@/test/factories";

describe("isPrivilegedRole", () => {
  it("is true only for admin and moderator", () => {
    expect(isPrivilegedRole("admin")).toBe(true);
    expect(isPrivilegedRole("moderator")).toBe(true);
    expect(isPrivilegedRole("creator")).toBe(false);
    expect(isPrivilegedRole("member")).toBe(false);
    expect(isPrivilegedRole("guest")).toBe(false);
  });
});

describe("isSubscriptionActive", () => {
  it("grants for active/trialing within the period", () => {
    expect(isSubscriptionActive(makeSubscription({ status: "active" }), TEST_NOW)).toBe(true);
    expect(isSubscriptionActive(makeSubscription({ status: "trialing" }), TEST_NOW)).toBe(true);
  });

  it("grants open-ended (null period end) active subscriptions", () => {
    expect(isSubscriptionActive(makeSubscription({ currentPeriodEnd: null }), TEST_NOW)).toBe(true);
  });

  it("denies when the period has elapsed", () => {
    expect(
      isSubscriptionActive(makeSubscription({ currentPeriodEnd: isoFromNow(-1) }), TEST_NOW),
    ).toBe(false);
  });

  it("denies non-active statuses", () => {
    for (const status of ["past_due", "canceled", "expired"] as const) {
      expect(isSubscriptionActive(makeSubscription({ status }), TEST_NOW)).toBe(false);
    }
  });

  it("denies null/undefined and unparseable period end", () => {
    expect(isSubscriptionActive(null, TEST_NOW)).toBe(false);
    expect(isSubscriptionActive(undefined, TEST_NOW)).toBe(false);
    expect(
      isSubscriptionActive(makeSubscription({ currentPeriodEnd: "not-a-date" }), TEST_NOW),
    ).toBe(false);
  });
});

describe("public content", () => {
  it("is granted to everyone, including guests", () => {
    const result = evaluateEntitlement(makeViewer("guest"), makeContent("public"), makeContext());
    expect(result).toEqual({ granted: true, reason: "public" });
  });
});

describe("creator self-access", () => {
  it("grants the owning creator access to their own restricted content", () => {
    const viewer = makeViewer("creator", "creator-user-1");
    const content = makeContent("subscribers", { creatorUserId: "creator-user-1" });
    expect(evaluateEntitlement(viewer, content, makeContext())).toEqual({
      granted: true,
      reason: "creator_self",
    });
  });

  it("does not treat a different creator as the owner", () => {
    const viewer = makeViewer("creator", "creator-user-2");
    const content = makeContent("subscribers", { creatorUserId: "creator-user-1" });
    const result = evaluateEntitlement(viewer, content, makeContext());
    expect(result.reason).not.toBe("creator_self");
  });

  it("never matches a null creatorUserId", () => {
    const viewer = makeViewer("member", null);
    const content = makeContent("followers", { creatorUserId: null });
    const result = evaluateEntitlement(viewer, content, makeContext());
    expect(result.reason).toBe("not_authenticated");
  });
});

describe("privileged overrides", () => {
  it("grants admins access to restricted content", () => {
    const result = evaluateEntitlement(
      makeViewer("admin"),
      makeContent("subscribers"),
      makeContext(),
    );
    expect(result).toEqual({ granted: true, reason: "admin_override" });
  });

  it("grants moderators access to restricted content", () => {
    const result = evaluateEntitlement(
      makeViewer("moderator"),
      makeContent("purchase"),
      makeContext(),
    );
    expect(result).toEqual({ granted: true, reason: "moderator_override" });
  });
});

describe("unauthenticated access to restricted content", () => {
  it("denies guests", () => {
    for (const visibility of ["followers", "subscribers", "purchase"] as const) {
      const result = evaluateEntitlement(
        makeViewer("guest"),
        makeContent(visibility),
        makeContext(),
      );
      expect(result).toEqual({ granted: false, reason: "not_authenticated" });
    }
  });

  it("denies members with a null user id", () => {
    const result = evaluateEntitlement(
      { role: "member", userId: null },
      makeContent("followers"),
      makeContext(),
    );
    expect(result.reason).toBe("not_authenticated");
  });
});

describe("followers-only content", () => {
  it("grants a following member", () => {
    const result = evaluateEntitlement(
      makeViewer("member"),
      makeContent("followers"),
      makeContext({ isFollowing: true }),
    );
    expect(result).toEqual({ granted: true, reason: "follower" });
  });

  it("denies a non-following member", () => {
    const result = evaluateEntitlement(
      makeViewer("member"),
      makeContent("followers"),
      makeContext({ isFollowing: false }),
    );
    expect(result).toEqual({ granted: false, reason: "not_following" });
  });
});

describe("subscribers-only content", () => {
  it("grants an active subscriber", () => {
    const result = evaluateEntitlement(
      makeViewer("member"),
      makeContent("subscribers"),
      makeContext({ subscription: makeSubscription({ status: "active" }) }),
    );
    expect(result).toEqual({ granted: true, reason: "active_subscription" });
  });

  it("denies a member with no subscription", () => {
    const result = evaluateEntitlement(
      makeViewer("member"),
      makeContent("subscribers"),
      makeContext({ subscription: null }),
    );
    expect(result).toEqual({ granted: false, reason: "no_subscription" });
  });

  it("reports an expired active subscription distinctly", () => {
    const result = evaluateEntitlement(
      makeViewer("member"),
      makeContent("subscribers"),
      makeContext({
        subscription: makeSubscription({ status: "active", currentPeriodEnd: isoFromNow(-2) }),
      }),
    );
    expect(result).toEqual({ granted: false, reason: "subscription_expired" });
  });

  it("reports a canceled/inactive subscription distinctly", () => {
    const result = evaluateEntitlement(
      makeViewer("member"),
      makeContent("subscribers"),
      makeContext({ subscription: makeSubscription({ status: "canceled" }) }),
    );
    expect(result).toEqual({ granted: false, reason: "subscription_inactive" });
  });

  it("uses Date.now() when no clock is injected (future period grants)", () => {
    // Year 3000 is always in the future relative to the real clock.
    const result = evaluateEntitlement(makeViewer("member"), makeContent("subscribers"), {
      subscription: makeSubscription({ currentPeriodEnd: "3000-01-01T00:00:00.000Z" }),
    });
    expect(result.granted).toBe(true);
  });

  it("uses Date.now() when no clock is injected (past period expires)", () => {
    // 1970 is always in the past relative to the real clock.
    const result = evaluateEntitlement(makeViewer("member"), makeContent("subscribers"), {
      subscription: makeSubscription({ currentPeriodEnd: "1970-01-01T00:00:00.000Z" }),
    });
    expect(result).toEqual({ granted: false, reason: "subscription_expired" });
  });
});

describe("purchase-locked content", () => {
  it("grants a member who purchased", () => {
    const result = evaluateEntitlement(
      makeViewer("member"),
      makeContent("purchase"),
      makeContext({ hasPurchased: true }),
    );
    expect(result).toEqual({ granted: true, reason: "purchased" });
  });

  it("denies a member who has not purchased", () => {
    const result = evaluateEntitlement(
      makeViewer("member"),
      makeContent("purchase"),
      makeContext({ hasPurchased: false }),
    );
    expect(result).toEqual({ granted: false, reason: "not_purchased" });
  });
});

describe("canAccessContent", () => {
  it("returns the boolean of evaluateEntitlement", () => {
    expect(canAccessContent(makeViewer("guest"), makeContent("public"))).toBe(true);
    expect(canAccessContent(makeViewer("member"), makeContent("subscribers"), makeContext())).toBe(
      false,
    );
  });
});
