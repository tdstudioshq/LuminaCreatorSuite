// ============================================================================
// CABANA — protected messaging server actions (Phase 5)
// ----------------------------------------------------------------------------
// All run under the caller's RLS (`attachSupabaseToken` + `requireSupabaseAuth`).
// Participant scoping and block enforcement live in SQL (RLS + SECURITY DEFINER
// helpers/RPCs) — never the service role. Conversation creation and aggregate
// reads go through ID-free RPCs. Must stay outside any `**/server/**` path.
//
// Not in this phase: paid messages, tips, attachments, notifications/push.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  type Conversation,
  type ConversationHeader,
  type Message,
  type MessagingRepository,
  deleteMessageForUser,
  editMessageForUser,
  mapConversation,
  mapConversationHeader,
  mapMessage,
  sendMessageForUser,
  startConversationForUser,
} from "@/lib/cabana-messaging";

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID.test(raw)) throw new Error(`A valid ${label} is required.`);
  return raw.toLowerCase();
}

function cursor(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) throw new Error("Invalid cursor.");
  return raw;
}

/** Clamp an optional numeric limit to 1..max (the RPC's own server-side cap). */
function clampLimit(raw: unknown, fallback: number, max: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error("Invalid limit.");
  return Math.min(max, Math.max(1, Math.trunc(n)));
}

/** Build a MessagingRepository over the caller's RLS-scoped client. */
function createMessagingRepository(supabase: Db, userId: string): MessagingRepository {
  return {
    async createDirectConversation(otherUserId) {
      const { data, error } = await supabase.rpc("create_direct_conversation", {
        _other_user_id: otherUserId,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Could not start the conversation.");
      return data as string;
    },
    async sendMessage(conversationId, body) {
      const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: userId, body, message_type: "text" });
      if (error) throw new Error(error.message);
    },
    async editMessage(messageId, body) {
      const { error } = await supabase
        .from("messages")
        .update({ body, edited_at: new Date().toISOString() })
        .eq("id", messageId)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
    },
    async deleteMessage(messageId) {
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId);
      if (error) throw new Error(error.message);
    },
  };
}

// ─────────────────────────────── Conversations ──────────────────────────────

export const createConversation = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { otherUserId?: unknown }) => ({
    otherUserId: uuid(raw?.otherUserId, "user id"),
  }))
  .handler(async ({ context, data }): Promise<{ conversationId: string }> => {
    const { supabase, userId } = context;
    const repo = createMessagingRepository(supabase as Db, userId);
    const conversationId = await startConversationForUser(repo, userId, data.otherUserId);
    return { conversationId };
  });

/** Start (or reuse) a conversation with a creator/member by username. */
export const startConversationWithUsername = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { username?: unknown }) => {
    if (typeof raw?.username !== "string" || raw.username.trim() === "") {
      throw new Error("A recipient username is required.");
    }
    return { username: raw.username.trim().toLowerCase() };
  })
  .handler(async ({ context, data }): Promise<{ conversationId: string }> => {
    const { data: cid, error } = await (context.supabase as Db).rpc(
      "start_conversation_with_username",
      { _username: data.username },
    );
    if (error) throw new Error(error.message);
    if (!cid) throw new Error("Could not start the conversation.");
    return { conversationId: cid as string };
  });

export const getConversations = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<Conversation[]> => {
    const { data, error } = await (context.supabase as Db).rpc("list_conversations");
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapConversation);
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { conversationId?: unknown }) => ({
    conversationId: uuid(raw?.conversationId, "conversation id"),
  }))
  .handler(async ({ context, data }): Promise<ConversationHeader | null> => {
    const { data: rows, error } = await (context.supabase as Db).rpc("conversation_header", {
      _conversation_id: data.conversationId,
    });
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    return row ? mapConversationHeader(row) : null;
  });

// ─────────────────────────────── Messages ───────────────────────────────────

export const getMessages = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { conversationId?: unknown; cursor?: unknown; limit?: unknown }) => ({
    conversationId: uuid(raw?.conversationId, "conversation id"),
    cursor: cursor(raw?.cursor),
    limit: clampLimit(raw?.limit, 50, 100),
  }))
  .handler(async ({ context, data }): Promise<Message[]> => {
    const { data: rows, error } = await (context.supabase as Db).rpc("conversation_messages", {
      _conversation_id: data.conversationId,
      _cursor: data.cursor ?? undefined,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    // RPC returns newest-first; present oldest-first for the thread.
    return (rows ?? []).map(mapMessage).reverse();
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { conversationId?: unknown; body?: unknown }) => ({
    conversationId: uuid(raw?.conversationId, "conversation id"),
    body: raw?.body,
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const repo = createMessagingRepository(supabase as Db, userId);
    await sendMessageForUser(repo, data.conversationId, data.body);
    return { ok: true };
  });

export const editMessage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { messageId?: unknown; body?: unknown }) => ({
    messageId: uuid(raw?.messageId, "message id"),
    body: raw?.body,
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const repo = createMessagingRepository(supabase as Db, userId);
    await editMessageForUser(repo, data.messageId, data.body);
    return { ok: true };
  });

export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { messageId?: unknown }) => ({
    messageId: uuid(raw?.messageId, "message id"),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const repo = createMessagingRepository(supabase as Db, userId);
    await deleteMessageForUser(repo, data.messageId);
    return { ok: true };
  });

// ─────────────────────────────── Read state ─────────────────────────────────

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { conversationId?: unknown }) => ({
    conversationId: uuid(raw?.conversationId, "conversation id"),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await (context.supabase as Db).rpc("mark_conversation_read", {
      _conversation_id: data.conversationId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUnreadCount = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const { data, error } = await (context.supabase as Db).rpc("unread_message_count");
    if (error) throw new Error(error.message);
    return typeof data === "string" ? Number(data) : (data ?? 0);
  });
