// ============================================================================
// CABANA — protected notification engine server actions (Phase 9A)
// ----------------------------------------------------------------------------
// The backend delivery engine surface (no UI this phase). `processOutbox` calls
// the SECURITY DEFINER `process_notification_outbox` RPC (admin-gated, worker-safe
// `FOR UPDATE SKIP LOCKED` claim, transition logic mirrors the pure
// `cabana-notification-engine` module); `getOutboxStats` reads the queue under the
// existing admin RLS and summarizes it for monitoring. No service role; must NOT
// live under any `**/server/**` path. Backend only — NO providers (Phase 9C).
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type DeliveryResult,
  type OutboxQueueSummary,
  DELIVERY_RESULTS,
  mapOutboxEntry,
  summarizeOutbox,
} from "@/lib/cabana-notification-engine";

export type OutboxProcessResult = {
  processed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
};

function deliveryResult(raw: unknown): DeliveryResult {
  if (raw === undefined || raw === null) return "delivered";
  if (typeof raw !== "string" || !DELIVERY_RESULTS.includes(raw as DeliveryResult)) {
    throw new Error("A valid delivery result is required.");
  }
  return raw as DeliveryResult;
}

function positiveInt(raw: unknown, fallback: number, max: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), 1), max);
}

/**
 * Process one batch of due outbox entries. Admin-only (enforced in the RPC).
 * `result` simulates the transport outcome until real providers land in 9C.
 */
export const processOutbox = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(
    (raw: { batchSize?: unknown; maxAttempts?: unknown; result?: unknown } | undefined) => ({
      batchSize: positiveInt(raw?.batchSize, 50, 500),
      maxAttempts: positiveInt(raw?.maxAttempts, 5, 20),
      result: deliveryResult(raw?.result),
    }),
  )
  .handler(async ({ context, data }): Promise<OutboxProcessResult> => {
    const { supabase } = context;
    const { data: summary, error } = await supabase.rpc("process_notification_outbox", {
      _batch_size: data.batchSize,
      _max_attempts: data.maxAttempts,
      _result: data.result,
    });
    if (error) throw new Error(error.message);
    const row = (summary ?? {}) as Record<string, number>;
    return {
      processed: row.processed ?? 0,
      delivered: row.delivered ?? 0,
      retried: row.retried ?? 0,
      deadLettered: row.dead_lettered ?? 0,
    };
  });

/** Outbox queue snapshot (admin RLS) for monitoring: counts by status + due-now. */
export const getOutboxStats = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<OutboxQueueSummary> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("notification_outbox")
      .select(
        "id, notification_id, channel, status, attempts, last_error, scheduled_for, processed_at, created_at",
      )
      .order("scheduled_for", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    return summarizeOutbox((rows ?? []).map(mapOutboxEntry), new Date().toISOString());
  });
