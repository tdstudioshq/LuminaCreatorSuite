// ============================================================================
// CABANA — notifications & activity domain layer (PURE)
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. Single source of
// truth for the Phase 7 notifications/activity slice: row → domain mapping,
// title/body formatting, grouping, unread counts, preference + outbox
// evaluation, and the idempotency-key scheme that mirrors the SQL triggers.
// The server actions (`notification-actions.ts`) and hooks (`use-notifications.ts`)
// delegate display + rule logic here so it stays testable without a DB.
//
// DEMO / internal only: email/push are placeholder channels with no provider.
// ============================================================================
import type { Database, Json } from "@/integrations/supabase/types";
import { formatMoney } from "@/lib/cabana-money";

export type NotificationType = Database["public"]["Enums"]["notification_type"];
export type ActivityType = Database["public"]["Enums"]["activity_type"];
export type NotificationChannel = Database["public"]["Enums"]["notification_channel"];

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type ActivityRow = Database["public"]["Tables"]["activity_events"]["Row"];
type PreferencesRow = Database["public"]["Tables"]["notification_preferences"]["Row"];

// ─────────────────────────────── Domain types ───────────────────────────────

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  isRead: boolean;
  createdAt: string;
};

export type ActivityItem = {
  id: string;
  type: ActivityType;
  actorId: string | null;
  recipientId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, Json>;
  createdAt: string;
};

export type NotificationPreferences = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
};

export type NotificationGroup = {
  key: string;
  label: string;
  items: NotificationItem[];
};

const DAY_MS = 86_400_000;

// ─────────────────────────────── Mappers ────────────────────────────────────

export function mapNotification(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorId: row.actor_id,
    isRead: row.read_at !== null,
    createdAt: row.created_at,
  };
}

export function mapActivityEvent(row: ActivityRow): ActivityItem {
  return {
    id: row.id,
    type: row.type,
    actorId: row.actor_id,
    recipientId: row.recipient_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, Json>)
        : {},
    createdAt: row.created_at,
  };
}

/** Map a preferences row (or null/missing) to the domain shape with safe defaults. */
export function mapPreferences(row: PreferencesRow | null | undefined): NotificationPreferences {
  if (!row) return defaultPreferences();
  return {
    inAppEnabled: row.in_app_enabled,
    emailEnabled: row.email_enabled,
    pushEnabled: row.push_enabled,
  };
}

export function defaultPreferences(): NotificationPreferences {
  return { inAppEnabled: true, emailEnabled: false, pushEnabled: false };
}

// ─────────────────────────────── Formatting ─────────────────────────────────

function moneyFromMetadata(metadata: Record<string, unknown>): string | null {
  const cents = metadata.amount_cents;
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  const currency = typeof metadata.currency === "string" ? metadata.currency : "USD";
  return formatMoney(cents, currency);
}

/**
 * Derive a display title/body for an event from its type + actor + metadata.
 * Used by the activity feed (and reusable for a future email/push renderer); the
 * `notifications` rows already carry a server-generated title/body for in-app.
 */
export function formatNotification(
  type: NotificationType | ActivityType,
  actorName: string | null,
  metadata: Record<string, unknown> = {},
): { title: string; body: string | null } {
  const who = actorName?.trim() || "Someone";
  switch (type) {
    case "new_follower":
      return { title: `${who} started following you`, body: null };
    case "post_liked":
      return { title: `${who} liked your post`, body: null };
    case "post_commented":
      return {
        title: `${who} commented on your post`,
        body: typeof metadata.preview === "string" ? metadata.preview : null,
      };
    case "post_saved":
      return { title: `${who} saved your post`, body: null };
    case "new_subscriber":
      return { title: `${who} subscribed to you`, body: moneyFromMetadata(metadata) };
    case "tip_received": {
      const amount = moneyFromMetadata(metadata);
      return {
        title: amount ? `${who} sent you a ${amount} tip` : `${who} sent you a tip`,
        body: null,
      };
    }
    case "purchase_made": {
      const amount = moneyFromMetadata(metadata);
      return {
        title: amount ? `${who} unlocked your post (${amount})` : `${who} unlocked your post`,
        body: null,
      };
    }
    case "message_received":
      return { title: `${who} sent you a message`, body: null };
    case "payout_requested": {
      const amount = moneyFromMetadata(metadata);
      return { title: amount ? `Payout requested — ${amount}` : "Payout requested", body: null };
    }
    case "system":
    default:
      return { title: "Notification", body: null };
  }
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  new_follower: "New follower",
  post_liked: "Post liked",
  post_commented: "New comment",
  post_saved: "Post saved",
  new_subscriber: "New subscriber",
  tip_received: "Tip received",
  purchase_made: "Content sale",
  message_received: "New message",
  payout_requested: "Payout requested",
  system: "System",
};

