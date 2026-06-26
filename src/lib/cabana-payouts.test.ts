import { describe, expect, it } from "vitest";
import {
  type AdminPayoutRequest,
  type PayoutRequestStatus,
  applyPayoutAction,
  availablePayoutActions,
  canApplyPayoutAction,
  canTransitionPayoutRequest,
  countActionablePayoutRequests,
  countPayoutRequestsByStatus,
  filterPayoutRequestsByStatus,
  isActivePayoutStatus,
  isTerminalPayoutStatus,
  payoutActionLabel,
  payoutActionTarget,
  payoutRequestStatusLabel,
  sortPayoutRequestsForQueue,
} from "@/lib/cabana-payouts";

function req(overrides: Partial<AdminPayoutRequest> = {}): AdminPayoutRequest {
  return {
    id: "pr1",
    creatorProfileId: "c1",
    creatorHandle: "aurora",
    creatorDisplayName: "Aurora Rose",
    amountCents: 5000,
    currency: "USD",
    status: "requested",
    note: null,
    decidedAt: null,
    createdAt: "2026-06-25T12:00:00.000Z",
    updatedAt: "2026-06-25T12:00:00.000Z",
    payoutStatus: "processing",
    paidAt: null,
    failureReason: null,
    ...overrides,
  };
}

describe("payout state machine", () => {
  it("permits the valid action set from each status", () => {
    expect(availablePayoutActions("requested")).toEqual(["approve", "reject", "hold"]);
    expect(availablePayoutActions("on_hold")).toEqual(["approve", "reject", "release"]);
    expect(availablePayoutActions("approved")).toEqual(["mark_paid"]);
    expect(availablePayoutActions("rejected")).toEqual([]);
    expect(availablePayoutActions("paid")).toEqual([]);
  });

  it("applies valid actions to the right target status", () => {
    expect(applyPayoutAction("requested", "approve")).toBe("approved");
    expect(applyPayoutAction("requested", "hold")).toBe("on_hold");
    expect(applyPayoutAction("requested", "reject")).toBe("rejected");
    expect(applyPayoutAction("on_hold", "release")).toBe("requested");
    expect(applyPayoutAction("on_hold", "approve")).toBe("approved");
    expect(applyPayoutAction("approved", "mark_paid")).toBe("paid");
  });

  it("rejects invalid transitions with a clear message", () => {
    expect(() => applyPayoutAction("paid", "approve")).toThrow(
      /cannot approve a completed payout/i,
    );
    expect(() => applyPayoutAction("rejected", "release")).toThrow(/release/i);
    expect(() => applyPayoutAction("requested", "mark_paid")).toThrow(/mark paid/i);
    expect(() => applyPayoutAction("approved", "hold")).toThrow(/hold/i);
    expect(canApplyPayoutAction("requested", "release")).toBe(false);
  });

  it("exposes action targets", () => {
    expect(payoutActionTarget("approve")).toBe("approved");
    expect(payoutActionTarget("mark_paid")).toBe("paid");
    expect(payoutActionTarget("release")).toBe("requested");
  });

  it("derives reachable direct transitions", () => {
    expect(canTransitionPayoutRequest("requested", "approved")).toBe(true);
    expect(canTransitionPayoutRequest("on_hold", "requested")).toBe(true);
    expect(canTransitionPayoutRequest("approved", "paid")).toBe(true);
    expect(canTransitionPayoutRequest("requested", "paid")).toBe(false);
    expect(canTransitionPayoutRequest("requested", "requested")).toBe(false);
  });

  it("classifies terminal vs active", () => {
    expect(isTerminalPayoutStatus("paid")).toBe(true);
    expect(isTerminalPayoutStatus("rejected")).toBe(true);
    expect(isActivePayoutStatus("requested")).toBe(true);
    expect(isActivePayoutStatus("on_hold")).toBe(true);
    expect(isActivePayoutStatus("approved")).toBe(true);
    expect(isActivePayoutStatus("paid")).toBe(false);
  });
});

describe("labels", () => {
  it("labels statuses and actions", () => {
    const statuses: PayoutRequestStatus[] = [
      "requested",
      "on_hold",
      "approved",
      "rejected",
      "paid",
    ];
    expect(statuses.map(payoutRequestStatusLabel)).toEqual([
      "Pending",
      "On hold",
      "Approved",
      "Rejected",
      "Completed",
    ]);
    expect(payoutActionLabel("approve")).toBe("Approve");
    expect(payoutActionLabel("hold")).toBe("Place on hold");
    expect(payoutActionLabel("release")).toBe("Release hold");
    expect(payoutActionLabel("mark_paid")).toBe("Mark paid");
  });
});

describe("queue helpers", () => {
  const rows = [
    req({ id: "a", status: "paid", createdAt: "2026-06-20T00:00:00.000Z" }),
    req({ id: "b", status: "requested", createdAt: "2026-06-21T00:00:00.000Z" }),
    req({ id: "c", status: "requested", createdAt: "2026-06-23T00:00:00.000Z" }),
    req({ id: "d", status: "on_hold", createdAt: "2026-06-22T00:00:00.000Z" }),
    req({ id: "e", status: "approved", createdAt: "2026-06-19T00:00:00.000Z" }),
    req({ id: "f", status: "rejected", createdAt: "2026-06-18T00:00:00.000Z" }),
  ];

  it("counts by status", () => {
    expect(countPayoutRequestsByStatus(rows)).toEqual({
      requested: 2,
      on_hold: 1,
      approved: 1,
      rejected: 1,
      paid: 1,
    });
    expect(countPayoutRequestsByStatus([])).toEqual({
      requested: 0,
      on_hold: 0,
      approved: 0,
      rejected: 0,
      paid: 0,
    });
  });

  it("counts actionable requests", () => {
    expect(countActionablePayoutRequests(rows)).toBe(4); // b, c, d, e
  });

  it("filters by status", () => {
    expect(filterPayoutRequestsByStatus(rows, "requested").map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("sorts actionable first, newest within a status, without mutating input", () => {
    const before = rows.map((r) => r.id);
    const sorted = sortPayoutRequestsForQueue(rows);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "d", "e", "f", "a"]);
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it("treats unparseable dates as oldest (either comparison side)", () => {
    // bad date in the first slot…
    expect(
      sortPayoutRequestsForQueue([
        req({ id: "x", status: "requested", createdAt: "bad" }),
        req({ id: "y", status: "requested", createdAt: "2026-06-25T00:00:00.000Z" }),
      ]).map((r) => r.id),
    ).toEqual(["y", "x"]);
    // …and a mix that forces both NaN comparison branches.
    const sorted = sortPayoutRequestsForQueue([
      req({ id: "g", status: "requested", createdAt: "2026-06-25T00:00:00.000Z" }),
      req({ id: "h", status: "requested", createdAt: "bad" }),
      req({ id: "i", status: "requested", createdAt: "also-bad" }),
    ]);
    expect(sorted[0].id).toBe("g");
  });
});
