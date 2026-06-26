import { describe, expect, it } from "vitest";
import {
  assertCents,
  assertRate,
  breakdownPayment,
  breakdownRefund,
  breakdownTip,
  calculateCreatorNet,
  calculatePlatformFee,
  calculateProcessorFee,
  centsToDollars,
  deriveCreatorBalance,
  dollarsToCents,
  entitlementFromPurchase,
  evaluatePayoutEligibility,
  evaluatePurchase,
  formatMoney,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_PROCESSOR_FEE_RATE,
  MIN_PAYOUT_CENTS,
} from "@/lib/cabana-money";
import { makePayout, makeTransaction } from "@/test/factories";

describe("guards", () => {
  it("assertCents accepts non-negative integers", () => {
    expect(() => assertCents(0)).not.toThrow();
    expect(() => assertCents(1900)).not.toThrow();
  });

  it("assertCents rejects negatives, floats, and non-finite values", () => {
    expect(() => assertCents(-1, "grossCents")).toThrow(/grossCents/);
    expect(() => assertCents(10.5)).toThrow(RangeError);
    expect(() => assertCents(Number.NaN)).toThrow(RangeError);
    expect(() => assertCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("assertRate accepts [0,1] and rejects outside / non-finite", () => {
    expect(() => assertRate(0)).not.toThrow();
    expect(() => assertRate(1)).not.toThrow();
    expect(() => assertRate(-0.01, "platformFeeRate")).toThrow(/platformFeeRate/);
    expect(() => assertRate(1.5)).toThrow(RangeError);
    expect(() => assertRate(Number.NaN)).toThrow(RangeError);
  });
});

describe("conversions and rounding", () => {
  it("dollarsToCents rounds to the nearest cent", () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(0.005)).toBe(1); // rounds up
    expect(dollarsToCents(0.004)).toBe(0); // rounds down
    expect(dollarsToCents(-5)).toBe(-500);
  });

  it("dollarsToCents rejects non-finite", () => {
    expect(() => dollarsToCents(Number.NaN)).toThrow(RangeError);
  });

  it("centsToDollars is the inverse for whole cents", () => {
    expect(centsToDollars(1999)).toBeCloseTo(19.99, 5);
    expect(centsToDollars(0)).toBe(0);
  });
});

describe("platform fee", () => {
  it("uses the default rate and rounds", () => {
    expect(calculatePlatformFee(1900)).toBe(190);
    expect(calculatePlatformFee(3900)).toBe(390);
    expect(DEFAULT_PLATFORM_FEE_RATE).toBe(0.1);
  });

  it("rounds half-cents to the nearest cent", () => {
    // 1995 * 0.1 = 199.5 -> 200
    expect(calculatePlatformFee(1995)).toBe(200);
  });

  it("accepts a custom rate", () => {
    expect(calculatePlatformFee(1000, { platformFeeRate: 0.2 })).toBe(200);
  });

  it("validates gross", () => {
    expect(() => calculatePlatformFee(-1)).toThrow(RangeError);
  });
});

describe("processor fee", () => {
  it("uses the default rate and rounds", () => {
    expect(calculateProcessorFee(1900)).toBe(57); // 190 * 0.3 -> 57
    expect(DEFAULT_PROCESSOR_FEE_RATE).toBe(0.03);
  });

  it("accepts a custom rate", () => {
    expect(calculateProcessorFee(1000, { processorFeeRate: 0.05 })).toBe(50);
  });
});

describe("creator net and breakdown", () => {
  it("creator net is gross minus both fees", () => {
    expect(calculateCreatorNet(1900)).toBe(1900 - 190 - 57);
  });

  it("breakdown parts always sum back to gross", () => {
    for (const gross of [0, 1, 99, 100, 900, 1900, 3900, 12345]) {
      const b = breakdownPayment(gross);
      expect(b.platformFeeCents + b.processorFeeCents + b.creatorNetCents).toBe(gross);
      expect(b.grossCents).toBe(gross);
    }
  });

  it("matches the demo-data fee model exactly", () => {
    // demo-data: platform 10%, processor 3%, net = gross - both
    const b = breakdownPayment(3900);
    expect(b).toEqual({
      grossCents: 3900,
      platformFeeCents: 390,
      processorFeeCents: 117,
      creatorNetCents: 3393,
    });
  });

  it("handles a zero-amount payment", () => {
    expect(breakdownPayment(0)).toEqual({
      grossCents: 0,
      platformFeeCents: 0,
      processorFeeCents: 0,
      creatorNetCents: 0,
    });
  });
});

describe("tips", () => {
  it("breaks down a tip with the standard fee model", () => {
    expect(breakdownTip(500)).toEqual({
      grossCents: 500,
      platformFeeCents: 50,
      processorFeeCents: 15,
      creatorNetCents: 435,
    });
  });
});

describe("refunds", () => {
  it("breaks down a full refund symmetrically", () => {
    const refund = breakdownRefund(1900, 1900);
    expect(refund).toEqual(breakdownPayment(1900));
  });

  it("breaks down a partial refund", () => {
    const refund = breakdownRefund(950, 1900);
    expect(refund.grossCents).toBe(950);
    expect(refund.platformFeeCents + refund.processorFeeCents + refund.creatorNetCents).toBe(950);
  });

  it("rejects a refund greater than the original gross", () => {
    expect(() => breakdownRefund(2000, 1900)).toThrow(/must not exceed/);
  });

  it("validates inputs", () => {
    expect(() => breakdownRefund(-1, 1900)).toThrow(RangeError);
    expect(() => breakdownRefund(100, -1)).toThrow(RangeError);
  });
});

describe("deriveCreatorBalance", () => {
  it("returns an all-zero projection for no activity", () => {
    expect(deriveCreatorBalance([])).toEqual({
      currency: "USD",
      pendingCents: 0,
      availableCents: 0,
      lifetimeGrossCents: 0,
      lifetimeFeesCents: 0,
      lifetimeNetCents: 0,
      lifetimePaidOutCents: 0,
    });
  });

  it("sums succeeded transactions into lifetime and available", () => {
    const txns = [
      makeTransaction({
        grossCents: 1900,
        platformFeeCents: 190,
        processorFeeCents: 57,
        creatorNetCents: 1653,
      }),
      makeTransaction({
        grossCents: 3900,
        platformFeeCents: 390,
        processorFeeCents: 117,
        creatorNetCents: 3393,
      }),
    ];
    const balance = deriveCreatorBalance(txns);
    expect(balance.lifetimeGrossCents).toBe(5800);
    expect(balance.lifetimeFeesCents).toBe(190 + 57 + 390 + 117);
    expect(balance.lifetimeNetCents).toBe(1653 + 3393);
    expect(balance.availableCents).toBe(1653 + 3393);
    expect(balance.pendingCents).toBe(0);
  });

  it("keeps pending transactions out of available", () => {
    const balance = deriveCreatorBalance([
      makeTransaction({ status: "succeeded", creatorNetCents: 1000 }),
      makeTransaction({ status: "pending", creatorNetCents: 500 }),
    ]);
    expect(balance.availableCents).toBe(1000);
    expect(balance.pendingCents).toBe(500);
  });

  it("ignores failed / disputed / refunded-status transactions", () => {
    const balance = deriveCreatorBalance([
      makeTransaction({ status: "failed", creatorNetCents: 999 }),
      makeTransaction({ status: "disputed", creatorNetCents: 999 }),
      makeTransaction({ status: "refunded", creatorNetCents: 999 }),
    ]);
    expect(balance.lifetimeNetCents).toBe(0);
    expect(balance.availableCents).toBe(0);
  });

  it("subtracts succeeded refund transactions from net and lifetime", () => {
    const balance = deriveCreatorBalance([
      makeTransaction({
        type: "creator_subscription",
        creatorNetCents: 1653,
        grossCents: 1900,
        platformFeeCents: 190,
        processorFeeCents: 57,
      }),
      makeTransaction({
        type: "refund",
        creatorNetCents: 1653,
        grossCents: 1900,
        platformFeeCents: 190,
        processorFeeCents: 57,
      }),
    ]);
    expect(balance.lifetimeNetCents).toBe(0);
    expect(balance.lifetimeGrossCents).toBe(0);
    expect(balance.lifetimeFeesCents).toBe(0);
    expect(balance.availableCents).toBe(0);
  });

  it("does not count a pending refund", () => {
    const balance = deriveCreatorBalance([
      makeTransaction({ status: "succeeded", creatorNetCents: 1000 }),
      makeTransaction({ type: "refund", status: "pending", creatorNetCents: 500 }),
    ]);
    expect(balance.pendingCents).toBe(0);
    expect(balance.availableCents).toBe(1000);
  });

  it("reserves queued/processing payouts and subtracts paid payouts", () => {
    const txns = [makeTransaction({ creatorNetCents: 5000 })];
    const balance = deriveCreatorBalance(txns, [
      makePayout({ status: "paid", amountCents: 1000 }),
      makePayout({ status: "queued", amountCents: 500 }),
      makePayout({ status: "processing", amountCents: 250 }),
      makePayout({ status: "failed", amountCents: 9999 }),
      makePayout({ status: "canceled", amountCents: 9999 }),
    ]);
    expect(balance.lifetimePaidOutCents).toBe(1000);
    expect(balance.availableCents).toBe(5000 - 1000 - 500 - 250);
  });

  it("honors an explicit currency", () => {
    expect(deriveCreatorBalance([], [], "EUR").currency).toBe("EUR");
  });
});

describe("formatMoney", () => {
  it("formats USD with a leading symbol and grouping", () => {
    expect(formatMoney(190000)).toBe("$1,900.00");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(1234567)).toBe("$12,345.67");
  });

  it("formats negative amounts (e.g. refunds)", () => {
    expect(formatMoney(-500)).toBe("-$5.00");
  });

  it("supports known currency symbols", () => {
    expect(formatMoney(1999, "EUR")).toBe("€19.99");
    expect(formatMoney(1999, "GBP")).toBe("£19.99");
  });

  it("falls back to a suffixed currency code for unknown currencies", () => {
    expect(formatMoney(1999, "JPY")).toBe("19.99 JPY");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatMoney(10.5)).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN)).toThrow(RangeError);
  });
});

