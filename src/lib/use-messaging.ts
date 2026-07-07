// ============================================================================
// CABANA — messaging React hooks (Phase 5)
// ----------------------------------------------------------------------------
// React Query bindings over the messaging server actions, plus Supabase
// Realtime: live message delivery, live read receipts, and live inbox ordering.
// Realtime delivery is itself RLS-filtered (the publication tables are
// participant-gated), so a channel only ever surfaces rows the viewer may read.
// supabase-js handles reconnection/backoff automatically.
// ============================================================================
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/lib/cabana-auth";
import {
  createConversation,
  deleteMessage,
  editMessage,
  getConversation,
  getConversations,
  getMessages,
  getUnreadCount,
  markConversationRead,
  sendMessage,
  startConversationWithUsername,
} from "@/lib/messaging-actions";

const conversationsKey = ["conversations"] as const;
const unreadKey = ["unread-count"] as const;
const messagesKey = (cid: string) => ["messages", cid] as const;
const headerKey = (cid: string) => ["conversation-header", cid] as const;

/**
 * Subscribe to a postgres_changes stream and run `onChange` for each event.
 * Cleans the channel up on unmount / dependency change.
 */
// Monotonic id so each hook instance gets a unique channel topic.
let realtimeInstanceSeq = 0;

function useRealtime(
  enabled: boolean,
  channelName: string,
  bindings: { table: string; filter?: string }[],
  onChange: () => void,
) {
  // Serialize bindings so the effect re-runs only when they actually change.
  const bindingKey = JSON.stringify(bindings);
  // Unique per instance so two components subscribing to the same logical
  // channel (e.g. the inbox list and a global unread badge both using "unread")
  // don't share a topic — supabase-js rejects a second binding added after the
  // first channel with that topic has subscribed.
  const instanceIdRef = useRef<number | undefined>(undefined);
  if (instanceIdRef.current === undefined) instanceIdRef.current = ++realtimeInstanceSeq;
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel(`${channelName}:${instanceIdRef.current}`);
    for (const b of bindings) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: b.table, filter: b.filter },
        () => onChange(),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, channelName, bindingKey]);
}

// ─────────────────────────────── Reads ──────────────────────────────────────

export function useConversations() {
  const { user, loading } = useAuthSession();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: conversationsKey,
    enabled: !loading && !!user,
    queryFn: () => getConversations(),
  });
  useRealtime(!!user, "inbox", [{ table: "messages" }, { table: "message_read_receipts" }], () => {
    qc.invalidateQueries({ queryKey: conversationsKey });
    qc.invalidateQueries({ queryKey: unreadKey });
  });
  return query;
}

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: headerKey(conversationId ?? ""),
    enabled: !!conversationId,
    queryFn: () => getConversation({ data: { conversationId: conversationId! } }),
  });
}

export function useMessages(conversationId: string | null) {
  const qc = useQueryClient();
  const cid = conversationId ?? "";
  const query = useQuery({
    queryKey: messagesKey(cid),
    enabled: !!conversationId,
    queryFn: () => getMessages({ data: { conversationId: cid } }),
  });
  useRealtime(
    !!conversationId,
    `conversation:${cid}`,
    [{ table: "messages", filter: `conversation_id=eq.${cid}` }],
    () => {
      qc.invalidateQueries({ queryKey: messagesKey(cid) });
      qc.invalidateQueries({ queryKey: conversationsKey });
      qc.invalidateQueries({ queryKey: unreadKey });
    },
  );
  return query;
}

export function useUnreadMessages() {
  const { user, loading } = useAuthSession();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: unreadKey,
    enabled: !loading && !!user,
    queryFn: () => getUnreadCount(),
  });
  useRealtime(!!user, "unread", [{ table: "messages" }, { table: "message_read_receipts" }], () => {
    qc.invalidateQueries({ queryKey: unreadKey });
  });
  return query;
}

// ─────────────────────────────── Mutations ──────────────────────────────────

export function useCreateConversation() {
  return useMutation({
    mutationFn: (otherUserId: string) => createConversation({ data: { otherUserId } }),
  });
}

/** Start a conversation with a creator/member by username (public-page entry). */
export function useStartConversationWithUsername() {
  return useMutation({
    mutationFn: (username: string) => startConversationWithUsername({ data: { username } }),
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => sendMessage({ data: { conversationId, body } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
      qc.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

export function useEditMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; body: string }) => editMessage({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: messagesKey(conversationId) }),
  });
}

export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteMessage({ data: { messageId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
      qc.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => markConversationRead({ data: { conversationId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationsKey });
      qc.invalidateQueries({ queryKey: unreadKey });
    },
  });
}
