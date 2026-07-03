import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessagesSquare, Search, SquarePen } from "lucide-react";
import { useConversations } from "@/lib/use-messaging";

/**
 * Middle pane of the messages layout: the scrollable conversation list with
 * the active thread highlighted. Structure-only; reuses existing glass styling.
 */
export function ConversationListPane({ activeId }: { activeId?: string }) {
  const { data: conversations, isLoading, isError } = useConversations();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleConversations = (conversations ?? []).filter((conversation) =>
    `${conversation.otherDisplayName} ${conversation.otherUsername ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery),
  );

  return (
    <div className="flex h-full flex-col bg-[oklch(0.12_0.014_280/0.78)] backdrop-blur-xl">
      <header className="border-b border-white/[0.07] px-5 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-primary">
              Inbox
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Messages</h1>
          </div>
          <Link
            to="/explore"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04] text-muted-foreground outline-none transition-all hover:border-primary/30 hover:bg-white/[0.08] hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Start a conversation"
            title="Start a conversation"
          >
            <SquarePen className="h-4 w-4" />
          </Link>
        </div>
        <label className="relative mt-4 block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search conversations</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            className="h-11 w-full rounded-full border border-white/[0.08] bg-white/[0.035] pl-10 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/40 focus:bg-white/[0.055] focus:ring-4 focus:ring-primary/10"
          />
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Couldn’t load your messages.
          </p>
        ) : !conversations || conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <MessagesSquare className="h-6 w-6" />
            No conversations yet. Start one from a creator’s page.
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="px-8 py-12 text-center text-sm text-muted-foreground">
            No conversations match “{query}”.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.055]">
            {visibleConversations.map((c) => {
              const isActive = c.conversationId === activeId;
              return (
                <li key={c.conversationId}>
                  <Link
                    to="/messages/$conversationId"
                    params={{ conversationId: c.conversationId }}
                    className={`group relative flex min-h-[82px] items-center gap-3.5 px-5 py-3 outline-none transition-all focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                      isActive
                        ? "bg-[linear-gradient(90deg,oklch(0.72_0.16_280/0.14),oklch(1_0_0/0.055))]"
                        : "hover:bg-white/[0.04]"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-iridescent shadow-glow-sm" />
                    )}
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5 text-sm font-medium ring-2 transition-all ${
                        isActive
                          ? "ring-primary/40"
                          : "ring-white/[0.07] group-hover:ring-white/[0.14]"
                      }`}
                    >
                      {c.otherAvatarUrl ? (
                        <img src={c.otherAvatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        c.otherDisplayName.charAt(0).toUpperCase()
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`truncate text-sm ${isActive ? "font-semibold text-foreground" : "font-medium"}`}
                        >
                          {c.otherDisplayName}
                        </p>
                        {c.lastMessageAt && (
                          <time className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(c.lastMessageAt), { addSuffix: true })}
                          </time>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {c.lastMessagePreview || "No messages yet"}
                      </p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-iridescent px-1.5 text-[10px] font-semibold text-background">
                        {c.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