describe("evaluatePayoutEligibility", () => {
  it("defaults the minimum to $10 (1000 cents)", () => {
    expect(MIN_PAYOUT_CENTS).toBe(1000);
    expect(evaluatePayoutEligibility(5000, 2000)).toEqual({
      eligible: true,
      reason: "eligible",
      minimumCents: 1000,
    });
  });

  it("rejects invalid amounts (non-integer, zero, negative, non-finite)", () => {
    expect(evaluatePayoutEligibility(5000, 0).reason).toBe("invalid_amount");
    expect(evaluatePayoutEligibility(5000, -1).reason).toBe("invalid_amount");
    expect(evaluatePayoutEligibility(5000, 10.5).reason).toBe("invalid_amount");
    expect(evaluatePayoutEligibility(5000, Number.NaN).reason).toBe("invalid_amount");
  });

  it("rejects amounts below the minimum", () => {
    const r = evaluatePayoutEligibility(5000, 500);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("below_minimum");
  });

  it("rejects amounts above the available balance", () => {
    expect(evaluatePayoutEligibility(1500, 2000).reason).toBe("exceeds_available");
  });

  it("honors a custom minimum", () => {
    expect(evaluatePayoutEligibility(5000, 1500, 2000).reason).toBe("below_minimum");
    expect(evaluatePayoutEligibility(5000, 2500, 2000).eligible).toBe(true);
  });
});

