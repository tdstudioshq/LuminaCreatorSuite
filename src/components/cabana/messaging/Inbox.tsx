import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuthSession } from "@/lib/cabana-auth";
import { MessagesShell, EmptyThread } from "./MessagesShell";

export function Inbox() {
  const { user, loading } = useAuthSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: path } as never });
    }
  }, [loading, user, navigate, path]);

  return (
    <MessagesShell>
      <EmptyThread />
    </MessagesShell>
  );
}
