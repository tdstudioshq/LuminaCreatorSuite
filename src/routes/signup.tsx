import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { AuthShell, AuthField } from "@/components/cabana/auth/AuthShell";
import { cabanaAuth } from "@/lib/cabana-auth";
import { type AccountType, accountHomePath, resolveAccountType } from "@/lib/cabana-account";
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
    if (data.session) {
      const accountType = resolveAccountType(data.session.user.user_metadata.account_type);
      throw redirect({ to: accountHomePath(accountType) });
    }
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("creator");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await cabanaAuth.signup({ name, email, password, accountType });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.requiresEmailConfirmation) {
      setConfirmationEmail(email.trim().toLowerCase());
      return;
    }
    // Creators continue into the studio onboarding flow; members land on their
    // account foundation. (Email-confirmation off in local config; with it on,
    // the emailRedirectTo from cabana-auth handles the landing.)
    navigate({
      to: res.accountType === "member" ? accountHomePath("member") : "/dashboard/home",
    });
  };

  return (
    <AuthShell
      eyebrow="Join CABANA"
      title="Create your studio"
      subtitle="Choose how you want to use CABANA, then set up your account."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-foreground hover:text-primary transition-colors">
            Sign in
          </Link>
        </>
      }
    >
      {confirmationEmail ? (
        <div className="py-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
            <Check className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">Check your inbox</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            We sent a confirmation link to {confirmationEmail}.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">
              I'm joining as a
            </legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
              {(
                [
                  { id: "creator", label: "Creator", hint: "Build a page & storefront" },
                  { id: "member", label: "Member", hint: "Follow & support creators" },
                ] as const
              ).map((opt) => {
                const active = accountType === opt.id;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAccountType(opt.id)}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                      active
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/60 hover:border-border"
                    }`}
                  >
                    <div className="text-sm font-medium text-foreground">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground/80">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </fieldset>
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
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
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
      )}
    </AuthShell>
  );
}