describe("evaluatePurchase", () => {
  it("returns a fee breakdown for a purchasable post", () => {
    const decision = evaluatePurchase({ visibility: "purchase", priceCents: 1900 });
    expect(decision).toEqual({
      purchasable: true,
      reason: "purchasable",
      breakdown: breakdownPayment(1900),
    });
  });

  it("blocks the owner from buying their own post", () => {
    expect(evaluatePurchase({ visibility: "purchase", priceCents: 1900, isOwner: true })).toEqual({
      purchasable: false,
      reason: "owner",
    });
  });

  it("does not re-charge an existing entitlement", () => {
    expect(
      evaluatePurchase({ visibility: "purchase", priceCents: 1900, alreadyOwned: true }),
    ).toEqual({ purchasable: false, reason: "already_owned" });
  });

  it("rejects non-purchase visibilities", () => {
    expect(evaluatePurchase({ visibility: "public", priceCents: 1900 }).reason).toBe(
      "not_purchasable",
    );
  });

  it("rejects purchase posts without a positive price", () => {
    expect(evaluatePurchase({ visibility: "purchase", priceCents: null }).reason).toBe("free");
    expect(evaluatePurchase({ visibility: "purchase", priceCents: 0 }).reason).toBe("free");
  });
});

describe("entitlementFromPurchase", () => {
  it("builds a permanent purchase entitlement record", () => {
    expect(entitlementFromPurchase("u1", "p1", "pur1")).toEqual({
      userId: "u1",
      postId: "p1",
      source: "purchase",
      purchaseId: "pur1",
    });
  });

  it("defaults purchaseId to null", () => {
    expect(entitlementFromPurchase("u1", "p1").purchaseId).toBeNull();
  });
});
