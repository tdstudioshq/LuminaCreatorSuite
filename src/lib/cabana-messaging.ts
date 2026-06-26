// ============================================================================
// CABANA — messaging domain layer (PURE)
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. Validation, preview/
// unread math, sorting, edit/delete rules, and row→domain mapping for the Phase
// 5 messaging foundation. Behavior is repository-injected so the server actions
// stay thin and the rules are unit-testable without a DB. Block and participant
// enforcement live authoritatively in SQL RLS/RPCs; this layer enforces shape +
// self-message + length + edit/delete rules.
// ============================================================================
import type { Database } from "@/integrations/supabase/types";

export type MessageType = Database["public"]["Enums"]["message_type"];

export const MESSAGE_BODY_MAX = 4000;
export const PREVIEW_MAX = 80;

// ─────────────────────────────── Domain types ───────────────────────────────

export type Conversation = {
  conversationId: string;
  otherUsername: string | null;
  otherDisplayName: string;
  otherAvatarUrl: string | null;
  lastMessagePreview: string;
  lastMessageType: MessageType | null;
  lastMessageAt: string | null;
  unreadCount: number;
  updatedAt: string;
};

export type Message = {
  id: string;
  senderUsername: string | null;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  body: string;
  type: MessageType;
  mine: boolean;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
};

export type ConversationHeader = {
  conversationId: string;
  otherUsername: string | null;
  otherDisplayName: string;
  otherAvatarUrl: string | null;
};

// ─────────────────────────────── Validation ─────────────────────────────────

export function normalizeMessageBody(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Message must be text.");
  const body = raw.trim();
  if (body.length < 1) throw new Error("Message cannot be empty.");
  if (body.length > MESSAGE_BODY_MAX) {
    throw new Error(`Message must be ${MESSAGE_BODY_MAX} characters or fewer.`);
  }
  return body;
}

/** Guard against opening a conversation with yourself. */
export function assertDistinctUsers(selfUserId: string, otherUserId: string): void {
  if (selfUserId === otherUserId) {
    throw new Error("You cannot message yourself.");
  }
}

// ─────────────────────────── Preview / unread / sort ────────────────────────

export function messagePreview(input: {
  body: string | null;
  isDeleted?: boolean;
  type?: MessageType | null;
  max?: number;
}): string {
  if (input.isDeleted) return "Message deleted";
  const body = (input.body ?? "").trim();
  if (!body) return "";
  const max = input.max ?? PREVIEW_MAX;
  return body.length > max ? `${body.slice(0, max).trimEnd()}…` : body;
}

/** Total unread across a set of conversations. */
export function sumUnread(conversations: { unreadCount: number }[]): number {
  return conversations.reduce((total, c) => total + Math.max(0, c.unreadCount), 0);
}

/** Newest-activity-first ordering for the inbox. */
export function sortConversations<T extends { updatedAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

// ───────────────────────────── Edit / delete rules ──────────────────────────

export function canEditMessage(message: Pick<Message, "mine" | "isDeleted">): boolean {
  return message.mine && !message.isDeleted;
}

export function canDeleteMessage(message: Pick<Message, "mine" | "isDeleted">): boolean {
  return message.mine && !message.isDeleted;
}

// ─────────────────────────────── Mappers ────────────────────────────────────

type RawConversationRow = {
  conversation_id: string;
  other_username?: string | null;
  other_display_name?: string | null;
  other_avatar_url?: string | null;
  last_message_preview?: string | null;
  last_message_type?: MessageType | null;
  last_message_at?: string | null;
  unread_count?: number | string | null;
  updated_at: string;
};

export function mapConversation(row: RawConversationRow): Conversation {
  const username = row.other_username ?? null;
  const unread =
    typeof row.unread_count === "string" ? Number(row.unread_count) : (row.unread_count ?? 0);
  return {
    conversationId: row.conversation_id,
    otherUsername: username,
    otherDisplayName: row.other_display_name ?? username ?? "Member",
    otherAvatarUrl: row.other_avatar_url ?? null,
    lastMessagePreview: messagePreview({
      body: row.last_message_preview ?? "",
      type: row.last_message_type ?? null,
    }),
    lastMessageType: row.last_message_type ?? null,
    lastMessageAt: row.last_message_at ?? null,
    unreadCount: Number.isFinite(unread) && unread > 0 ? Math.floor(unread as number) : 0,
    updatedAt: row.updated_at,
  };
}

type RawMessageRow = {
  message_id: string;
  sender_username?: string | null;
  sender_display_name?: string | null;
  sender_avatar_url?: string | null;
  body?: string | null;
  message_type: MessageType;
  mine?: boolean | null;
  is_deleted?: boolean | null;
  created_at: string;
  edited_at?: string | null;
};

export function mapMessage(row: RawMessageRow): Message {
  const username = row.sender_username ?? null;
  return {
    id: row.message_id,
    senderUsername: username,
    senderDisplayName: row.sender_display_name ?? username ?? "Member",
    senderAvatarUrl: row.sender_avatar_url ?? null,
    body: row.body ?? "",
    type: row.message_type,
    mine: row.mine === true,
    isDeleted: row.is_deleted === true,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
  };
}

type RawHeaderRow = {
  conversation_id: string;
  other_username?: string | null;
  other_display_name?: string | null;
  other_avatar_url?: string | null;
};

export function mapConversationHeader(row: RawHeaderRow): ConversationHeader {
  const username = row.other_username ?? null;
  return {
    conversationId: row.conversation_id,
    otherUsername: username,
    otherDisplayName: row.other_display_name ?? username ?? "Member",
    otherAvatarUrl: row.other_avatar_url ?? null,
  };
}

// ───────────────────────── Repository-injected behavior ─────────────────────

export type MessagingRepository = {
  createDirectConversation(otherUserId: string): Promise<string>;
  sendMessage(conversationId: string, body: string): Promise<void>;
  editMessage(messageId: string, body: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
};

export async function startConversationForUser(
  repo: MessagingRepository,
  selfUserId: string,
  otherUserId: string,
): Promise<string> {
  assertDistinctUsers(selfUserId, otherUserId);
  return repo.createDirectConversation(otherUserId);
}

export async function sendMessageForUser(
  repo: MessagingRepository,
  conversationId: string,
  rawBody: unknown,
): Promise<void> {
  await repo.sendMessage(conversationId, normalizeMessageBody(rawBody));
}

export async function editMessageForUser(
  repo: MessagingRepository,
  messageId: string,
  rawBody: unknown,
): Promise<void> {
  await repo.editMessage(messageId, normalizeMessageBody(rawBody));
}

export async function deleteMessageForUser(
  repo: MessagingRepository,
  messageId: string,
): Promise<void> {
  await repo.deleteMessage(messageId);
}
