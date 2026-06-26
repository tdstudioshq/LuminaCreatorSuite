import { describe, expect, it } from "vitest";
import {
  type AdminPayout,
  type AdminTransaction,
  type CreatorEarning,
  creatorLabel,
  filterTransactions,
  formatCents,
  payoutStatusBucket,
  payoutStatusLabel,
  rollupPayouts,
  sortCreatorEarnings,
  summarizeRevenue,
  totalCreatorAvailable,
  transactionsToCsv,
  transactionStatusLabel,
  transactionTypeLabel,
} from "@/lib/cabana-finance";

function txn(overrides: Partial<AdminTransaction> = {}): AdminTransaction {
  return {
    id: "t1",
    type: "creator_subscription",
    status: "succeeded",
    grossCents: 1000,
    platformFeeCents: 100,
    processorFeeCents: 30,
    creatorNetCents: 870,
    currency: "USD",
    referenceType: "subscription",
    referenceId: "ref1",
    payerUserId: "payer1",
    creatorProfileId: "c1",
    creatorHandle: "aurora",
    creatorDisplayName: "Aurora Rose",
    mockProviderReference: "mock_abc",
    createdAt: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

function payout(overrides: Partial<AdminPayout> = {}): AdminPayout {
  return {
    id: "p1",
    creatorProfileId: "c1",
    creatorHandle: "aurora",
    creatorDisplayName: "Aurora Rose",
    amountCents: 5000,
    currency: "USD",
    status: "processing",
    requestedAt: "2026-06-25T12:00:00.000Z",
    paidAt: null,
    failureReason: null,
    createdAt: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

function earning(overrides: Partial<CreatorEarning> = {}): CreatorEarning {
  return {
    creatorProfileId: "c1",
    creatorHandle: "aurora",
    creatorDisplayName: "Aurora Rose",
    currency: "USD",
    pendingCents: 0,
    availableCents: 1000,
    lifetimeGrossCents: 5000,
    lifetimeFeesCents: 650,
    lifetimeNetCents: 4350,
    lifetimePaidOutCents: 1000,
    ...overrides,
  };
}

describe("summarizeRevenue", () => {
  it("sums settled money, subtracts refunds, counts pending separately", () => {
    const totals = summarizeRevenue([
      txn({ id: "a" }),
      txn({
        id: "b",
        grossCents: 2000,
        platformFeeCents: 200,
        processorFeeCents: 60,
        creatorNetCents: 1740,
      }),
      // a refund reverses (amounts are stored non-negative)
      txn({
        id: "r",
        type: "refund",
        grossCents: 1000,
        platformFeeCents: 100,
        processorFeeCents: 30,
        creatorNetCents: 870,
      }),
      // pending: counted but not summed
      txn({ id: "p", status: "pending" }),
      // failed: ignored entirely
      txn({ id: "f", status: "failed" }),
    ]);
    expect(totals.grossCents).toBe(2000); // 1000 + 2000 - 1000
    expect(totals.platformFeeCents).toBe(200); // 100 + 200 - 100
    expect(totals.processorFeeCents).toBe(60); // 30 + 60 - 30
    expect(totals.creatorNetCents).toBe(1740); // 870 + 1740 - 870
    expect(totals.settledCount).toBe(3); // a, b, r
    expect(totals.refundCount).toBe(1);
    expect(totals.pendingCount).toBe(1);
  });
  it("handles an empty ledger", () => {
    expect(summarizeRevenue([])).toEqual({
      grossCents: 0,
      platformFeeCents: 0,
      processorFeeCents: 0,
      creatorNetCents: 0,
      settledCount: 0,
      refundCount: 0,
      pendingCount: 0,
    });
  });
});

describe("payout rollups", () => {
  it("maps statuses to buckets", () => {
    expect(payoutStatusBucket("paid")).toBe("completed");
    expect(payoutStatusBucket("failed")).toBe("failed");
    expect(payoutStatusBucket("canceled")).toBe("failed");
    expect(payoutStatusBucket("queued")).toBe("pending");
    expect(payoutStatusBucket("processing")).toBe("pending");
  });
  it("rolls payouts into pending/completed/failed + per-status", () => {
    const r = rollupPayouts([
      payout({ status: "queued", amountCents: 100 }),
      payout({ status: "processing", amountCents: 200 }),
      payout({ status: "paid", amountCents: 300 }),
      payout({ status: "failed", amountCents: 400 }),
      payout({ status: "canceled", amountCents: 500 }),
    ]);
    expect(r.pending).toEqual({ count: 2, amountCents: 300 });
    expect(r.completed).toEqual({ count: 1, amountCents: 300 });
    expect(r.failed).toEqual({ count: 2, amountCents: 900 });
    expect(r.byStatus.queued).toEqual({ count: 1, amountCents: 100 });
    expect(r.byStatus.paid).toEqual({ count: 1, amountCents: 300 });
    expect(r.byStatus.canceled).toEqual({ count: 1, amountCents: 500 });
  });
  it("rolls up an empty list", () => {
    const r = rollupPayouts([]);
    expect(r.pending.count).toBe(0);
    expect(r.byStatus.processing).toEqual({ count: 0, amountCents: 0 });
  });
});

describe("creator earnings", () => {
  it("sorts by lifetime net desc without mutating input", () => {
    const input = [
      earning({ creatorProfileId: "a", lifetimeNetCents: 100 }),
      earning({ creatorProfileId: "b", lifetimeNetCents: 900 }),
      earning({ creatorProfileId: "c", lifetimeNetCents: 500 }),
    ];
    const sorted = sortCreatorEarnings(input);
    expect(sorted.map((e) => e.creatorProfileId)).toEqual(["b", "c", "a"]);
    expect(input.map((e) => e.creatorProfileId)).toEqual(["a", "b", "c"]);
  });
  it("totals available balances", () => {
    expect(
      totalCreatorAvailable([earning({ availableCents: 1000 }), earning({ availableCents: 250 })]),
    ).toBe(1250);
    expect(totalCreatorAvailable([])).toBe(0);
  });
});

describe("filterTransactions", () => {
  const rows = [
    txn({ id: "a", type: "tip", status: "succeeded", creatorHandle: "aurora" }),
    txn({ id: "b", type: "refund", status: "refunded", creatorHandle: "blaze" }),
    txn({ id: "c", type: "tip", status: "pending", creatorHandle: null, creatorDisplayName: null }),
  ];
  it("returns all on empty/all filters", () => {
    expect(filterTransactions(rows)).toHaveLength(3);
    expect(filterTransactions(rows, { type: "all", status: "all", search: "  " })).toHaveLength(3);
  });
  it("filters by type and status", () => {
    expect(filterTransactions(rows, { type: "tip" }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterTransactions(rows, { status: "refunded" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterTransactions(rows, { type: "tip", status: "succeeded" }).map((r) => r.id)).toEqual(
      ["a"],
    );
  });
  it("searches across id / handle / reference, case-insensitive", () => {
    expect(filterTransactions(rows, { search: "BLAZE" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterTransactions(rows, { search: "mock_abc" }).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(filterTransactions(rows, { search: "nomatch" })).toHaveLength(0);
  });
});

describe("transactionsToCsv", () => {
  it("emits a header and escapes commas / quotes / newlines", () => {
    const csv = transactionsToCsv([
      txn({ id: "a", creatorDisplayName: "Plain", referenceType: "tip" }),
      txn({
        id: "b",
        creatorHandle: null,
        referenceType: "a,b",
        mockProviderReference: 'has"quote',
      }),
      txn({ id: "c", referenceType: "line\nbreak" }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "id,createdAt,creatorHandle,type,status,currency,grossCents,platformFeeCents,processorFeeCents,creatorNetCents,referenceType,referenceId,mockProviderReference",
    );
    expect(lines[1]).toContain("a,2026-06-25T12:00:00.000Z,aurora,");
    // empty handle → empty cell; quoted comma + doubled quote
    expect(lines[2]).toContain(",,creator_subscription,"); // null handle renders empty
    expect(lines[2]).toContain('"a,b"');
    expect(lines[2]).toContain('"has""quote"');
    // newline forces quoting
    expect(lines[3]).toContain('"line\nbreak"');
  });
  it("emits header only for no rows", () => {
    expect(transactionsToCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("labels", () => {
  it("labels transaction types, statuses, payout statuses", () => {
    expect(transactionTypeLabel("creator_subscription")).toBe("Subscription");
    expect(transactionTypeLabel("post_unlock")).toBe("Post unlock");
    expect(transactionTypeLabel("adjustment")).toBe("Adjustment");
    expect(transactionStatusLabel("succeeded")).toBe("Succeeded");
    expect(transactionStatusLabel("disputed")).toBe("Disputed");
    expect(payoutStatusLabel("processing")).toBe("Processing");
  });
  it("derives a creator label with fallbacks", () => {
    expect(creatorLabel({ creatorDisplayName: "Aurora", creatorHandle: "aurora" })).toBe("Aurora");
    expect(creatorLabel({ creatorDisplayName: "  ", creatorHandle: "aurora" })).toBe("@aurora");
    expect(creatorLabel({ creatorDisplayName: null, creatorHandle: "  " })).toBe("Unknown creator");
    expect(creatorLabel({ creatorDisplayName: null, creatorHandle: null })).toBe("Unknown creator");
  });
  it("formats cents via cabana-money", () => {
    expect(formatCents(1000)).toBe("$10.00");
    expect(formatCents(2599, "USD")).toBe("$25.99");
  });
});
