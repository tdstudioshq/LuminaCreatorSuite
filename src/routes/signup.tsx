import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { AuthShell, AuthField } from "@/components/cabana/auth/AuthShell";
import { cabanaAuth } from "@/lib/cabana-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "description", content: "Build your creator empire on CABANA." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await cabanaAuth.signup({ name, email, password });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate({ to: "/onboarding" });
  };

  return (
    <AuthShell
      eyebrow="Join CABANA"
      title="Create your studio"
      subtitle="Two minutes to a cinematic creator presence."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-foreground hover:text-primary transition-colors">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField
          label="Name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Aurora Lane"
        />
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
        {error && <div className="text-xs text-destructive">{error}</div>}
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
          By creating an account you agree to our terms and privacy policy.
        </p>
        <button type="submit" disabled={loading} className="btn-luxury w-full justify-center">
          {loading ? (
            "Creating…"
          ) : (
            <>
              Create account <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
