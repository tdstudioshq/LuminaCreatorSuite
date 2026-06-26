import { useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GlobalNav } from "@/components/cabana/GlobalNav";
import { useAuthSession } from "@/lib/cabana-auth";
import {
  useConversation,
  useDeleteMessage,
  useMarkConversationRead,
  useMessages,
} from "@/lib/use-messaging";
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
    <div className="relative flex h-screen flex-col overflow-hidden px-4 pb-4 pt-24 sm:px-6">
      <GlobalNav />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col overflow-hidden">
        <header className="mb-3 flex items-center gap-3">
          <Link
            to="/messages"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Back to messages"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/5 text-xs font-medium">
            {other?.otherAvatarUrl ? (
              <img src={other.otherAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (other?.otherDisplayName ?? "?").charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {other?.otherDisplayName ?? "Conversation"}
            </p>
            {other?.otherUsername && (
              <p className="truncate text-[11px] text-muted-foreground">@{other.otherUsername}</p>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pb-2">
          {loading || (user && isLoading) ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isError ? (
            <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
              Couldn’t load this conversation.
            </div>
          ) : !messages || messages.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
              No messages yet. Say hello.
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
          <div className="pt-2">
            <MessageComposer conversationId={conversationId} />
          </div>
        )}
      </div>
    </div>
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
