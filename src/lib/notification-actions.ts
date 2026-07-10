// ============================================================================
// CABANA — protected notifications & activity server actions (Phase 7)
// ----------------------------------------------------------------------------
// In-app notifications, unread counts, the activity feed, and per-user
// notification preferences. All run under the caller's RLS (`attachSupabaseToken`
// + `requireSupabaseAuth`) — a user reads only their own notifications/activity
// and manages only their own preferences. Notifications are SYSTEM-WRITTEN by the
// Phase 7 DB triggers (no client INSERT); clients may only flip `read_at`.
// No service role. Must stay outside any `**/server/**` path.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  type ActivityItem,
  type NotificationItem,
  type NotificationPreferences,
  mapActivityEvent,
  mapNotification,
  mapPreferences,
} from "@/lib/cabana-notifications";

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID.test(raw)) throw new Error(`A valid ${label} is required.`);
  return raw.toLowerCase();
}

function boolOrUndefined(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  return raw === true;
}

/** Clamp an optional numeric limit to 1..max. */
function clampLimit(raw: unknown, fallback: number, max: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error("Invalid limit.");
  return Math.min(max, Math.max(1, Math.trunc(n)));
}

// ─────────────────────────────── Reads ──────────────────────────────────────

// These are PERSONAL-center reads, so they filter to the caller explicitly.
// RLS stays the enforcement backstop, but it can't define "mine" here: the
// "Admins read all" SELECT policies would otherwise pour every user's private
// notifications/activity into an admin's own notification center.

/** The caller's notifications, newest first (limit clamped to 1..200, default 50). */
export const getNotifications = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { limit?: unknown } | undefined) => ({
    limit: clampLimit(raw?.limit, 50, 200),
  }))
  .handler(async ({ context, data }): Promise<NotificationItem[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapNotification);
  });

/** The caller's unread notification count. */
export const getUnreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const { supabase, userId } = context;
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  });

/** The caller's activity feed (events about/by them), newest first. */
export const getActivityFeed = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActivityItem[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("activity_events")
      .select("*")
      .or(`recipient_id.eq.${userId},actor_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapActivityEvent);
  });

/** The caller's notification preferences (defaults if no row exists yet). */
export const getNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPreferences> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mapPreferences(data);
  });

// ─────────────────────────────── Writes ─────────────────────────────────────

/** Mark a single notification read (RLS ensures it's the caller's own). */
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { notificationId?: unknown }) => ({
    notificationId: uuid(raw?.notificationId, "notification id"),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.notificationId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mark a single notification unread again (supported by the notifications table). */
export const markNotificationUnread = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { notificationId?: unknown }) => ({
    notificationId: uuid(raw?.notificationId, "notification id"),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: null })
      .eq("id", data.notificationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mark all of the caller's unread notifications read. */
export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Upsert the caller's notification preferences. */
export const updateNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(
    (raw: { inAppEnabled?: unknown; emailEnabled?: unknown; pushEnabled?: unknown }) => ({
      inAppEnabled: boolOrUndefined(raw?.inAppEnabled),
      emailEnabled: boolOrUndefined(raw?.emailEnabled),
      pushEnabled: boolOrUndefined(raw?.pushEnabled),
    }),
  )
  .handler(async ({ context, data }): Promise<NotificationPreferences> => {
    const { supabase, userId } = context;
    const patch: Database["public"]["Tables"]["notification_preferences"]["Insert"] = {
      user_id: userId,
    };
    if (data.inAppEnabled !== undefined) patch.in_app_enabled = data.inAppEnabled;
    if (data.emailEnabled !== undefined) patch.email_enabled = data.emailEnabled;
    if (data.pushEnabled !== undefined) patch.push_enabled = data.pushEnabled;
    const { data: row, error } = await (supabase as Db)
      .from("notification_preferences")
      .upsert(patch, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPreferences(row);
  });
