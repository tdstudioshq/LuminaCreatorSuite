import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { AuthShell, AuthField } from "@/components/cabana/auth/AuthShell";
import { cabanaAuth } from "@/lib/cabana-auth";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "description", content: "Reset your CABANA password." }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await cabanaAuth.requestPasswordReset(email);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  };

  return (
    <AuthShell
      eyebrow="Recover access"
      title="Reset your password"
      subtitle="We'll email you a secure link to set a new password."
      footer={
        <>
          Remembered it?{" "}
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
          <p className="mt-4 text-sm text-foreground">Check your inbox for the reset link.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <AuthField
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@studio.com"
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
          <button type="submit" disabled={loading} className="btn-luxury w-full justify-center">
            {loading ? (
              "Sending…"
            ) : (
              <>
                Send reset link <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
