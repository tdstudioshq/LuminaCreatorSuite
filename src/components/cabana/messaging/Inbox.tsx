import { useEffect } from "react";
import { Outlet, useChildMatches, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuthSession } from "@/lib/cabana-auth";
import { MessagesShell, EmptyThread } from "./MessagesShell";

export function Inbox() {
  const { user, loading } = useAuthSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // /messages/$conversationId is a child of this route; ConversationView brings
  // its own MessagesShell, so defer entirely to the child when one is matched.
  const hasThread = useChildMatches().length > 0;

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: path } as never });
    }
  }, [loading, user, navigate, path]);

  if (hasThread) return <Outlet />;

  return (
    <MessagesShell>
      <EmptyThread />
    </MessagesShell>
  );
}
