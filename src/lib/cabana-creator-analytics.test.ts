import { describe, expect, it } from "vitest";
import {
  ANALYTICS_RANGES,
  buildCreatorAnalytics,
  buildEngagementKpis,
  dailyWindowDays,
  engagementRatePerPost,
  engagementTotals,
  filterPostsByRange,
  postEngagementTotal,
  rangeStartMs,
  rankPosts,
  revenueDailySeries,
  revenueMonthlySeries,
  revenueTotalCents,
  seriesTrend,
  settledNetCents,
  subscriberGrowthSeries,
  subscriberStats,
  utcDayKey,
  utcMonthKey,
  type AnalyticsPost,
  type AnalyticsSubscription,
  type AnalyticsTransaction,
  type CreatorAnalyticsData,
  type SeriesPoint,
} from "@/lib/cabana-creator-analytics";

const NOW = "2026-06-27T12:00:00.000Z";

function txn(overrides: Partial<AnalyticsTransaction> = {}): AnalyticsTransaction {
  return {
    type: "tip",
    status: "succeeded",
    creatorNetCents: 1000,
    currency: "USD",
    createdAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

function sub(overrides: Partial<AnalyticsSubscription> = {}): AnalyticsSubscription {
  return {
    status: "active",
    startedAt: "2026-06-20T00:00:00.000Z",
    canceledAt: null,
    ...overrides,
  };
}

function post(overrides: Partial<AnalyticsPost> = {}): AnalyticsPost {
  return {
    postId: "p1",
    caption: "hello",
    visibility: "public",
    status: "published",
    publishedAt: "2026-06-25T00:00:00.000Z",
    createdAt: "2026-06-25T00:00:00.000Z",
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    ...overrides,
  };
}

describe("range constants + helpers", () => {
  it("exposes the four ranges", () => {
    expect(ANALYTICS_RANGES).toEqual(["7d", "30d", "90d", "all"]);
  });

  it("maps daily windows, all-time falls back to 90", () => {
    expect(dailyWindowDays("7d")).toBe(7);
    expect(dailyWindowDays("30d")).toBe(30);
    expect(dailyWindowDays("90d")).toBe(90);
    expect(dailyWindowDays("all")).toBe(90);
  });

  it("rangeStartMs is null for all-time and a UTC midnight otherwise", () => {
    const nowMs = new Date(NOW).getTime();
    expect(rangeStartMs("all", nowMs)).toBeNull();
    const start = rangeStartMs("7d", nowMs)!;
    expect(new Date(start).toISOString()).toBe("2026-06-21T00:00:00.000Z");
  });

  it("formats UTC day/month keys", () => {
    const ms = new Date("2026-03-09T15:30:00.000Z").getTime();
    expect(utcDayKey(ms)).toBe("2026-03-09");
    expect(utcMonthKey(ms)).toBe("2026-03");
  });
});

describe("settledNetCents", () => {
  it("adds succeeded inflows, subtracts refunds, ignores others", () => {
    expect(settledNetCents(txn({ creatorNetCents: 500 }))).toBe(500);
    expect(settledNetCents(txn({ type: "refund", creatorNetCents: 200 }))).toBe(-200);
    expect(settledNetCents(txn({ status: "pending", creatorNetCents: 900 }))).toBe(0);
    expect(settledNetCents(txn({ status: "failed", creatorNetCents: 900 }))).toBe(0);
  });
});

describe("revenueDailySeries", () => {
  it("buckets settled revenue into N day buckets ending today", () => {
    const series = revenueDailySeries(
      [
        txn({ createdAt: "2026-06-27T08:00:00.000Z", creatorNetCents: 300 }),
        txn({ createdAt: "2026-06-26T08:00:00.000Z", creatorNetCents: 100 }),
        txn({ createdAt: "2026-06-26T20:00:00.000Z", creatorNetCents: 50 }),
        txn({ createdAt: "2026-01-01T00:00:00.000Z", creatorNetCents: 999 }), // out of window
        txn({ createdAt: "not-a-date", creatorNetCents: 1 }),
      ],
      7,
      NOW,
    );
    expect(series).toHaveLength(7);
    expect(series[series.length - 1]).toMatchObject({ key: "2026-06-27", cents: 300 });
    expect(series[series.length - 2]).toMatchObject({ key: "2026-06-26", cents: 150 });
    expect(series[0].cents).toBe(0);
    expect(series[0].label).toMatch(/^\d{2}-\d{2}$/);
  });
});

describe("revenueMonthlySeries", () => {
  it("produces 12 month buckets with month-abbreviation labels", () => {
    const series = revenueMonthlySeries(
      [
        txn({ createdAt: "2026-06-10T00:00:00.000Z", creatorNetCents: 400 }),
        txn({ createdAt: "2026-05-10T00:00:00.000Z", creatorNetCents: 100 }),
        txn({ createdAt: "2020-01-01T00:00:00.000Z", creatorNetCents: 999 }),
      ],
      12,
      NOW,
    );
    expect(series).toHaveLength(12);
    const june = series.find((p) => p.key === "2026-06");
    expect(june).toMatchObject({ cents: 400, label: "Jun" });
    expect(series.find((p) => p.key === "2026-05")?.cents).toBe(100);
  });
});

describe("revenueTotalCents", () => {
  it("sums within range and all-time", () => {
    const txns = [
      txn({ createdAt: "2026-06-27T00:00:00.000Z", creatorNetCents: 100 }),
      txn({ createdAt: "2026-06-01T00:00:00.000Z", creatorNetCents: 200 }),
      txn({ createdAt: "2026-02-01T00:00:00.000Z", creatorNetCents: 400 }),
    ];
    expect(revenueTotalCents(txns, "7d", NOW)).toBe(100);
    expect(revenueTotalCents(txns, "30d", NOW)).toBe(300);
    expect(revenueTotalCents(txns, "all", NOW)).toBe(700);
  });
});

describe("seriesTrend", () => {
  const pt = (cents: number): SeriesPoint => ({ key: "k", label: "l", cents });

  it("is flat for short series", () => {
    expect(seriesTrend([])).toEqual({ direction: "flat", changePct: 0 });
    expect(seriesTrend([pt(5)])).toEqual({ direction: "flat", changePct: 0 });
  });

  it("computes up/down against the earlier half", () => {
    expect(seriesTrend([pt(100), pt(150)])).toMatchObject({ direction: "up", changePct: 50 });
    expect(seriesTrend([pt(100), pt(50)])).toMatchObject({ direction: "down", changePct: -50 });
    expect(seriesTrend([pt(100), pt(100)])).toEqual({ direction: "flat", changePct: 0 });
  });

  it("reads +100% / -100% / flat when the earlier half is zero", () => {
    expect(seriesTrend([pt(0), pt(10)])).toEqual({ direction: "up", changePct: 100 });
    expect(seriesTrend([pt(0), pt(-10)])).toEqual({ direction: "down", changePct: -100 });
    expect(seriesTrend([pt(0), pt(0)])).toEqual({ direction: "flat", changePct: 0 });
  });
});

describe("subscriberStats", () => {
  it("counts active, new, canceled and growth within range", () => {
    const subs = [
      sub({ status: "active", startedAt: "2026-06-25T00:00:00.000Z" }),
      sub({ status: "active", startedAt: "2026-01-01T00:00:00.000Z" }),
      sub({ status: "active", startedAt: "2026-02-01T00:00:00.000Z" }),
      sub({
        status: "canceled",
        startedAt: "2026-01-01T00:00:00.000Z",
        canceledAt: "2026-06-26T00:00:00.000Z",
      }),
    ];
    const stats = subscriberStats(subs, "7d", NOW);
    expect(stats.active).toBe(3);
    expect(stats.new).toBe(1);
    expect(stats.canceled).toBe(1);
    // prior base = active(3) - new(1) = 2 → round(1/2*100) = 50
    expect(stats.growthPct).toBe(50);
  });

  it("reads +100% growth with no prior base", () => {
    const stats = subscriberStats([sub({ startedAt: "2026-06-25T00:00:00.000Z" })], "7d", NOW);
    expect(stats.growthPct).toBe(100);
  });

  it("reads 0% growth with no new joins", () => {
    const stats = subscriberStats([sub({ startedAt: "2026-01-01T00:00:00.000Z" })], "7d", NOW);
    expect(stats.growthPct).toBe(0);
  });
});

describe("subscriberGrowthSeries", () => {
  it("is cumulative active count, respecting cancellations", () => {
    const subs = [
      sub({ startedAt: "2026-06-21T00:00:00.000Z" }),
      sub({
        startedAt: "2026-06-25T00:00:00.000Z",
        status: "canceled",
        canceledAt: "2026-06-26T00:00:00.000Z",
      }),
    ];
    const series = subscriberGrowthSeries(subs, 7, NOW);
    expect(series).toHaveLength(7);
    // 06-25: both active → 2; 06-26: one canceled → 1; 06-27: → 1
    expect(series.find((p) => p.key === "2026-06-25")?.cents).toBe(2);
    expect(series.find((p) => p.key === "2026-06-26")?.cents).toBe(1);
    expect(series.find((p) => p.key === "2026-06-21")?.cents).toBe(1);
  });
});

describe("content ranking + engagement", () => {
  const posts = [
    post({ postId: "a", likeCount: 10, commentCount: 1, saveCount: 5 }),
    post({ postId: "b", likeCount: 3, commentCount: 8, saveCount: 1 }),
    post({ postId: "c", likeCount: 0, commentCount: 0, saveCount: 9 }),
    post({ postId: "d", likeCount: 0, commentCount: 0, saveCount: 0 }),
  ];

  it("postEngagementTotal sums all three", () => {
    expect(postEngagementTotal(posts[0])).toBe(16);
  });

  it("ranks by metric, dropping zero-value posts", () => {
    expect(rankPosts(posts, "like").map((p) => p.postId)).toEqual(["a", "b"]);
    expect(rankPosts(posts, "comment").map((p) => p.postId)).toEqual(["b", "a"]);
    expect(rankPosts(posts, "save").map((p) => p.postId)).toEqual(["c", "a", "b"]);
    expect(rankPosts(posts, "total")[0].postId).toBe("a");
    expect(rankPosts(posts, "like", 1)).toHaveLength(1);
  });

  it("totals and rate per published post", () => {
    expect(engagementTotals(posts)).toEqual({ likes: 13, comments: 9, saves: 15, total: 37 });
    // 37 / 4 published = 9.25 → 9.3
    expect(engagementRatePerPost(posts)).toBe(9.3);
  });

  it("rate is zero with no published posts", () => {
    expect(engagementRatePerPost([post({ status: "draft", likeCount: 5 })])).toBe(0);
    expect(engagementRatePerPost([])).toBe(0);
  });

  it("builds four engagement KPI cards", () => {
    const kpis = buildEngagementKpis({ likes: 13, comments: 9, saves: 15, total: 37 }, 9.3);
    expect(kpis.map((k) => k.key)).toEqual(["likes", "comments", "saves", "rate"]);
    expect(kpis[0].value).toBe("13");
    expect(kpis[3].value).toBe("9.3");
  });
});

describe("filterPostsByRange", () => {
  it("keeps posts published within range, drops drafts (null publishedAt)", () => {
    const posts = [
      post({ postId: "in", publishedAt: "2026-06-25T00:00:00.000Z" }),
      post({ postId: "old", publishedAt: "2026-01-01T00:00:00.000Z" }),
      post({ postId: "draft", status: "draft", publishedAt: null }),
    ];
    expect(filterPostsByRange(posts, "7d", NOW).map((p) => p.postId)).toEqual(["in"]);
    expect(filterPostsByRange(posts, "all", NOW).map((p) => p.postId)).toEqual(["in", "old"]);
  });
});

describe("buildCreatorAnalytics", () => {
  const data: CreatorAnalyticsData = {
    currency: "USD",
    transactions: [
      txn({ createdAt: "2026-06-27T00:00:00.000Z", creatorNetCents: 500 }),
      txn({ createdAt: "2026-02-01T00:00:00.000Z", creatorNetCents: 1000 }),
    ],
    subscriptions: [sub({ startedAt: "2026-06-25T00:00:00.000Z" })],
    posts: [post({ postId: "a", likeCount: 4, commentCount: 2, saveCount: 1 })],
  };

  it("assembles every section for a range", () => {
    const view = buildCreatorAnalytics(data, "30d", NOW);
    expect(view.range).toBe("30d");
    expect(view.revenue.totalCents).toBe(500);
    expect(view.revenue.dailySeries).toHaveLength(30);
    expect(view.revenue.monthlySeries).toHaveLength(12);
    expect(view.subscribers.active).toBe(1);
    expect(view.subscribers.series).toHaveLength(30);
    expect(view.content.topByLikes[0].postId).toBe("a");
    expect(view.engagement.totals.total).toBe(7);
    expect(view.engagement.kpis).toHaveLength(4);
    expect(view.isEmpty).toBe(false);
  });

  it("all-time uses a 90-day daily window and full revenue", () => {
    const view = buildCreatorAnalytics(data, "all", NOW);
    expect(view.revenue.dailySeries).toHaveLength(90);
    expect(view.revenue.totalCents).toBe(1500);
  });

  it("reports empty with no data", () => {
    const view = buildCreatorAnalytics(
      { currency: "USD", transactions: [], subscriptions: [], posts: [] },
      "7d",
      NOW,
    );
    expect(view.isEmpty).toBe(true);
  });
});
