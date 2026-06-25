/**
 * CABANA money helpers — pure, deterministic integer-cents arithmetic.
 *
 * Hard rules (apply in demo and production):
 *   - All amounts are integer minor units (cents) plus an explicit currency.
 *   - No floats are ever used to *represent* money; floats appear only inside
 *     a single rounding step.
 *   - Fees are rounded independently; creator net is the remainder, so the
 *     parts always sum back to gross exactly.
 *
 * This module is intentionally free of React, Supabase, browser APIs, and any
 * side effects. It is fully unit-testable.
 */

import type { TransactionType } from "@/lib/cabana-types";

// ───────────────────────────── Fee model ─────────────────────────────
/** Default platform (CABANA) fee rate applied to gross. Mirrors demo data. */
export const DEFAULT_PLATFORM_FEE_RATE = 0.1;
/** Default payment-processor fee rate applied to gross. Mirrors demo data. */
export const DEFAULT_PROCESSOR_FEE_RATE = 0.03;

export interface FeeRates {
  platformFeeRate: number;
  processorFeeRate: number;
}

export interface FeeBreakdown {
  grossCents: number;
  platformFeeCents: number;
  processorFeeCents: number;
  creatorNetCents: number;
}

// ───────────────────────────── Guards ─────────────────────────────
/** Throws unless `value` is a finite, non-negative integer number of cents. */
export function assertCents(value: number, label = "amount"): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer number of cents, received: ${value}`);
  }
  if (value < 0) {
    throw new RangeError(`${label} must not be negative, received: ${value}`);
  }
}

/** Throws unless `rate` is a finite number in the inclusive range [0, 1]. */
export function assertRate(rate: number, label = "rate"): void {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError(`${label} must be between 0 and 1, received: ${rate}`);
  }
}

function resolveRates(rates?: Partial<FeeRates>): FeeRates {
  const platformFeeRate = rates?.platformFeeRate ?? DEFAULT_PLATFORM_FEE_RATE;
  const processorFeeRate = rates?.processorFeeRate ?? DEFAULT_PROCESSOR_FEE_RATE;
  assertRate(platformFeeRate, "platformFeeRate");
  assertRate(processorFeeRate, "processorFeeRate");
  return { platformFeeRate, processorFeeRate };
}

// ───────────────────────────── Conversions / rounding ─────────────────────────────
/** Convert a decimal currency amount (e.g. 19.99) to integer cents (1999). */
export function dollarsToCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`amount must be a finite number, received: ${amount}`);
  }
  return Math.round(amount * 100);
}

/** Convert integer cents to a decimal currency amount. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

// ───────────────────────────── Fee calculations ─────────────────────────────
/** Platform fee for a gross amount, rounded to the nearest cent. */
export function calculatePlatformFee(grossCents: number, rates?: Partial<FeeRates>): number {
  assertCents(grossCents, "grossCents");
  const { platformFeeRate } = resolveRates(rates);
  return Math.round(grossCents * platformFeeRate);
}

/** Processor fee for a gross amount, rounded to the nearest cent. */
export function calculateProcessorFee(grossCents: number, rates?: Partial<FeeRates>): number {
  assertCents(grossCents, "grossCents");
  const { processorFeeRate } = resolveRates(rates);
  return Math.round(grossCents * processorFeeRate);
}

/** Creator net (gross minus platform and processor fees) for a gross amount. */
export function calculateCreatorNet(grossCents: number, rates?: Partial<FeeRates>): number {
  return breakdownPayment(grossCents, rates).creatorNetCents;
}

/**
 * Full fee breakdown for an inbound payment. Fees are rounded independently and
 * the creator net is the exact remainder, so the parts always sum to gross.
 */
export function breakdownPayment(grossCents: number, rates?: Partial<FeeRates>): FeeBreakdown {
  assertCents(grossCents, "grossCents");
  const platformFeeCents = calculatePlatformFee(grossCents, rates);
  const processorFeeCents = calculateProcessorFee(grossCents, rates);
  return {
    grossCents,
    platformFeeCents,
    processorFeeCents,
    creatorNetCents: grossCents - platformFeeCents - processorFeeCents,
  };
}

/**
 * Breakdown for a tip. Tips use the same fee model as any other payment; the
 * separate helper exists for call-site clarity and future divergence.
 */
export function breakdownTip(amountCents: number, rates?: Partial<FeeRates>): FeeBreakdown {
  return breakdownPayment(amountCents, rates);
}

/**
 * Breakdown for a refund of `refundCents` against an original gross. Every party
 * gives back its proportional share (symmetric reversal). Returns positive
 * magnitudes describing what is reversed; callers apply the sign.
 */
export function breakdownRefund(
  refundCents: number,
  originalGrossCents: number,
  rates?: Partial<FeeRates>,
): FeeBreakdown {
  assertCents(refundCents, "refundCents");
  assertCents(originalGrossCents, "originalGrossCents");
  if (refundCents > originalGrossCents) {
    throw new RangeError(
      `refundCents (${refundCents}) must not exceed originalGrossCents (${originalGrossCents})`,
    );
  }
  // The refunded slice is itself a payment breakdown reversed.
  return breakdownPayment(refundCents, rates);
}

// ───────────────────────────── Balance derivation ─────────────────────────────
export interface LedgerTransaction {
  type: TransactionType;
  status: "pending" | "succeeded" | "failed" | "refunded" | "disputed";
  grossCents: number;
  platformFeeCents: number;
  processorFeeCents: number;
  creatorNetCents: number;
}

export interface LedgerPayout {
  status: "queued" | "processing" | "paid" | "failed" | "canceled";
  amountCents: number;
}

export interface CreatorBalanceProjection {
  currency: string;
  pendingCents: number;
  availableCents: number;
  lifetimeGrossCents: number;
  lifetimeFeesCents: number;
  lifetimeNetCents: number;
  lifetimePaidOutCents: number;
}

/**
 * Derive a creator's balance from immutable ledger rows. The balance is never
 * stored as truth — it is always computed from succeeded transactions minus
 * fees, refunds, and payouts.
 */
export function deriveCreatorBalance(
  transactions: readonly LedgerTransaction[],
  payouts: readonly LedgerPayout[] = [],
  currency = "USD",
): CreatorBalanceProjection {
  let pendingCents = 0;
  let settledNetCents = 0;
  let lifetimeGrossCents = 0;
  let lifetimeFeesCents = 0;

  for (const txn of transactions) {
    const isRefund = txn.type === "refund";
    if (txn.status === "pending") {
      // Pending inflows are not yet spendable.
      if (!isRefund) pendingCents += txn.creatorNetCents;
      continue;
    }
    if (txn.status !== "succeeded") continue; // failed / refunded / disputed: no balance effect here

    if (isRefund) {
      settledNetCents -= txn.creatorNetCents;
      lifetimeGrossCents -= txn.grossCents;
      lifetimeFeesCents -= txn.platformFeeCents + txn.processorFeeCents;
    } else {
      settledNetCents += txn.creatorNetCents;
      lifetimeGrossCents += txn.grossCents;
      lifetimeFeesCents += txn.platformFeeCents + txn.processorFeeCents;
    }
  }

  let lifetimePaidOutCents = 0;
  let reservedPayoutCents = 0;
  for (const payout of payouts) {
    if (payout.status === "paid") lifetimePaidOutCents += payout.amountCents;
    else if (payout.status === "queued" || payout.status === "processing") {
      reservedPayoutCents += payout.amountCents;
    }
  }

  return {
    currency,
    pendingCents,
    availableCents: settledNetCents - lifetimePaidOutCents - reservedPayoutCents,
    lifetimeGrossCents,
    lifetimeFeesCents,
    lifetimeNetCents: settledNetCents,
    lifetimePaidOutCents,
  };
}

// ───────────────────────────── Formatting ─────────────────────────────
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/**
 * Deterministic currency formatting from integer cents. Avoids Intl so output
 * is stable across environments. Known currencies use a leading symbol; unknown
 * currency codes are appended as a suffix.
 */
export function formatMoney(cents: number, currency = "USD"): string {
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) {
    throw new RangeError(`cents must be an integer, received: ${cents}`);
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  // Manual thousands grouping — avoids Intl/toLocaleString for cross-env determinism.
  const groupedDollars = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = remainder.toString().padStart(2, "0");
  const sign = negative ? "-" : "";

  const symbol = CURRENCY_SYMBOLS[currency];
  if (symbol) {
    return `${sign}${symbol}${groupedDollars}.${fraction}`;
  }
  return `${sign}${groupedDollars}.${fraction} ${currency}`;
}
