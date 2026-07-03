import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useHasRole } from "@/lib/cabana-roles";

/**
 * Client-side ADMIN-ONLY gate for the finance subroutes (`/admin/transactions`,
 * `/admin/payouts`). UX only — the real boundary is RLS (`is_current_user_admin`)
 * on every transactions / payouts / creator_balances read. Unlike `StaffGate`
 * (admin OR moderator), finance is admin-only: a moderator is RLS-denied and
 * would see an empty page, so we bounce non-admins to the unauthorized page.
 */
export function AdminGate({ redirect, children }: { redirect: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const admin = useHasRole("admin");

  useEffect(() => {
    if (admin.loading) return;
    if (!admin.signedIn) navigate({ to: "/login", search: { redirect } as never });
    else if (!admin.hasRole) navigate({ to: "/unauthorized" });
  }, [admin.loading, admin.signedIn, admin.hasRole, navigate, redirect]);

  if (admin.loading || !admin.hasRole) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying access…
        </span>
      </div>
    );
  }
  return <>{children}</>;
}
