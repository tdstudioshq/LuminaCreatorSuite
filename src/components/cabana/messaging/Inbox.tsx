import { useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessagesSquare } from "lucide-react";
import { GlobalNav } from "@/components/cabana/GlobalNav";
import { useAuthSession } from "@/lib/cabana-auth";
import { useConversations } from "@/lib/use-messaging";

export function Inbox() {
  const { user, loading } = useAuthSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: conversations, isLoading, isError } = useConversations();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: path } as never });
    }
  }, [loading, user, navigate, path]);

  return (
    <div className="relative min-h-screen overflow-x-hidden px-4 pb-24 pt-32 sm:px-6">
      <GlobalNav />
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <p className="eyebrow mb-1.5 text-muted-foreground">Member experience</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Messages</h1>
        </div>

        {loading || (user && isLoading) ? (
          <Centered>
            <Loader2 className="h-5 w-5 animate-spin" />
          </Centered>
        ) : !user ? (
          <Centered>Redirecting…</Centered>
        ) : isError ? (
          <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
            Couldn’t load your messages.
          </div>
        ) : !conversations || conversations.length === 0 ? (
          <div className="glass flex flex-col items-center gap-2 rounded-3xl p-10 text-center text-sm text-muted-foreground">
            <MessagesSquare className="h-6 w-6" />
            No conversations yet. Start one from a creator’s page.
          </div>
        ) : (
          <ul className="space-y-2">
            {conversations.map((c) => (
              <li key={c.conversationId}>
                <Link
                  to="/messages/$conversationId"
                  params={{ conversationId: c.conversationId }}
                  className="glass flex items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-white/5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5 text-sm font-medium">
                    {c.otherAvatarUrl ? (
                      <img src={c.otherAvatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      c.otherDisplayName.charAt(0).toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{c.otherDisplayName}</p>
                      {c.lastMessageAt && (
                        <time className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
                          {formatDistanceToNow(new Date(c.lastMessageAt), { addSuffix: true })}
                        </time>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center py-12 text-muted-foreground">{children}</div>;
}
