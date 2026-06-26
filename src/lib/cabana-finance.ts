// ============================================================================
// CABANA — admin finance & operations domain layer (PURE) — Phase 8C.1
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. The aggregation,
// filtering, CSV, and labelling logic behind the read-only admin finance back
// office. It reuses the Phase 6 ledger verbatim: the server actions
// (`admin-finance-actions.ts`) read rows under the existing admin RLS
// (`is_current_user_admin`) and this module turns them into the dashboard
// rollups + ledger views. Fee math / money formatting stays in `cabana-money`
// (`formatMoney`) — this module never re-derives fees, only sums what the
// immutable ledger already recorded.
//
// DEMO-ONLY, like all CABANA monetization: integer cents, no real money. A
// `refund` transaction carries reversal semantics via its TYPE (its amounts are
// non-negative), so revenue sums subtract refunds rather than adding a negative.
// ============================================================================
import type { Database } from "@/integrations/supabase/types";
import { formatMoney } from "@/lib/cabana-money";

export type TransactionType = Database["public"]["Enums"]["transaction_type"];
export type TransactionStatus = Database["public"]["Enums"]["transaction_status"];
export type PayoutStatus = Database["public"]["Enums"]["payout_status"];

// ─────────────────────────────── Domain types ───────────────────────────────

/** A ledger transaction with the owning creator's identity attached (admin view). */
export type AdminTransaction = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  grossCents: number;
  platformFeeCents: number;
  processorFeeCents: number;
  creatorNetCents: number;
  currency: string;
  referenceType: string | null;
  referenceId: string | null;
  payerUserId: string | null;
  creatorProfileId: string | null;
  creatorHandle: string | null;
  creatorDisplayName: string | null;
  mockProviderReference: string | null;
  createdAt: string;
};

/** A payout (disbursement) row with the owning creator's identity (admin view). */
export type AdminPayout = {
  id: string;
  creatorProfileId: string;
  creatorHandle: string | null;
  creatorDisplayName: string | null;
  amountCents: number;
  currency: string;
  status: PayoutStatus;
  requestedAt: string;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
};

/** A creator's cached balance projection with identity attached (admin view). */
export type CreatorEarning = {
  creatorProfileId: string;
  creatorHandle: string | null;
  creatorDisplayName: string | null;
  currency: string;
  pendingCents: number;
  availableCents: number;
  lifetimeGrossCents: number;
  lifetimeFeesCents: number;
  lifetimeNetCents: number;
  lifetimePaidOutCents: number;
};

export type RevenueTotals = {
  /** Total gross processed (settled), refunds subtracted. */
  grossCents: number;
  /** Platform's share — the headline platform-revenue metric. */
  platformFeeCents: number;
  processorFeeCents: number;
  /** Amount owed to creators (their net). */
  creatorNetCents: number;
  /** Count of settled (succeeded) transactions, including refunds. */
  settledCount: number;
  /** Count of refund transactions among the settled set. */
  refundCount: number;
  /** Count of not-yet-settled (pending) transactions. */
  pendingCount: number;
};

/** Pending / completed / failed rollup of payouts (the dashboard's payout cards). */
export type PayoutRollup = {
  pending: { count: number; amountCents: number };
  completed: { count: number; amountCents: number };
  failed: { count: number; amountCents: number };
  byStatus: Record<PayoutStatus, { count: number; amountCents: number }>;
};

export type TransactionFilter = {
  type?: TransactionType | "all";
  status?: TransactionStatus | "all";
  search?: string;
};

// ─────────────────────────────── Revenue rollups ────────────────────────────

const REFUND_TYPE: TransactionType = "refund";

/** True when this settled transaction reverses money (a refund). */
function isReversal(t: { type: TransactionType }): boolean {
  return t.type === REFUND_TYPE;
}

/**
 * Sum the ledger into platform revenue totals. Only `succeeded` transactions
 * count toward settled money; `refund` rows subtract (their amounts are stored
 * non-negative). Pending rows are counted separately, not summed.
 */
export function summarizeRevenue(transactions: readonly AdminTransaction[]): RevenueTotals {
  const totals: RevenueTotals = {
    grossCents: 0,
    platformFeeCents: 0,
    processorFeeCents: 0,
    creatorNetCents: 0,
    settledCount: 0,
    refundCount: 0,
    pendingCount: 0,
  };
  for (const t of transactions) {
    if (t.status !== "succeeded") {
      if (t.status === "pending") totals.pendingCount += 1;
      continue;
    }
    const sign = isReversal(t) ? -1 : 1;
    totals.grossCents += sign * t.grossCents;
    totals.platformFeeCents += sign * t.platformFeeCents;
    totals.processorFeeCents += sign * t.processorFeeCents;
    totals.creatorNetCents += sign * t.creatorNetCents;
    totals.settledCount += 1;
    if (isReversal(t)) totals.refundCount += 1;
  }
  return totals;
}

const PAYOUT_STATUSES: readonly PayoutStatus[] = [
  "queued",
  "processing",
  "paid",
  "failed",
  "canceled",
];

