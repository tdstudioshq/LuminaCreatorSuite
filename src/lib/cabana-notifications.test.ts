import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import {
  NOTIFICATION_TYPES,
  NOTIFICATIONS_LIMIT_MAX,
  NOTIFICATIONS_PAGE_SIZE,
  activityLabel,
  buildMarkAllReadCommand,
  buildNotificationsListQuery,
  countUnread,
  defaultPreferences,
  evaluatePreference,
  formatNotification,
  groupNotificationsByDay,
  isNotificationType,
  isOutboxEligible,
  mapActivityEvent,
  mapNotification,
  mapPreferences,
  notificationTypeLabel,
  notificationDedupeKey,
  resolveNotificationTarget,
  type NotificationItem,
} from "@/lib/cabana-notifications";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type ActivityRow = Database["public"]["Tables"]["activity_events"]["Row"];

const NOW = Date.parse("2026-06-25T12:00:00.000Z");

function notifRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n1",
    recipient_id: "u1",
    actor_id: "u2",
    type: "new_follower",
    title: "X started following you",
    body: null,
    entity_type: "creator",
    entity_id: "c1",
    read_at: null,
    dedupe_key: "new_follower:c1:u2",
    created_at: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "n1",
    type: "new_follower",
    title: "t",
    body: null,
    entityType: null,
    entityId: null,
    actorId: null,
    isRead: false,
    createdAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe("mapNotification", () => {
  it("maps a row to camelCase and derives isRead", () => {
    expect(mapNotification(notifRow({ read_at: null }))).toEqual({
      id: "n1",
      type: "new_follower",
      title: "X started following you",
      body: null,
      entityType: "creator",
      entityId: "c1",
      actorId: "u2",
      isRead: false,
      createdAt: new Date(NOW).toISOString(),
    });
    expect(mapNotification(notifRow({ read_at: new Date(NOW).toISOString() })).isRead).toBe(true);
  });
});

describe("mapActivityEvent", () => {
  function actRow(metadata: ActivityRow["metadata"]): ActivityRow {
    return {
      id: "a1",
      actor_id: "u2",
      recipient_id: "u1",
      type: "tip_received",
      entity_type: "tip",
      entity_id: "t1",
      metadata,
      created_at: new Date(NOW).toISOString(),
    };
  }
  it("keeps object metadata", () => {
    expect(mapActivityEvent(actRow({ amount_cents: 500 })).metadata).toEqual({ amount_cents: 500 });
  });
  it("coerces array/null metadata to an empty object", () => {
    expect(mapActivityEvent(actRow([1, 2] as unknown as ActivityRow["metadata"])).metadata).toEqual(
      {},
    );
    expect(mapActivityEvent(actRow(null as unknown as ActivityRow["metadata"])).metadata).toEqual(
      {},
    );
  });
});

describe("mapPreferences", () => {
  it("returns defaults for null/undefined", () => {
    expect(mapPreferences(null)).toEqual({
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    });
    expect(mapPreferences(undefined)).toEqual(defaultPreferences());
  });
  it("maps a row", () => {
    expect(
      mapPreferences({
        user_id: "u1",
        in_app_enabled: false,
        email_enabled: true,
        push_enabled: true,
        created_at: "x",
        updated_at: "y",
      }),
    ).toEqual({ inAppEnabled: false, emailEnabled: true, pushEnabled: true });
  });
});

describe("formatNotification", () => {
  it("formats each type", () => {
    expect(formatNotification("new_follower", "Aria").title).toBe("Aria started following you");
    expect(formatNotification("post_liked", "Aria").title).toBe("Aria liked your post");
    expect(formatNotification("post_commented", "Aria", { preview: "nice" })).toEqual({
      title: "Aria commented on your post",
      body: "nice",
    });
    expect(formatNotification("post_commented", "Aria").body).toBeNull();
    expect(formatNotification("post_saved", "Aria").title).toBe("Aria saved your post");
    expect(formatNotification("new_subscriber", "Aria", { amount_cents: 500 })).toEqual({
      title: "Aria subscribed to you",
      body: "$5.00",
    });
    expect(formatNotification("tip_received", "Aria", { amount_cents: 500 }).title).toBe(
      "Aria sent you a $5.00 tip",
    );
    expect(formatNotification("tip_received", "Aria").title).toBe("Aria sent you a tip");
    expect(formatNotification("purchase_made", "Aria", { amount_cents: 900 }).title).toBe(
      "Aria unlocked your post ($9.00)",
    );
    expect(formatNotification("purchase_made", "Aria").title).toBe("Aria unlocked your post");
    expect(formatNotification("message_received", "Aria").title).toBe("Aria sent you a message");
    expect(formatNotification("payout_requested", null, { amount_cents: 1000 }).title).toBe(
      "Payout requested — $10.00",
    );
    expect(formatNotification("payout_requested", null).title).toBe("Payout requested");
    expect(formatNotification("system", null).title).toBe("Notification");
  });

  it("falls back to 'Someone' for missing/blank actor names", () => {
    expect(formatNotification("post_liked", null).title).toBe("Someone liked your post");
    expect(formatNotification("post_liked", "   ").title).toBe("Someone liked your post");
  });

  it("ignores non-numeric / non-finite amount metadata", () => {
    expect(formatNotification("tip_received", "Aria", { amount_cents: "x" }).title).toBe(
      "Aria sent you a tip",
    );
    expect(
      formatNotification("new_subscriber", "Aria", { amount_cents: Number.NaN }).body,
    ).toBeNull();
  });

  it("uses a non-USD currency from metadata", () => {
    expect(
      formatNotification("tip_received", "Aria", { amount_cents: 500, currency: "EUR" }).title,
    ).toBe("Aria sent you a €5.00 tip");
  });
});

