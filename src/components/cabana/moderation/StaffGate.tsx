import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useHasRole } from "@/lib/cabana-roles";

/**
 * Client-side access gate for the admin moderation subroutes. Staff = admin OR
 * moderator. This is UX only — the real boundary is RLS (`is_current_user_staff`)
 * enforced on every `reports` / `audit_logs` read + write. Guests go to login;
 * signed-in non-staff are bounced to the dashboard. Mirrors `admin.tsx`'s gate.
 */
export function StaffGate({ redirect, children }: { redirect: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const admin = useHasRole("admin");
  const moderator = useHasRole("moderator");
  const loading = admin.loading || moderator.loading;
  const signedIn = admin.signedIn || moderator.signedIn;
  const isStaff = admin.hasRole || moderator.hasRole;

  useEffect(() => {
    if (loading) return;
    if (!signedIn) navigate({ to: "/login", search: { redirect } as never });
    else if (!isStaff) navigate({ to: "/dashboard" });
  }, [loading, isStaff, signedIn, navigate, redirect]);

  if (loading || !isStaff) {
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
