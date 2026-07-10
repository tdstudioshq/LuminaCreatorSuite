// ============================================================================
// CABANA — notifications & activity React hooks (Phase 7)
// ----------------------------------------------------------------------------
// React Query bindings over the notification server actions, plus Supabase
// Realtime for live in-app delivery: a channel on `notifications` filtered to
// the current recipient invalidates the list + unread count on insert/update.
// Realtime delivery is itself RLS-filtered, so a viewer only ever receives their
// own notifications. supabase-js handles reconnection automatically; the channel
// is removed on unmount (safe cleanup).
// ============================================================================
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/lib/cabana-auth";
import {
  getActivityFeed,
  getNotificationPreferences,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  updateNotificationPreferences,
} from "@/lib/notification-actions";

const notificationsKey = ["notifications"] as const;
const unreadKey = ["notifications-unread-count"] as const;
const activityKey = ["activity-feed"] as const;
const preferencesKey = ["notification-preferences"] as const;

// ─────────────────────────────── Realtime ───────────────────────────────────

// Monotonic id so each hook instance gets a unique channel topic. Several hooks
// (list + unread badge) subscribe for the same user; without a per-instance
// suffix they'd share the topic `notifications:<userId>`, and the second
// channel's binding would be added after the first has subscribed — which
// supabase-js rejects with "cannot add postgres_changes callbacks … after
// subscribe()". A unique topic per instance keeps each subscription independent.
let realtimeInstanceSeq = 0;

/**
 * Live in-app notification updates: invalidate the list + unread count whenever
 * a row for this recipient is inserted/updated. Cleans the channel up on unmount.
 */
function useNotificationsRealtime(userId: string | undefined) {
  const qc = useQueryClient();
  const instanceIdRef = useRef<number | undefined>(undefined);
  if (instanceIdRef.current === undefined) instanceIdRef.current = ++realtimeInstanceSeq;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`notifications:${userId}:${instanceIdRef.current}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      () => {
        qc.invalidateQueries({ queryKey: notificationsKey });
        qc.invalidateQueries({ queryKey: unreadKey });
        qc.invalidateQueries({ queryKey: activityKey });
      },
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

// ─────────────────────────────── Reads ──────────────────────────────────────

export function useNotifications(limit = 50) {
  const { user, loading } = useAuthSession();
  useNotificationsRealtime(user?.id);
  return useQuery({
    // Extends notificationsKey, so the prefix-matching realtime/mutation
    // invalidations still hit this query.
    queryKey: [...notificationsKey, limit],
    enabled: !loading && !!user,
    queryFn: () => getNotifications({ data: { limit } }),
    // Keep the current list visible while a raised limit refetches.
    placeholderData: (previous) => previous,
  });
}

export function useUnreadNotificationCount() {
  const { user, loading } = useAuthSession();
  useNotificationsRealtime(user?.id);
  return useQuery({
    queryKey: unreadKey,
    enabled: !loading && !!user,
    queryFn: () => getUnreadNotificationCount(),
  });
}

export function useActivityFeed() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: activityKey,
    enabled: !loading && !!user,
    queryFn: () => getActivityFeed(),
  });
}

export function useNotificationPreferences() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: preferencesKey,
    enabled: !loading && !!user,
    queryFn: () => getNotificationPreferences(),
  });
}

// ─────────────────────────────── Mutations ──────────────────────────────────

function useInvalidateNotifications() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: notificationsKey });
    qc.invalidateQueries({ queryKey: unreadKey });
  };
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead({ data: { notificationId } }),
    onSuccess: invalidate,
  });
}

export function useMarkNotificationUnread() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (notificationId: string) => markNotificationUnread({ data: { notificationId } }),
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      inAppEnabled?: boolean;
      emailEnabled?: boolean;
      pushEnabled?: boolean;
    }) => updateNotificationPreferences({ data: input }),
    onSuccess: (prefs) => qc.setQueryData(preferencesKey, prefs),
  });
}
