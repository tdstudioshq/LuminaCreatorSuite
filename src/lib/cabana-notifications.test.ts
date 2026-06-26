import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import {
  activityLabel,
  countUnread,
  defaultPreferences,
  evaluatePreference,
  formatNotification,
  groupNotificationsByDay,
  isOutboxEligible,
  mapActivityEvent,
  mapNotification,
  mapPreferences,
  notificationDedupeKey,
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
