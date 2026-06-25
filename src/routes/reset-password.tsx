import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { AuthShell, AuthField } from "@/components/cabana/auth/AuthShell";
import { cabanaAuth } from "@/lib/cabana-auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
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
      {done ? (
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
