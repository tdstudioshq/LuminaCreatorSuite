import { describe, expect, it, vi } from "vitest";
import {
  MESSAGE_BODY_MAX,
  type MessagingRepository,
  assertDistinctUsers,
  canDeleteMessage,
  canEditMessage,
  deleteMessageForUser,
  editMessageForUser,
  mapConversation,
  mapConversationHeader,
  mapMessage,
  messagePreview,
  normalizeMessageBody,
  sendMessageForUser,
  sortConversations,
  startConversationForUser,
  sumUnread,
} from "./cabana-messaging";

describe("normalizeMessageBody", () => {
  it("trims valid bodies", () => {
    expect(normalizeMessageBody("  hey  ")).toBe("hey");
  });
  it("rejects non-string / empty / too long", () => {
    expect(() => normalizeMessageBody(1)).toThrow(/must be text/i);
    expect(() => normalizeMessageBody("   ")).toThrow(/empty/i);
    expect(() => normalizeMessageBody("x".repeat(MESSAGE_BODY_MAX + 1))).toThrow(/or fewer/i);
  });
});

describe("assertDistinctUsers", () => {
  it("throws on self", () => {
    expect(() => assertDistinctUsers("u1", "u1")).toThrow(/yourself/i);
  });
  it("passes for distinct", () => {
    expect(() => assertDistinctUsers("u1", "u2")).not.toThrow();
  });
});

describe("messagePreview", () => {
  it("shows deleted placeholder", () => {
    expect(messagePreview({ body: "hi", isDeleted: true })).toBe("Message deleted");
  });
  it("returns empty for blank", () => {
    expect(messagePreview({ body: "   " })).toBe("");
    expect(messagePreview({ body: null })).toBe("");
  });
  it("truncates long bodies", () => {
    expect(messagePreview({ body: "x".repeat(100), max: 10 })).toBe(`${"x".repeat(10)}…`);
  });
  it("passes short bodies through", () => {
    expect(messagePreview({ body: "short" })).toBe("short");
  });
});

