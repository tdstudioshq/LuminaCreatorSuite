import { useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useAuthSession } from "@/lib/cabana-auth";
import {
  useConversation,
  useDeleteMessage,
  useMarkConversationRead,
  useMessages,
} from "@/lib/use-messaging";
import { MessagesShell } from "./MessagesShell";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";

export function ConversationView({ conversationId }: { conversationId: string }) {
  const { user, loading } = useAuthSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const header = useConversation(conversationId);
  const { data: messages, isLoading, isError } = useMessages(conversationId);
  const markRead = useMarkConversationRead();
  const deleteMessage = useDeleteMessage(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: path } as never });
    }
  }, [loading, user, navigate, path]);

  // Mark read whenever new messages arrive (and on first load).
  useEffect(() => {
    if (!user || !messages) return;
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      markRead.mutate(conversationId);
      // Auto-scroll to the newest message.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, user, conversationId]);

  const other = header.data;

  return (
    <MessagesShell activeId={conversationId}>
      <header className="z-10 flex min-h-[76px] items-center gap-3.5 border-b border-white/[0.07] bg-background/55 px-5 py-3 backdrop-blur-2xl sm:px-6">
        <Link
          to="/messages"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label="Back to messages"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {other?.otherUsername ? (
          <Link
            to="/$username"
            params={{ username: other.otherUsername }}
            className="flex min-w-0 flex-1 items-center gap-3.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ConversationIdentity other={other} />
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <ConversationIdentity other={other} />
          </div>
        )}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-muted-foreground outline-none transition-all hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Conversation options"
          title="Conversation options"
          onClick={() => toast.info("Conversation settings are managed from your account.")}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[linear-gradient(180deg,transparent,oklch(0.2_0.02_280/0.13))] px-5 py-6 sm:px-8"
      >
        {loading || (user && isLoading) ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
            Couldn’t load this conversation.
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="mx-auto mt-[16vh] max-w-sm rounded-3xl border border-dashed border-white/[0.1] bg-white/[0.025] p-8 text-center text-sm text-muted-foreground">
            <p className="font-display text-lg font-semibold text-foreground">
              Start the conversation
            </p>
            <p className="mt-2">
              Send a private message to {other?.otherDisplayName ?? "this creator"}.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onDelete={(id) =>
                void deleteMessage
                  .mutateAsync(id)
                  .catch((e) =>
                    toast.error(e instanceof Error ? e.message : "Couldn’t delete message."),
                  )
              }
            />
          ))
        )}
        {/* Typing indicator — visual placeholder for future realtime presence. */}
        <TypingIndicator active={false} name={other?.otherDisplayName ?? ""} />
      </div>

      {user && (
        <div className="sticky bottom-0 z-10 border-t border-white/[0.07] bg-background/75 px-4 py-3 backdrop-blur-2xl sm:px-6 sm:py-4">
          <MessageComposer conversationId={conversationId} />
        </div>
      )}
    </MessagesShell>
  );
}

function ConversationIdentity({
  other,
}: {
  other:
    | {
        otherAvatarUrl: string | null;
        otherDisplayName: string;
        otherUsername: string | null;
      }
    | null
    | undefined;
}) {
  return (
    <>
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5 text-xs font-medium ring-2 ring-white/[0.08]">
        {other?.otherAvatarUrl ? (
          <img src={other.otherAvatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          (other?.otherDisplayName ?? "?").charAt(0).toUpperCase()
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {other?.otherDisplayName ?? "Conversation"}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {other?.otherUsername ? `@${other.otherUsername}` : "Direct message"}
        </p>
      </div>
    </>
  );
}

function TypingIndicator({ active, name }: { active: boolean; name: string }) {
  if (!active) return null;
  return (
    <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
      <span>{name} is typing</span>
      <span className="flex gap-0.5">
        <span className="h-1 w-1 animate-bounce rounded-full bg-current" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0.15s]" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0.3s]" />
      </span>
    </div>
  );
}
