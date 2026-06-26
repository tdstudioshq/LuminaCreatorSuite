// ============================================================================
// CABANA — admin payout workflow domain layer (PURE) — Phase 8C.2
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. The single source of
// truth for the administrative payout state machine: which actions are valid
// from each status, the resulting status, display labels, and queue grouping.
// The SQL `admin_review_payout` RPC mirrors `applyPayoutAction` exactly, and the
// server action (`admin-payout-actions.ts`) + hooks delegate here so the rules
// stay testable without a DB.
//
// DEMO-ONLY: no real disbursement. Reuses the Phase 6 ledger; this module only
// owns the request lifecycle (`payout_request_status`), never re-derives money.
// ============================================================================
import type { Database } from "@/integrations/supabase/types";

export type PayoutRequestStatus = Database["public"]["Enums"]["payout_request_status"];
export type PayoutDisbursementStatus = Database["public"]["Enums"]["payout_status"];

/**
 * The administrative actions an admin can take on a payout request. Each action
 * name maps directly to its state-machine transition (see ACTION_RULES). Note
 * `approve` and `mark_paid` are deliberately distinct steps: `approve`
 * AUTHORIZES the payout (the linked disbursement stays reserved), and
 * `mark_paid` SETTLES it (the disbursement is paid out) — the standard
 * authorize-then-disburse split.
 */
export type PayoutAction = "approve" | "reject" | "hold" | "release" | "mark_paid";

export const PAYOUT_REQUEST_STATUSES: readonly PayoutRequestStatus[] = [
  "requested",
  "on_hold",
  "approved",
  "rejected",
  "paid",
];

export const PAYOUT_ACTIONS: readonly PayoutAction[] = [
  "approve",
  "reject",
  "hold",
  "release",
  "mark_paid",
];

// ─────────────────────────────── Domain type ────────────────────────────────

/** A payout request joined with its creator + linked disbursement (admin view). */
export type AdminPayoutRequest = {
  id: string;
  creatorProfileId: string;
  creatorHandle: string | null;
  creatorDisplayName: string | null;
  amountCents: number;
  currency: string;
  status: PayoutRequestStatus;
  note: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  payoutStatus: PayoutDisbursementStatus | null;
  paidAt: string | null;
  failureReason: string | null;
};

// ─────────────────────────────── State machine ──────────────────────────────

/**
 * The payout-request transition table. Each action is valid only from the
 * listed `from` statuses and always moves to the single `to` status. This is
 * mirrored verbatim by the SQL `admin_review_payout` RPC.
 */
const ACTION_RULES: Record<
  PayoutAction,
  { from: readonly PayoutRequestStatus[]; to: PayoutRequestStatus }
> = {
  approve: { from: ["requested", "on_hold"], to: "approved" },
  reject: { from: ["requested", "on_hold"], to: "rejected" },
  hold: { from: ["requested"], to: "on_hold" },
  release: { from: ["on_hold"], to: "requested" },
  mark_paid: { from: ["approved"], to: "paid" },
};

/** Whether `action` may be applied to a request currently in `status`. */
export function canApplyPayoutAction(status: PayoutRequestStatus, action: PayoutAction): boolean {
  return ACTION_RULES[action].from.includes(status);
}

/** The status an action moves a request to (regardless of current status). */
export function payoutActionTarget(action: PayoutAction): PayoutRequestStatus {
  return ACTION_RULES[action].to;
}

/** The actions available from a given status, in canonical order. */
export function availablePayoutActions(status: PayoutRequestStatus): PayoutAction[] {
  return PAYOUT_ACTIONS.filter((a) => canApplyPayoutAction(status, a));
}

/**
 * Apply an action, returning the next status. Throws on an invalid transition
 * (the server action surfaces the message; the SQL RPC raises the equivalent).
 */
export function applyPayoutAction(
  status: PayoutRequestStatus,
  action: PayoutAction,
): PayoutRequestStatus {
  if (!canApplyPayoutAction(status, action)) {
    throw new Error(
      `Cannot ${payoutActionLabel(action).toLowerCase()} a ${payoutRequestStatusLabel(
        status,
      ).toLowerCase()} payout.`,
    );
  }
  return ACTION_RULES[action].to;
}

/** Whether a direct status move is reachable through some single action. */
export function canTransitionPayoutRequest(
  from: PayoutRequestStatus,
  to: PayoutRequestStatus,
): boolean {
  if (from === to) return false;
  return PAYOUT_ACTIONS.some(
    (a) => ACTION_RULES[a].to === to && ACTION_RULES[a].from.includes(from),
  );
}

/** Paid + rejected are terminal (a closed request). */
export function isTerminalPayoutStatus(status: PayoutRequestStatus): boolean {
  return status === "paid" || status === "rejected";
}

/** Requested + on_hold + approved are still actionable. */
export function isActivePayoutStatus(status: PayoutRequestStatus): boolean {
  return !isTerminalPayoutStatus(status);
}

// ─────────────────────────────── Display labels ─────────────────────────────

const STATUS_LABELS: Record<PayoutRequestStatus, string> = {
  requested: "Pending",
  on_hold: "On hold",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Completed",
};
const ACTION_LABELS: Record<PayoutAction, string> = {
  approve: "Approve",
  reject: "Reject",
  hold: "Place on hold",
  release: "Release hold",
  mark_paid: "Mark paid",
};

export function payoutRequestStatusLabel(status: PayoutRequestStatus): string {
  return STATUS_LABELS[status];
}
export function payoutActionLabel(action: PayoutAction): string {
  return ACTION_LABELS[action];
}

// ─────────────────────────────── Queue helpers ──────────────────────────────

const STATUS_ORDER: Record<PayoutRequestStatus, number> = {
  requested: 0,
  on_hold: 1,
  approved: 2,
  rejected: 3,
  paid: 4,
};

export type PayoutStatusCounts = Record<PayoutRequestStatus, number>;

export function countPayoutRequestsByStatus(
  requests: readonly AdminPayoutRequest[],
): PayoutStatusCounts {
  const counts: PayoutStatusCounts = {
    requested: 0,
    on_hold: 0,
    approved: 0,
    rejected: 0,
    paid: 0,
  };
  for (const r of requests) counts[r.status] += 1;
  return counts;
}

export function filterPayoutRequestsByStatus(
  requests: readonly AdminPayoutRequest[],
  status: PayoutRequestStatus,
): AdminPayoutRequest[] {
  return requests.filter((r) => r.status === status);
}

/** Number of still-actionable (requested + on_hold + approved) requests. */
export function countActionablePayoutRequests(requests: readonly AdminPayoutRequest[]): number {
  let n = 0;
  for (const r of requests) if (isActivePayoutStatus(r.status)) n += 1;
  return n;
}

/**
 * Triage order: actionable statuses first (pending → on hold → approved), then
 * terminal ones; newest first within a status. Pure + stable.
 */
export function sortPayoutRequestsForQueue(
  requests: readonly AdminPayoutRequest[],
): AdminPayoutRequest[] {
  return [...requests].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    const at = Date.parse(a.createdAt);
    const bt = Date.parse(b.createdAt);
    return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
  });
}
