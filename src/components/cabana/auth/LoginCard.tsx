import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AuthShell, AuthField } from "./AuthShell";
import { cabanaAuth, useAuthSession } from "@/lib/cabana-auth";

/**
 * The CABANA sign-in card (logo top-center, email/password form). Shared by the
 * home route (`/`) and `/login` so the two never drift.
 */
export function LoginCard() {
  const navigate = useNavigate();
  const redirectTo = useRouterState({
    select: (s) => new URLSearchParams(s.location.searchStr).get("redirect") || "/dashboard",
  });
  const { user } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: redirectTo });
  }, [user, redirectTo, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await cabanaAuth.login({ email, password });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate({ to: redirectTo });
  };

  return (
    <AuthShell
      logo
      eyebrow="Welcome back"
      title="Sign in to CABANA"
      subtitle="Step back into your Studio."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="text-foreground hover:text-primary transition-colors">
            Create an account
          </Link>
        </>
      }
    >
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
        <AuthField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex items-center justify-end text-xs">
          <Link
            to="/forgot-password"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <button type="submit" disabled={loading} className="btn-luxury w-full justify-center">
          {loading ? (
            "Signing in…"
          ) : (
            <>
              Sign in <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