/** Short category label for an activity-feed row. */
export function activityLabel(type: ActivityType): string {
  return ACTIVITY_LABELS[type] ?? "Activity";
}

// ─────────────────────────────── Unread + grouping ──────────────────────────

export function countUnread(items: readonly NotificationItem[]): number {
  let n = 0;
  for (const item of items) if (!item.isRead) n += 1;
  return n;
}

function dayBucket(createdAtMs: number, nowMs: number): { key: string; label: string } {
  const startOfToday = nowMs - (nowMs % DAY_MS);
  if (createdAtMs >= startOfToday) return { key: "today", label: "Today" };
  if (createdAtMs >= startOfToday - DAY_MS) return { key: "yesterday", label: "Yesterday" };
  if (createdAtMs >= startOfToday - 7 * DAY_MS)
    return { key: "this_week", label: "Earlier this week" };
  return { key: "earlier", label: "Earlier" };
}

/**
 * Group notifications into Today / Yesterday / Earlier this week / Earlier
 * buckets, preserving input order within each (callers pass newest-first).
 * `nowMs` is explicit for deterministic tests.
 */
export function groupNotificationsByDay(
  items: readonly NotificationItem[],
  nowMs: number = Date.now(),
): NotificationGroup[] {
  const order = ["today", "yesterday", "this_week", "earlier"] as const;
  const groups = new Map<string, NotificationGroup>();
  for (const item of items) {
    const ms = Date.parse(item.createdAt);
    const { key, label } = Number.isNaN(ms)
      ? { key: "earlier", label: "Earlier" }
      : dayBucket(ms, nowMs);
    let group = groups.get(key);
    if (!group) {
      group = { key, label, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return order.filter((k) => groups.has(k)).map((k) => groups.get(k)!);
}

// ─────────────────────────────── Preferences + outbox ───────────────────────

/** Whether a channel is enabled in the given preferences. */
export function evaluatePreference(
  prefs: NotificationPreferences,
  channel: NotificationChannel,
): boolean {
  switch (channel) {
    case "in_app":
      return prefs.inAppEnabled;
    case "email":
      return prefs.emailEnabled;
    case "push":
      return prefs.pushEnabled;
    default:
      return false;
  }
}

/**
 * Whether a notification should be enqueued to the outbox for a channel. In-app
 * is delivered directly (never via the outbox); email/push enqueue only when the
 * recipient has enabled them. Mirrors the SQL `emit_notification` outbox logic.
 */
export function isOutboxEligible(
  prefs: NotificationPreferences,
  channel: NotificationChannel,
): boolean {
  if (channel === "in_app") return false;
  return evaluatePreference(prefs, channel);
}

// ─────────────────────────────── Idempotency keys ───────────────────────────

/**
 * Deterministic dedupe key for an event, mirroring the SQL triggers' scheme
 * (`type:part:part…`). Re-emitting the same event yields the same key, so the
 * unique `notifications.dedupe_key` makes generation idempotent.
 */
export function notificationDedupeKey(
  type: NotificationType,
  ...parts: Array<string | number>
): string {
  return [type, ...parts.map(String)].join(":");
}
