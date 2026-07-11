import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { AuthShell, AuthField } from "@/components/cabana/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { cabanaAuth, useAuthSession } from "@/lib/cabana-auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  // The reset email link establishes a short-lived recovery session (supabase
  // parses the URL token on load). `useAuthSession` resolves it via
  // onAuthStateChange + getSession, so `user` is null when the link is missing,
  // expired, or already consumed — surface that up front instead of failing at
  // submit time.
  const { user, loading: sessionLoading } = useAuthSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await cabanaAuth.updatePassword(password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    setTimeout(() => navigate({ to: "/dashboard" }), 1200);
  };

  return (
    <AuthShell
      eyebrow="Almost there"
      title="Set a new password"
      subtitle="Choose a strong password to secure your studio."
      footer={
        <>
          Need help?{" "}
          <Link to="/login" className="text-foreground hover:text-primary transition-colors">
            Back to sign in
          </Link>
        </>
      }
    >
      {sessionLoading ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">Checking your reset link…</p>
        </div>
      ) : !user ? (
        <div className="text-center py-6 space-y-4">
          <p className="text-sm text-foreground">This reset link is invalid or has expired.</p>
          <Button asChild variant="cta" className="w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      ) : done ? (
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
          {error && <div className="text-xs text-destructive">{error}</div>}
          <Button type="submit" variant="cta" disabled={loading} className="w-full">
            {loading ? (
              "Saving…"
            ) : (
              <>
                Update password <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
