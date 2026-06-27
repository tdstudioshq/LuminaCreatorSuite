import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import {
  type OutboxEntry,
  computeBackoffSeconds,
  isDue,
  isTerminalOutboxStatus,
  mapOutboxEntry,
  nextRetryAt,
  outboxStatusLabel,
  resolveOutboxOutcome,
  selectDueBatch,
  summarizeOutbox,
} from "@/lib/cabana-notification-engine";

type OutboxRow = Database["public"]["Tables"]["notification_outbox"]["Row"];

const NOW = "2026-06-25T12:00:00.000Z";

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: "o1",
    notificationId: "n1",
    channel: "email",
    status: "pending",
    attempts: 0,
    lastError: null,
    scheduledFor: NOW,
    processedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe("mapOutboxEntry", () => {
  it("maps a row to camelCase", () => {
    const row: OutboxRow = {
      id: "o1",
      notification_id: "n1",
      channel: "push",
      status: "pending",
      attempts: 2,
      last_error: "boom",
      scheduled_for: NOW,
      processed_at: null,
      created_at: NOW,
    };
    expect(mapOutboxEntry(row)).toEqual({
      id: "o1",
      notificationId: "n1",
      channel: "push",
      status: "pending",
      attempts: 2,
      lastError: "boom",
      scheduledFor: NOW,
      processedAt: null,
      createdAt: NOW,
    });
  });
});

describe("backoff", () => {
  it("grows exponentially and caps", () => {
    expect(computeBackoffSeconds(1)).toBe(60);
    expect(computeBackoffSeconds(2)).toBe(120);
    expect(computeBackoffSeconds(3)).toBe(240);
    expect(computeBackoffSeconds(7)).toBe(3600); // 60*64=3840 capped to 3600
    expect(computeBackoffSeconds(0)).toBe(60); // clamped to attempt 1
    expect(computeBackoffSeconds(2, 30)).toBe(60);
  });
  it("computes the next retry timestamp, with a fallback for bad now", () => {
    expect(nextRetryAt(NOW, 1)).toBe("2026-06-25T12:01:00.000Z");
    expect(nextRetryAt(NOW, 2)).toBe("2026-06-25T12:02:00.000Z");
    // invalid now → still a valid ISO string (uses Date.now fallback)
    expect(() => new Date(nextRetryAt("not-a-date", 1)).toISOString()).not.toThrow();
  });
});

describe("resolveOutboxOutcome", () => {
  it("marks delivered entries sent", () => {
    expect(resolveOutboxOutcome({ attempts: 0, result: "delivered", nowIso: NOW })).toEqual({
      status: "sent",
      attempts: 1,
      scheduledFor: null,
      processedAt: NOW,
      lastError: null,
      retried: false,
      deadLettered: false,
    });
  });

  it("dead-letters permanent failures immediately (default + custom error)", () => {
    expect(
      resolveOutboxOutcome({ attempts: 0, result: "permanent_failure", nowIso: NOW }),
    ).toMatchObject({
      status: "failed",
      attempts: 1,
      deadLettered: true,
      lastError: "Permanent delivery failure",
    });
    expect(
      resolveOutboxOutcome({
        attempts: 0,
        result: "permanent_failure",
        nowIso: NOW,
        error: "bad addr",
      }).lastError,
    ).toBe("bad addr");
  });

  it("retries transient failures with backoff below the attempt cap", () => {
    const out = resolveOutboxOutcome({ attempts: 1, result: "transient_failure", nowIso: NOW });
    expect(out).toMatchObject({
      status: "pending",
      attempts: 2,
      processedAt: null,
      retried: true,
      deadLettered: false,
    });
    expect(out.scheduledFor).toBe("2026-06-25T12:02:00.000Z"); // backoff for attempt 2
    expect(out.lastError).toBe("Transient delivery failure");
  });

  it("dead-letters transient failures at the attempt cap (custom max + error)", () => {
    const out = resolveOutboxOutcome({
      attempts: 2,
      result: "transient_failure",
      nowIso: NOW,
      maxAttempts: 3,
      error: "timeout",
    });
    expect(out).toMatchObject({
      status: "failed",
      attempts: 3,
      scheduledFor: null,
      deadLettered: true,
      lastError: "timeout",
    });
  });

  it("uses the default max-attempts message at the cap", () => {
    expect(
      resolveOutboxOutcome({ attempts: 4, result: "transient_failure", nowIso: NOW }).lastError,
    ).toBe("Max delivery attempts reached");
  });
});

describe("queue helpers", () => {
  it("classifies terminal statuses", () => {
    expect(isTerminalOutboxStatus("sent")).toBe(true);
    expect(isTerminalOutboxStatus("failed")).toBe(true);
    expect(isTerminalOutboxStatus("skipped")).toBe(true);
    expect(isTerminalOutboxStatus("canceled")).toBe(true);
    expect(isTerminalOutboxStatus("pending")).toBe(false);
  });

  it("computes due-ness", () => {
    expect(isDue(entry({ scheduledFor: "2026-06-25T11:59:00.000Z" }), NOW)).toBe(true);
    expect(isDue(entry({ scheduledFor: "2026-06-25T12:00:00.000Z" }), NOW)).toBe(true);
    expect(isDue(entry({ scheduledFor: "2026-06-25T12:05:00.000Z" }), NOW)).toBe(false);
    expect(isDue(entry({ status: "sent" }), NOW)).toBe(false);
    expect(isDue(entry({ scheduledFor: "bad" }), NOW)).toBe(false);
  });

  it("selects an ordered, size-limited due batch without mutating input", () => {
    const rows = [
      entry({ id: "a", scheduledFor: "2026-06-25T11:50:00.000Z" }),
      entry({ id: "b", scheduledFor: "2026-06-25T12:30:00.000Z" }), // future, excluded
      entry({ id: "c", scheduledFor: "2026-06-25T11:30:00.000Z" }),
      entry({ id: "d", status: "sent", scheduledFor: "2026-06-25T11:00:00.000Z" }), // not pending
    ];
    const before = rows.map((r) => r.id);
    expect(selectDueBatch(rows, 10, NOW).map((r) => r.id)).toEqual(["c", "a"]);
    expect(selectDueBatch(rows, 1, NOW).map((r) => r.id)).toEqual(["c"]);
    expect(selectDueBatch(rows, 0, NOW)).toEqual([]);
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it("summarizes the queue by status + due-now", () => {
    const rows = [
      entry({ status: "pending", scheduledFor: "2026-06-25T11:00:00.000Z" }),
      entry({ status: "pending", scheduledFor: "2026-06-25T13:00:00.000Z" }),
      entry({ status: "sent" }),
      entry({ status: "failed" }),
      entry({ status: "skipped" }),
      entry({ status: "canceled" }),
    ];
    expect(summarizeOutbox(rows, NOW)).toEqual({
      total: 6,
      pending: 2,
      due: 1,
      sent: 1,
      failed: 1,
      skipped: 1,
      canceled: 1,
    });
  });

  it("labels statuses", () => {
    expect(outboxStatusLabel("pending")).toBe("Pending");
    expect(outboxStatusLabel("sent")).toBe("Sent");
    expect(outboxStatusLabel("canceled")).toBe("Canceled");
  });
});