describe("activityLabel", () => {
  it("maps known types and falls back", () => {
    expect(activityLabel("new_follower")).toBe("New follower");
    expect(activityLabel("purchase_made")).toBe("Content sale");
    expect(activityLabel("system")).toBe("System");
  });
});

describe("notificationTypeLabel", () => {
  it("maps notification types to compact labels", () => {
    expect(notificationTypeLabel("new_follower")).toBe("Follower");
    expect(notificationTypeLabel("post_commented")).toBe("Comment");
    expect(notificationTypeLabel("payout_requested")).toBe("Payout");
  });
});

describe("countUnread", () => {
  it("counts only unread items", () => {
    expect(countUnread([item({ isRead: false }), item({ isRead: true }), item()])).toBe(2);
    expect(countUnread([])).toBe(0);
  });
});

describe("groupNotificationsByDay", () => {
  const iso = (deltaMs: number) => new Date(NOW + deltaMs).toISOString();
  it("buckets into today / yesterday / this week / earlier in order", () => {
    const groups = groupNotificationsByDay(
      [
        item({ id: "earlier", createdAt: iso(-10 * 86_400_000) }),
        item({ id: "today", createdAt: iso(-1000) }),
        item({ id: "week", createdAt: iso(-3 * 86_400_000) }),
        item({ id: "yesterday", createdAt: iso(-1 * 86_400_000) }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["today", "yesterday", "this_week", "earlier"]);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].items[0].id).toBe("today");
  });

  it("treats an unparseable date as 'earlier'", () => {
    const groups = groupNotificationsByDay([item({ createdAt: "not-a-date" })], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("earlier");
  });

  it("defaults nowMs to Date.now()", () => {
    const groups = groupNotificationsByDay([item({ createdAt: new Date().toISOString() })]);
    expect(groups[0].key).toBe("today");
  });
});

describe("evaluatePreference / isOutboxEligible", () => {
  const prefs = { inAppEnabled: true, emailEnabled: true, pushEnabled: false };
  it("evaluates each channel", () => {
    expect(evaluatePreference(prefs, "in_app")).toBe(true);
    expect(evaluatePreference(prefs, "email")).toBe(true);
    expect(evaluatePreference(prefs, "push")).toBe(false);
    expect(evaluatePreference(prefs, "sms" as never)).toBe(false);
  });
  it("in_app is never outbox-eligible; email/push follow prefs", () => {
    expect(isOutboxEligible(prefs, "in_app")).toBe(false);
    expect(isOutboxEligible(prefs, "email")).toBe(true);
    expect(isOutboxEligible(prefs, "push")).toBe(false);
  });
});

describe("notificationDedupeKey", () => {
  it("joins type + parts with ':' (mirrors SQL)", () => {
    expect(notificationDedupeKey("new_follower", "c1", "u2")).toBe("new_follower:c1:u2");
    expect(notificationDedupeKey("post_commented", "cmt-1")).toBe("post_commented:cmt-1");
    expect(notificationDedupeKey("tip_received", 42)).toBe("tip_received:42");
  });
});

describe("resolveNotificationTarget", () => {
  it("routes post and message notifications to their entity detail pages", () => {
    expect(
      resolveNotificationTarget({
        type: "post_liked",
        entityType: "post",
        entityId: "post-1",
      }),
    ).toEqual({ href: "/post/post-1", label: "Open post" });
    expect(
      resolveNotificationTarget({
        type: "message_received",
        entityType: "conversation",
        entityId: "conv-1",
      }),
    ).toEqual({ href: "/messages/conv-1", label: "Open conversation" });
  });

  it("routes creator and payout notifications to dashboard surfaces", () => {
    expect(
      resolveNotificationTarget({
        type: "new_subscriber",
        entityType: "creator",
        entityId: "creator-1",
      }),
    ).toEqual({ href: "/dashboard/subscribers", label: "View subscribers" });
    expect(
      resolveNotificationTarget({
        type: "tip_received",
        entityType: "tip",
        entityId: "tip-1",
      }),
    ).toEqual({ href: "/dashboard/earnings", label: "View earnings" });
  });

  it("returns null when no safe destination exists", () => {
    expect(resolveNotificationTarget({ type: "system", entityType: null, entityId: null })).toBe(
      null,
    );
    expect(
      resolveNotificationTarget({
        type: "post_saved",
        entityType: "post",
        entityId: null,
      }),
    ).toBeNull();
  });
});

describe("NOTIFICATION_TYPES / isNotificationType", () => {
  it("enumerates all ten notification types in display order", () => {
    expect(NOTIFICATION_TYPES).toEqual([
      "new_follower",
      "post_liked",
      "post_commented",
      "post_saved",
      "new_subscriber",
      "tip_received",
      "purchase_made",
      "message_received",
      "payout_requested",
      "system",
    ]);
  });

  it("accepts every enumerated type and rejects everything else", () => {
    for (const type of NOTIFICATION_TYPES) expect(isNotificationType(type)).toBe(true);
    expect(isNotificationType("all")).toBe(false);
    expect(isNotificationType("")).toBe(false);
    expect(isNotificationType("liked")).toBe(false);
    expect(isNotificationType(undefined)).toBe(false);
    expect(isNotificationType(null)).toBe(false);
    expect(isNotificationType(3)).toBe(false);
  });
});

describe("buildNotificationsListQuery", () => {
  it("defaults to one unfiltered page", () => {
    expect(buildNotificationsListQuery()).toEqual({
      limit: NOTIFICATIONS_PAGE_SIZE,
      unreadOnly: false,
      type: null,
    });
    expect(buildNotificationsListQuery({})).toEqual({
      limit: NOTIFICATIONS_PAGE_SIZE,
      unreadOnly: false,
      type: null,
    });
  });

  it("clamps the limit to 1..NOTIFICATIONS_LIMIT_MAX and truncates fractions", () => {
    expect(buildNotificationsListQuery({ limit: 100 }).limit).toBe(100);
    expect(buildNotificationsListQuery({ limit: 0 }).limit).toBe(1);
    expect(buildNotificationsListQuery({ limit: -5 }).limit).toBe(1);
    expect(buildNotificationsListQuery({ limit: 10_000 }).limit).toBe(NOTIFICATIONS_LIMIT_MAX);
    expect(buildNotificationsListQuery({ limit: 33.9 }).limit).toBe(33);
    expect(buildNotificationsListQuery({ limit: "75" }).limit).toBe(75);
  });

  it("throws on a non-numeric limit instead of widening the read", () => {
    expect(() => buildNotificationsListQuery({ limit: "lots" })).toThrow("Invalid limit.");
    expect(() => buildNotificationsListQuery({ limit: Number.NaN })).toThrow("Invalid limit.");
  });

  it("treats unreadOnly as true only on a literal true", () => {
    expect(buildNotificationsListQuery({ unreadOnly: true }).unreadOnly).toBe(true);
    expect(buildNotificationsListQuery({ unreadOnly: "true" }).unreadOnly).toBe(false);
    expect(buildNotificationsListQuery({ unreadOnly: 1 }).unreadOnly).toBe(false);
    expect(buildNotificationsListQuery({ unreadOnly: undefined }).unreadOnly).toBe(false);
  });

  it("passes known types through, maps all/null to unfiltered, and rejects unknowns", () => {
    expect(buildNotificationsListQuery({ type: "tip_received" }).type).toBe("tip_received");
    expect(buildNotificationsListQuery({ type: "all" }).type).toBeNull();
    expect(buildNotificationsListQuery({ type: null }).type).toBeNull();
    expect(() => buildNotificationsListQuery({ type: "spam" })).toThrow(
      "Invalid notification type filter.",
    );
    expect(() => buildNotificationsListQuery({ type: 7 })).toThrow(
      "Invalid notification type filter.",
    );
  });
});

describe("buildMarkAllReadCommand", () => {
  it("scopes the write to exactly the caller's recipient id and only unread rows", () => {
    const command = buildMarkAllReadCommand("user-1", NOW);
    expect(command.recipientId).toBe("user-1");
    expect(command.onlyUnread).toBe(true);
    expect(command.readAt).toBe(new Date(NOW).toISOString());
  });

  it("refuses to build an unscoped command (missing/blank/non-string recipient)", () => {
    expect(() => buildMarkAllReadCommand("", NOW)).toThrow(
      "A recipient id is required to mark notifications read.",
    );
    expect(() => buildMarkAllReadCommand("   ", NOW)).toThrow(
      "A recipient id is required to mark notifications read.",
    );
    expect(() => buildMarkAllReadCommand(undefined, NOW)).toThrow(
      "A recipient id is required to mark notifications read.",
    );
    expect(() => buildMarkAllReadCommand(null, NOW)).toThrow(
      "A recipient id is required to mark notifications read.",
    );
  });

  it("rejects a non-finite timestamp", () => {
    expect(() => buildMarkAllReadCommand("user-1", Number.NaN)).toThrow("Invalid timestamp.");
  });
});