describe("sumUnread / sortConversations", () => {
  it("sums non-negative unread", () => {
    expect(sumUnread([{ unreadCount: 2 }, { unreadCount: 3 }, { unreadCount: -1 }])).toBe(5);
  });
  it("sorts by updatedAt desc", () => {
    const out = sortConversations([
      { updatedAt: "2026-06-01T00:00:00Z", id: "a" },
      { updatedAt: "2026-06-03T00:00:00Z", id: "b" },
      { updatedAt: "2026-06-02T00:00:00Z", id: "c" },
    ]);
    expect(out.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});

describe("edit/delete rules", () => {
  it("allows only own undeleted", () => {
    expect(canEditMessage({ mine: true, isDeleted: false })).toBe(true);
    expect(canEditMessage({ mine: true, isDeleted: true })).toBe(false);
    expect(canEditMessage({ mine: false, isDeleted: false })).toBe(false);
    expect(canDeleteMessage({ mine: true, isDeleted: false })).toBe(true);
    expect(canDeleteMessage({ mine: false, isDeleted: false })).toBe(false);
  });
});

describe("mappers", () => {
  it("mapConversation maps and previews", () => {
    expect(
      mapConversation({
        conversation_id: "c1",
        other_username: "nova",
        other_display_name: "Nova",
        other_avatar_url: null,
        last_message_preview: "hello there",
        last_message_type: "text",
        last_message_at: "2026-06-25T00:00:00Z",
        unread_count: "3",
        updated_at: "2026-06-25T00:00:00Z",
      }),
    ).toEqual({
      conversationId: "c1",
      otherUsername: "nova",
      otherDisplayName: "Nova",
      otherAvatarUrl: null,
      lastMessagePreview: "hello there",
      lastMessageType: "text",
      lastMessageAt: "2026-06-25T00:00:00Z",
      unreadCount: 3,
      updatedAt: "2026-06-25T00:00:00Z",
    });
  });

  it("mapConversation falls back display name + clamps unread", () => {
    const c = mapConversation({
      conversation_id: "c2",
      other_username: null,
      other_display_name: null,
      unread_count: null,
      updated_at: "2026-06-25T00:00:00Z",
    });
    expect(c.otherDisplayName).toBe("Member");
    expect(c.unreadCount).toBe(0);
    expect(c.lastMessagePreview).toBe("");
  });

  it("mapConversation floors float counts and clamps negatives", () => {
    const base = {
      conversation_id: "c3",
      other_username: "x",
      updated_at: "2026-06-25T00:00:00Z",
    };
    expect(mapConversation({ ...base, unread_count: 3.7 }).unreadCount).toBe(3);
    expect(mapConversation({ ...base, unread_count: -5 }).unreadCount).toBe(0);
    expect(mapConversation({ ...base, unread_count: "nope" }).unreadCount).toBe(0);
  });

  it("mapMessage maps mine/deleted", () => {
    expect(
      mapMessage({
        message_id: "m1",
        sender_username: "nova",
        sender_display_name: "Nova",
        sender_avatar_url: "a.png",
        body: "yo",
        message_type: "text",
        mine: true,
        is_deleted: false,
        created_at: "2026-06-25T00:00:00Z",
        edited_at: null,
      }),
    ).toEqual({
      id: "m1",
      senderUsername: "nova",
      senderDisplayName: "Nova",
      senderAvatarUrl: "a.png",
      body: "yo",
      type: "text",
      mine: true,
      isDeleted: false,
      createdAt: "2026-06-25T00:00:00Z",
      editedAt: null,
    });
  });

  it("mapMessage falls back on sparse rows", () => {
    const m = mapMessage({
      message_id: "m2",
      message_type: "system",
      created_at: "2026-06-25T00:00:00Z",
    });
    expect(m.senderUsername).toBeNull();
    expect(m.senderDisplayName).toBe("Member");
    expect(m.senderAvatarUrl).toBeNull();
    expect(m.body).toBe("");
    expect(m.mine).toBe(false);
    expect(m.isDeleted).toBe(false);
    expect(m.editedAt).toBeNull();
  });

  it("mapConversationHeader falls back", () => {
    expect(
      mapConversationHeader({ conversation_id: "c1", other_username: "nova" }).otherDisplayName,
    ).toBe("nova");
    expect(
      mapConversationHeader({ conversation_id: "c1", other_display_name: null }).otherDisplayName,
    ).toBe("Member");
  });
});

describe("repository-injected behavior", () => {
  function fakeRepo(): MessagingRepository {
    return {
      createDirectConversation: vi.fn(async () => "conv-1"),
      sendMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {}),
      deleteMessage: vi.fn(async () => {}),
    };
  }

  it("startConversation rejects self and delegates otherwise", async () => {
    const repo = fakeRepo();
    await expect(startConversationForUser(repo, "u1", "u1")).rejects.toThrow(/yourself/i);
    await expect(startConversationForUser(repo, "u1", "u2")).resolves.toBe("conv-1");
    expect(repo.createDirectConversation).toHaveBeenCalledWith("u2");
  });

  it("sendMessage normalizes before persisting", async () => {
    const repo = fakeRepo();
    await sendMessageForUser(repo, "c1", "  hi  ");
    expect(repo.sendMessage).toHaveBeenCalledWith("c1", "hi");
    await expect(sendMessageForUser(repo, "c1", "  ")).rejects.toThrow(/empty/i);
  });

  it("editMessage normalizes; deleteMessage delegates", async () => {
    const repo = fakeRepo();
    await editMessageForUser(repo, "m1", " edited ");
    expect(repo.editMessage).toHaveBeenCalledWith("m1", "edited");
    await deleteMessageForUser(repo, "m1");
    expect(repo.deleteMessage).toHaveBeenCalledWith("m1");
  });
});