/** Which dashboard bucket a payout status belongs to. */
export function payoutStatusBucket(status: PayoutStatus): "pending" | "completed" | "failed" {
  if (status === "paid") return "completed";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending"; // queued, processing
}

/** Roll payouts up into pending / completed / failed cards + a per-status table. */
export function rollupPayouts(payouts: readonly AdminPayout[]): PayoutRollup {
  const byStatus = Object.fromEntries(
    PAYOUT_STATUSES.map((s) => [s, { count: 0, amountCents: 0 }]),
  ) as Record<PayoutStatus, { count: number; amountCents: number }>;
  const rollup: PayoutRollup = {
    pending: { count: 0, amountCents: 0 },
    completed: { count: 0, amountCents: 0 },
    failed: { count: 0, amountCents: 0 },
    byStatus,
  };
  for (const p of payouts) {
    const bucket = byStatus[p.status];
    bucket.count += 1;
    bucket.amountCents += p.amountCents;
    const b = rollup[payoutStatusBucket(p.status)];
    b.count += 1;
    b.amountCents += p.amountCents;
  }
  return rollup;
}

/** Creator earnings sorted by lifetime net (biggest earners first), stable. */
export function sortCreatorEarnings(earnings: readonly CreatorEarning[]): CreatorEarning[] {
  return [...earnings].sort((a, b) => b.lifetimeNetCents - a.lifetimeNetCents);
}

/** Total amount currently owed to creators (sum of available balances). */
export function totalCreatorAvailable(earnings: readonly CreatorEarning[]): number {
  return earnings.reduce((sum, e) => sum + e.availableCents, 0);
}

// ─────────────────────────────── Ledger explorer ────────────────────────────

/**
 * Pure filter for the ledger explorer: by type, by status, and a free-text
 * search across id, creator handle/name, reference, and the mock provider ref.
 * `"all"` / blank are no-ops. Does not mutate the input.
 */
export function filterTransactions(
  transactions: readonly AdminTransaction[],
  filter: TransactionFilter = {},
): AdminTransaction[] {
  const type = filter.type && filter.type !== "all" ? filter.type : null;
  const status = filter.status && filter.status !== "all" ? filter.status : null;
  const q = (filter.search ?? "").trim().toLowerCase();
  return transactions.filter((t) => {
    if (type && t.type !== type) return false;
    if (status && t.status !== status) return false;
    if (q) {
      const haystack = [
        t.id,
        t.creatorHandle,
        t.creatorDisplayName,
        t.referenceType,
        t.referenceId,
        t.mockProviderReference,
        t.payerUserId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// ─────────────────────────────── CSV export ─────────────────────────────────

const CSV_COLUMNS: readonly (keyof AdminTransaction | "createdAt")[] = [
  "id",
  "createdAt",
  "creatorHandle",
  "type",
  "status",
  "currency",
  "grossCents",
  "platformFeeCents",
  "processorFeeCents",
  "creatorNetCents",
  "referenceType",
  "referenceId",
  "mockProviderReference",
];

/** RFC-4180-ish CSV field escaping: quote when the value has a comma/quote/newline. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Render transactions as a CSV string (header + one row each) for admin export.
 * Amounts stay as integer cents so the export is analysis-ready, not localized.
 */
export function transactionsToCsv(transactions: readonly AdminTransaction[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = transactions.map((t) =>
    CSV_COLUMNS.map((col) => csvCell((t as Record<string, unknown>)[col])).join(","),
  );
  return [header, ...rows].join("\r\n");
}

// ─────────────────────────────── Display labels ─────────────────────────────

const TXN_TYPE_LABELS: Record<TransactionType, string> = {
  creator_subscription: "Subscription",
  product: "Product",
  post_unlock: "Post unlock",
  paid_message: "Paid message",
  tip: "Tip",
  refund: "Refund",
  adjustment: "Adjustment",
};
const TXN_STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: "Pending",
  succeeded: "Succeeded",
  failed: "Failed",
  refunded: "Refunded",
  disputed: "Disputed",
};
const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  canceled: "Canceled",
};

export function transactionTypeLabel(type: TransactionType): string {
  return TXN_TYPE_LABELS[type];
}
export function transactionStatusLabel(status: TransactionStatus): string {
  return TXN_STATUS_LABELS[status];
}
export function payoutStatusLabel(status: PayoutStatus): string {
  return PAYOUT_STATUS_LABELS[status];
}

/** Convenience: a creator's best display name (display name → @handle → fallback). */
export function creatorLabel(row: {
  creatorDisplayName: string | null;
  creatorHandle: string | null;
}): string {
  if (row.creatorDisplayName && row.creatorDisplayName.trim()) return row.creatorDisplayName;
  if (row.creatorHandle && row.creatorHandle.trim()) return `@${row.creatorHandle}`;
  return "Unknown creator";
}

/** Re-export so finance UI has one money formatter (delegates to cabana-money). */
export function formatCents(cents: number, currency = "USD"): string {
  return formatMoney(cents, currency);
}
