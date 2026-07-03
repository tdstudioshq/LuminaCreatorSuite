import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { AuthShell, AuthField } from "@/components/cabana/auth/AuthShell";
import { cabanaAuth } from "@/lib/cabana-auth";
import { accountHomePath, resolveAccountType } from "@/lib/cabana-account";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setState((current) =>
          current === "checking" || current === "invalid" ? "ready" : current,
        );
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (active) setState(data.session ? "ready" : "invalid");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const res = await cabanaAuth.updatePassword(password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setState("done");
    const { data } = await supabase.auth.getSession();
    const accountType = resolveAccountType(data.session?.user.user_metadata.account_type);
    setTimeout(() => navigate({ to: accountHomePath(accountType) }), 1200);
  };

  return (
    <AuthShell
      eyebrow="Almost there"
      title="Set a new password"
      subtitle="Save a new password to continue back into CABANA."
      footer={
        <>
          Need help?{" "}
          <Link to="/login" className="text-foreground hover:text-primary transition-colors">
            Back to sign in
          </Link>
        </>
      }
    >
      {state === "checking" ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs font-medium text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking reset link
        </div>
      ) : state === "invalid" ? (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-foreground">
            This reset link is invalid or expired.
          </p>
          <Link
            to="/forgot-password"
            className="mt-4 inline-flex text-xs font-semibold text-primary hover:text-primary/80"
          >
            Request a new link
          </Link>
        </div>
      ) : state === "done" ? (
        <div className="text-center py-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Check className="w-5 h-5 text-primary" />
          </div>
          <p className="mt-4 text-sm text-foreground">Password updated. Redirecting…</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <AuthField
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
          <AuthField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Enter it again"
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
          <button type="submit" disabled={loading} className="btn-luxury w-full justify-center">
            {loading ? (
              "Saving…"
            ) : (
              <>
                Update password <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
