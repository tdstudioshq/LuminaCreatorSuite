import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuthSession } from "@/lib/cabana-auth";

export function RequireSignedIn({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { user, loading } = useAuthSession();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: path } as never });
    }
  }, [loading, user, navigate, path]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking access
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
