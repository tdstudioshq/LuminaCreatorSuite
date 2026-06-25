import { useState } from "react";
import { format } from "date-fns";
import { Send } from "lucide-react";
import type { MemberProfile } from "@/lib/cabana-types";
import { CABANA_DEMO_DATA, DEMO_CREATOR_USER_ID } from "@/lib/cabana-demo-data";
import { DemoNotice, DemoPageHeader } from "@/components/cabana/demo/DemoShell";

export function DemoMessages() {
  const { conversations, messages, members } = CABANA_DEMO_DATA;
  const memberByUserId = new Map<string, MemberProfile>(members.map((m) => [m.userId, m]));

  const [activeId, setActiveId] = useState(conversations[0]?.id ?? "");
  const activeConversation = conversations.find((c) => c.id === activeId) ?? conversations[0];

  function otherMember(participantUserIds: string[]): MemberProfile | undefined {
    const otherId = participantUserIds.find((id) => id !== DEMO_CREATOR_USER_ID);
    return otherId ? memberByUserId.get(otherId) : undefined;
  }

  const threadMessages = messages
    .filter((m) => m.conversationId === activeConversation?.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="space-y-8">
      <DemoPageHeader
        eyebrow="Inbox"
        title="Messages"
        description="A preview of the creator inbox built from demo conversations. Sending, attachments, paid messages, and realtime delivery are not active in this phase."
      />

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
        <div className="glass overflow-hidden rounded-3xl">
          <div className="border-b border-border/50 px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Conversations
          </div>
          <ul>
            {conversations.map((conversation) => {
              const member = otherMember(conversation.participantUserIds);
              const isActive = conversation.id === activeConversation?.id;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(conversation.id)}
                    className={`flex w-full items-center gap-3 border-b border-border/40 px-5 py-4 text-left transition-colors last:border-b-0 ${
                      isActive ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-iridescent text-sm font-semibold text-background">
                      {(member?.displayName ?? "?").charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {member?.displayName ?? "Member"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        @{member?.username ?? "member"}
                      </div>
                    </div>
                    {conversation.lastMessageAt ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {format(new Date(conversation.lastMessageAt), "MMM d")}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="glass flex min-h-[24rem] flex-col rounded-3xl">
          <div className="border-b border-border/50 px-6 py-4">
            <div className="text-sm font-medium">
              {otherMember(activeConversation?.participantUserIds ?? [])?.displayName ?? "Member"}
            </div>
            <div className="text-xs text-muted-foreground">Direct message · demo thread</div>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
            {threadMessages.map((message) => {
              const fromCreator = message.senderUserId === DEMO_CREATOR_USER_ID;
              return (
                <div
                  key={message.id}
                  className={`flex ${fromCreator ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                      fromCreator
                        ? "bg-iridescent text-background"
                        : "glass-strong text-foreground/90"
                    }`}
                  >
                    <p>{message.body}</p>
                    <div
                      className={`mt-1 text-[10px] tabular-nums ${
                        fromCreator ? "text-background/70" : "text-muted-foreground"
                      }`}
                    >
                      {format(new Date(message.createdAt), "MMM d, h:mm a")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 border-t border-border/50 p-4">
            <input
              type="text"
              disabled
              placeholder="Sending is disabled in the demo"
              className="field-luxury flex-1 cursor-not-allowed opacity-60"
              aria-label="Message (disabled in demo)"
            />
            <button
              type="button"
              disabled
              className="btn-luxury !px-4 !py-2.5 cursor-not-allowed opacity-60"
              aria-label="Send (disabled in demo)"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <DemoNotice>
        Demo conversations from the mock data layer. No message is sent or stored, and no private
        member data is loaded.
      </DemoNotice>
    </div>
  );
}
