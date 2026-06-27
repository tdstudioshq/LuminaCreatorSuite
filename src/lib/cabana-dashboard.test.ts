import { describe, expect, it } from "vitest";
import type { CreatorBalanceProjection } from "@/lib/cabana-money";
import type { NotificationItem } from "@/lib/cabana-notifications";
import {
  buildCreatorDashboard,
  buildKpiCards,
  buildRecentActivity,
  buildRecentEarnings,
  isWithinCurrentMonth,
  monthlyRevenueCents,
  summarizePendingPayouts,
  summarizeSubscribers,
  type CreatorDashboardData,
  type DashboardPayout,
  type DashboardRecentSubscriber,
  type DashboardSubscriberRow,
  type DashboardTransaction,
} from "@/lib/cabana-dashboard";

const NOW = "2026-06-27T12:00:00.000Z";

function txn(overrides: Partial<DashboardTransaction> = {}): DashboardTransaction {
  return {
    id: "t1",
    type: "tip",
    status: "succeeded",
    grossCents: 1000,
    creatorNetCents: 870,
    currency: "USD",
    createdAt: "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

function payout(overrides: Partial<DashboardPayout> = {}): DashboardPayout {
  return {
    id: "p1",
    amountCents: 5000,
    currency: "USD",
    status: "processing",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function subRow(overrides: Partial<DashboardSubscriberRow> = {}): DashboardSubscriberRow {
  return { status: "active", startedAt: "2026-06-05T00:00:00.000Z", ...overrides };
}

function recentSub(overrides: Partial<DashboardRecentSubscriber> = {}): DashboardRecentSubscriber {
  return {
    displayName: "Member",
    avatarUrl: null,
    tierName: "Gold",
    priceCents: 999,
    currency: "USD",
    since: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

function notif(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "n1",
    type: "new_subscriber",
    title: "Someone subscribed to you",
    body: null,
    entityType: null,
    entityId: null,
    actorId: null,
    isRead: false,
    createdAt: "2026-06-26T00:00:00.000Z",
    ...overrides,
  };
}

function balance(overrides: Partial<CreatorBalanceProjection> = {}): CreatorBalanceProjection {
  return {
    currency: "USD",
    pendingCents: 0,
    availableCents: 0,
    lifetimeGrossCents: 0,
    lifetimeFeesCents: 0,
    lifetimeNetCents: 0,
    lifetimePaidOutCents: 0,
    ...overrides,
  };
}

describe("isWithinCurrentMonth", () => {
  it("is true within the same UTC month", () => {
    expect(isWithinCurrentMonth("2026-06-01T00:00:00.000Z", NOW)).toBe(true);
    expect(isWithinCurrentMonth("2026-06-30T23:59:59.000Z", NOW)).toBe(true);
  });

  it("is false in a different month or year", () => {
    expect(isWithinCurrentMonth("2026-05-31T23:59:59.000Z", NOW)).toBe(false);
    expect(isWithinCurrentMonth("2025-06-15T00:00:00.000Z", NOW)).toBe(false);
  });

  it("is false for unparseable timestamps", () => {
    expect(isWithinCurrentMonth("not-a-date", NOW)).toBe(false);
    expect(isWithinCurrentMonth(NOW, "not-a-date")).toBe(false);
  });
});

describe("monthlyRevenueCents", () => {
  it("sums succeeded non-refund creator net within the month", () => {
    const result = monthlyRevenueCents(
      [txn({ creatorNetCents: 100 }), txn({ id: "t2", creatorNetCents: 200 })],
      NOW,
    );
    expect(result).toBe(300);
  });

  it("subtracts refunds", () => {
    const result = monthlyRevenueCents(
      [txn({ creatorNetCents: 500 }), txn({ id: "t2", type: "refund", creatorNetCents: 200 })],
      NOW,
    );
    expect(result).toBe(300);
  });

  it("ignores non-succeeded and out-of-month rows", () => {
    const result = monthlyRevenueCents(
      [
        txn({ status: "pending", creatorNetCents: 999 }),
        txn({ id: "t2", createdAt: "2026-05-10T00:00:00.000Z", creatorNetCents: 999 }),
        txn({ id: "t3", creatorNetCents: 50 }),
      ],
      NOW,
    );
    expect(result).toBe(50);
  });
});

describe("summarizePendingPayouts", () => {
  it("counts only queued/processing payouts", () => {
    const result = summarizePendingPayouts([
      payout({ status: "queued", amountCents: 1000 }),
      payout({ id: "p2", status: "processing", amountCents: 2000 }),
      payout({ id: "p3", status: "paid", amountCents: 4000 }),
      payout({ id: "p4", status: "failed", amountCents: 100 }),
      payout({ id: "p5", status: "canceled", amountCents: 100 }),
    ]);
    expect(result).toEqual({ totalCents: 3000, count: 2 });
  });

  it("is zero with no reserved payouts", () => {
    expect(summarizePendingPayouts([])).toEqual({ totalCents: 0, count: 0 });
  });
});

describe("buildRecentEarnings", () => {
  it("keeps succeeded non-refund inflows and labels them", () => {
    const result = buildRecentEarnings([
      txn({ id: "a", type: "tip", creatorNetCents: 100 }),
      txn({ id: "b", type: "refund", creatorNetCents: 50 }),
      txn({ id: "c", status: "pending", creatorNetCents: 70 }),
      txn({ id: "d", type: "post_unlock", creatorNetCents: 900 }),
    ]);
    expect(result.map((e) => e.id)).toEqual(["a", "d"]);
    expect(result[0]).toMatchObject({ label: "Tip", amountCents: 100, currency: "USD" });
    expect(typeof result[1].label).toBe("string");
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => txn({ id: `t${i}` }));
    expect(buildRecentEarnings(many, 3)).toHaveLength(3);
  });
});

describe("summarizeSubscribers", () => {
  it("counts active, total and new-this-month", () => {
    const result = summarizeSubscribers(
      [
        subRow({ startedAt: "2026-06-05T00:00:00.000Z" }),
        subRow({ startedAt: "2026-06-20T00:00:00.000Z" }),
        subRow({ startedAt: "2026-01-01T00:00:00.000Z" }),
        subRow({ status: "canceled", startedAt: "2026-06-02T00:00:00.000Z" }),
      ],
      [],
      NOW,
    );
    expect(result.active).toBe(3);
    expect(result.total).toBe(4);
    expect(result.newThisMonth).toBe(2);
  });

  it("computes growth against the prior base", () => {
    // active 4, new 1 → prior base 3 → round(1/3*100) = 33
    const rows = [
      subRow({ startedAt: "2026-06-10T00:00:00.000Z" }),
      subRow({ startedAt: "2026-02-01T00:00:00.000Z" }),
      subRow({ startedAt: "2026-02-01T00:00:00.000Z" }),
      subRow({ startedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    expect(summarizeSubscribers(rows, [], NOW).growthPct).toBe(33);
  });

  it("shows +100% growth when there is no prior base", () => {
    const result = summarizeSubscribers([subRow()], [], NOW);
    expect(result.growthPct).toBe(100);
  });

  it("shows 0% growth when there are no new subs", () => {
    const result = summarizeSubscribers(
      [subRow({ startedAt: "2026-01-01T00:00:00.000Z" })],
      [],
      NOW,
    );
    expect(result.growthPct).toBe(0);
  });

  it("maps and limits recent joins", () => {
    const recent = Array.from({ length: 8 }, (_, i) => recentSub({ displayName: `M${i}` }));
    const result = summarizeSubscribers([], recent, NOW);
    expect(result.recentJoins).toHaveLength(5);
    expect(result.recentJoins[0]).toMatchObject({
      displayName: "M0",
      tierName: "Gold",
      priceCents: 999,
      avatarUrl: null,
    });
  });
});

describe("buildRecentActivity", () => {
  it("resolves links and maps fields", () => {
    const result = buildRecentActivity([
      notif({ id: "a", type: "new_subscriber" }),
      notif({
        id: "b",
        type: "post_liked",
        entityType: "post",
        entityId: "11111111-1111-1111-1111-111111111111",
      }),
      notif({ id: "c", type: "system" }),
    ]);
    expect(result[0].href).toBe("/dashboard/subscribers");
    expect(result[1].href).toBe("/post/11111111-1111-1111-1111-111111111111");
    expect(result[2].href).toBeNull();
    expect(result[0]).toMatchObject({ id: "a", isRead: false });
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => notif({ id: `n${i}` }));
    expect(buildRecentActivity(many, 4)).toHaveLength(4);
  });
});

describe("buildKpiCards", () => {
  const kpis = {
    currency: "USD",
    totalRevenueCents: 12345,
    monthlyRevenueCents: 5000,
    availableBalanceCents: 4000,
    pendingPayoutsCents: 2000,
    pendingPayoutsCount: 1,
    activeSubscribers: 3,
    totalSubscribers: 5,
    newSubscribers: 2,
  };

  it("renders seven cards with formatted money and counts", () => {
    const subs = summarizeSubscribers([], [], NOW);
    const cards = buildKpiCards(kpis, { ...subs, newThisMonth: 2, growthPct: 40 });
    expect(cards).toHaveLength(7);
    expect(cards[0]).toMatchObject({ key: "total-revenue", value: "$123.45" });
    expect(cards.find((c) => c.key === "active-subscribers")?.value).toBe("3");
    expect(cards.find((c) => c.key === "pending-payouts")?.hint).toBe("1 request in progress");
    expect(cards.find((c) => c.key === "active-subscribers")?.hint).toBe("+40% this month");
  });

  it("pluralizes payout requests and shows no-change hint", () => {
    const subs = { active: 0, total: 0, newThisMonth: 0, growthPct: 0, recentJoins: [] };
    const cards = buildKpiCards(
      {
        ...kpis,
        monthlyRevenueCents: 0,
        availableBalanceCents: 0,
        pendingPayoutsCents: 0,
        pendingPayoutsCount: 0,
        activeSubscribers: 0,
        newSubscribers: 0,
      },
      subs,
    );
    expect(cards.find((c) => c.key === "pending-payouts")?.hint).toBe("0 requests in progress");
    expect(cards.find((c) => c.key === "active-subscribers")?.hint).toBe("No change this month");
    expect(cards.find((c) => c.key === "monthly-revenue")?.tone).toBe("neutral");
    expect(cards.find((c) => c.key === "pending-payouts")?.tone).toBe("neutral");
  });
});

describe("buildCreatorDashboard", () => {
  it("assembles the full view model", () => {
    const data: CreatorDashboardData = {
      balance: balance({
        availableCents: 4000,
        pendingCents: 100,
        lifetimeGrossCents: 20000,
        lifetimeNetCents: 17000,
        lifetimePaidOutCents: 3000,
      }),
      transactions: [txn({ creatorNetCents: 500 })],
      payouts: [payout({ status: "processing", amountCents: 2000 })],
      subscriberRows: [subRow(), subRow({ status: "canceled" })],
      recentSubscribers: [recentSub()],
      notifications: [notif()],
    };
    const view = buildCreatorDashboard(data, NOW);
    expect(view.kpis.totalRevenueCents).toBe(17000);
    expect(view.kpis.monthlyRevenueCents).toBe(500);
    expect(view.kpis.availableBalanceCents).toBe(4000);
    expect(view.kpis.pendingPayoutsCents).toBe(2000);
    expect(view.kpis.activeSubscribers).toBe(1);
    expect(view.kpis.totalSubscribers).toBe(2);
    expect(view.revenue.recentEarnings).toHaveLength(1);
    expect(view.recentActivity).toHaveLength(1);
    expect(view.kpiCards).toHaveLength(7);
    expect(view.isEmpty).toBe(false);
  });

  it("reports empty when there is no ledger, subs, or activity", () => {
    const view = buildCreatorDashboard(
      {
        balance: balance(),
        transactions: [],
        payouts: [],
        subscriberRows: [],
        recentSubscribers: [],
        notifications: [],
      },
      NOW,
    );
    expect(view.isEmpty).toBe(true);
  });
});
