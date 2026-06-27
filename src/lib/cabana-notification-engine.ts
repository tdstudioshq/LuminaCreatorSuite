// ============================================================================
// CABANA — notification delivery engine domain layer (PURE) — Phase 9A
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. The processing brain
// behind the Phase 7 `notification_outbox` (previously inert): retry/backoff
// scheduling, the delivery-outcome state machine (deliver → sent; transient →
// retry or dead-letter; permanent → dead-letter), batch selection, and queue
// summaries. The SQL `process_notification_outbox` RPC mirrors `resolveOutboxOutcome`
// exactly; the server actions delegate here so the rules stay testable without a DB.
//
// This phase is the ENGINE only — NO email/push/SMS providers (those land in 9C).
// With no transport yet, the processor takes a simulated delivery RESULT so the
// retry/dead-letter machinery is real and testable; 9C replaces the simulation
// with real per-channel provider calls. Reuses the existing outbox columns
// (`attempts`, `last_error`, `scheduled_for`, `processed_at`) — no schema change.
// ============================================================================
import type { Database } from "@/integrations/supabase/types";

export type OutboxStatus = Database["public"]["Enums"]["outbox_status"];
export type NotificationChannel = Database["public"]["Enums"]["notification_channel"];

type OutboxRow = Database["public"]["Tables"]["notification_outbox"]["Row"];

/** The transport outcome of a single delivery attempt (simulated until 9C). */
export type DeliveryResult = "delivered" | "transient_failure" | "permanent_failure";

export const DELIVERY_RESULTS: readonly DeliveryResult[] = [
  "delivered",
  "transient_failure",
  "permanent_failure",
];

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_BACKOFF_BASE_SECONDS = 60;
export const MAX_BACKOFF_SECONDS = 3600;
export const DEFAULT_BATCH_SIZE = 50;

// ─────────────────────────────── Domain types ───────────────────────────────

export type OutboxEntry = {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  scheduledFor: string;
  processedAt: string | null;
  createdAt: string;
};

export function mapOutboxEntry(row: OutboxRow): OutboxEntry {
  return {
    id: row.id,
    notificationId: row.notification_id,
    channel: row.channel,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    scheduledFor: row.scheduled_for,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

// ─────────────────────────────── Backoff schedule ───────────────────────────

/**
 * Exponential backoff for the Nth attempt: base · 2^(attempts−1), capped. Pure;
 * `attempts` is the attempt count *after* the failure being scheduled (1-based).
 */
export function computeBackoffSeconds(
  attempts: number,
  base = DEFAULT_BACKOFF_BASE_SECONDS,
  cap = MAX_BACKOFF_SECONDS,
): number {
  const n = Math.max(1, Math.trunc(attempts));
  const raw = base * 2 ** (n - 1);
  return Math.min(raw, cap);
}

/** ISO timestamp for the next retry after a failure at `attempts`. */
export function nextRetryAt(
  nowIso: string,
  attempts: number,
  base = DEFAULT_BACKOFF_BASE_SECONDS,
  cap = MAX_BACKOFF_SECONDS,
): string {
  const now = Date.parse(nowIso);
  const ms =
    (Number.isNaN(now) ? Date.now() : now) + computeBackoffSeconds(attempts, base, cap) * 1000;
  return new Date(ms).toISOString();
}

// ─────────────────────────────── Outcome state machine ──────────────────────

export type OutboxOutcome = {
  status: OutboxStatus;
  attempts: number;
  /** Set only when the entry is re-queued for retry (else keep the existing value). */
  scheduledFor: string | null;
  processedAt: string | null;
  lastError: string | null;
  /** Convenience flags for callers / summaries. */
  retried: boolean;
  deadLettered: boolean;
};

/**
 * Resolve what a single delivery attempt does to an outbox entry. Mirrored
 * verbatim by the SQL RPC. `attempts` is the entry's CURRENT attempt count
 * (before this attempt). A transient failure retries with backoff until
 * `maxAttempts`, then dead-letters (terminal `failed`); a permanent failure
 * dead-letters immediately.
 */
export function resolveOutboxOutcome(params: {
  attempts: number;
  result: DeliveryResult;
  nowIso: string;
  maxAttempts?: number;
  baseSeconds?: number;
  error?: string | null;
}): OutboxOutcome {
  const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const base = params.baseSeconds ?? DEFAULT_BACKOFF_BASE_SECONDS;
  const nextAttempts = params.attempts + 1;

  if (params.result === "delivered") {
    return {
      status: "sent",
      attempts: nextAttempts,
      scheduledFor: null,
      processedAt: params.nowIso,
      lastError: null,
      retried: false,
      deadLettered: false,
    };
  }

  if (params.result === "permanent_failure") {
    return {
      status: "failed",
      attempts: nextAttempts,
      scheduledFor: null,
      processedAt: params.nowIso,
      lastError: params.error ?? "Permanent delivery failure",
      retried: false,
      deadLettered: true,
    };
  }

  // transient_failure
  if (nextAttempts >= maxAttempts) {
    return {
      status: "failed",
      attempts: nextAttempts,
      scheduledFor: null,
      processedAt: params.nowIso,
      lastError: params.error ?? "Max delivery attempts reached",
      retried: false,
      deadLettered: true,
    };
  }
  return {
    status: "pending",
    attempts: nextAttempts,
    scheduledFor: nextRetryAt(params.nowIso, nextAttempts, base),
    processedAt: null,
    lastError: params.error ?? "Transient delivery failure",
    retried: true,
    deadLettered: false,
  };
}

// ─────────────────────────────── Queue management ───────────────────────────

/** Terminal states never re-process. */
export function isTerminalOutboxStatus(status: OutboxStatus): boolean {
  return status === "sent" || status === "failed" || status === "skipped" || status === "canceled";
}

/** A pending entry whose scheduled time has arrived is eligible for a worker. */
export function isDue(
  entry: Pick<OutboxEntry, "status" | "scheduledFor">,
  nowIso: string,
): boolean {
  if (entry.status !== "pending") return false;
  const due = Date.parse(entry.scheduledFor);
  const now = Date.parse(nowIso);
  if (Number.isNaN(due) || Number.isNaN(now)) return false;
  return due <= now;
}

/**
 * Select the next batch a worker should claim: due entries, oldest schedule
 * first, up to `batchSize`. Pure + stable (does not mutate the input). The SQL
 * RPC claims the same set with `FOR UPDATE SKIP LOCKED` for concurrency safety.
 */
export function selectDueBatch(
  entries: readonly OutboxEntry[],
  batchSize: number,
  nowIso: string,
): OutboxEntry[] {
  const size = Math.max(0, Math.trunc(batchSize));
  return entries
    .filter((e) => isDue(e, nowIso))
    .sort((a, b) => {
      const at = Date.parse(a.scheduledFor);
      const bt = Date.parse(b.scheduledFor);
      return (Number.isNaN(at) ? 0 : at) - (Number.isNaN(bt) ? 0 : bt);
    })
    .slice(0, size);
}

export type OutboxQueueSummary = {
  total: number;
  pending: number;
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  canceled: number;
};

/** Queue status snapshot for monitoring (counts by status + due-now). */
export function summarizeOutbox(
  entries: readonly OutboxEntry[],
  nowIso: string,
): OutboxQueueSummary {
  const summary: OutboxQueueSummary = {
    total: entries.length,
    pending: 0,
    due: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    canceled: 0,
  };
  for (const e of entries) {
    summary[e.status] += 1;
    if (isDue(e, nowIso)) summary.due += 1;
  }
  return summary;
}

// ─────────────────────────────── Labels ─────────────────────────────────────

const STATUS_LABELS: Record<OutboxStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
  canceled: "Canceled",
};

export function outboxStatusLabel(status: OutboxStatus): string {
  return STATUS_LABELS[status];
}
