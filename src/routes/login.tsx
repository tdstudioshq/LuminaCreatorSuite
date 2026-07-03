import {
  createFileRoute,
  Link,
  useNavigate,
  useRouterState,
  redirect,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BriefcaseBusiness, ShieldCheck, UserRound } from "lucide-react";
import { AuthShell, AuthField } from "@/components/cabana/auth/AuthShell";
import {
  cabanaAuth,
  getDemoCredentials,
  sanitizeAuthRedirect,
  useAuthSession,
  type DemoRole,
} from "@/lib/cabana-auth";
import { accountHomePath, resolveAccountType } from "@/lib/cabana-account";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "description", content: "Sign in to your CABANA Studio." }],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const accountType = resolveAccountType(data.session.user.user_metadata.account_type);
      throw redirect({ to: accountHomePath(accountType) });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const rawRedirect = useRouterState({
    select: (s) => new URLSearchParams(s.location.searchStr).get("redirect"),
  });
  const { user } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingLogin, setPendingLogin] = useState<"form" | DemoRole | null>(null);

  useEffect(() => {
    if (!user) return;
    const destination = sanitizeAuthRedirect(rawRedirect, accountHomePath(user.accountType));
    navigate({ to: destination });
  }, [user, rawRedirect, navigate]);

  const attemptLogin = async (
    credentials: { email: string; password: string },
    source: "form" | DemoRole,
  ) => {
    setError(null);
    setPendingLogin(source);
    const res = await cabanaAuth.login(credentials);
    setPendingLogin(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const destination = sanitizeAuthRedirect(rawRedirect, accountHomePath(res.accountType));
    navigate({ to: destination });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await attemptLogin({ email, password }, "form");
  };

  const signInWithDemoAccess = async (role: DemoRole) => {
    const credentials = getDemoCredentials(role);
    setEmail(credentials.email);
    setPassword(credentials.password);
    await attemptLogin(credentials, role);
  };

  return (
    <AuthShell eyebrow="" title="Welcome back" subtitle="Sign in to your Cabana account.">
      <form onSubmit={onSubmit}>
        <div className="space-y-[18px]">
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
        </div>
        {error && <div className="mt-3 text-xs font-medium text-destructive">{error}</div>}
        <button
          type="submit"
          disabled={pendingLogin !== null}
          className="mt-[15px] flex h-10 w-full items-center justify-center rounded-[13px] bg-[linear-gradient(100deg,#ed5ed1_0%,#bd79ec_42%,#41d7e1_100%)] text-[13px] font-extrabold tracking-[0] text-[#151722] shadow-[0_10px_18px_rgba(60,205,220,0.22),0_6px_18px_rgba(237,94,209,0.2)] transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#52d6e3]/25 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pendingLogin === "form" ? "Signing in..." : "Sign in"}
        </button>
        <div className="mt-[14px] flex items-center justify-between text-[13px] font-bold tracking-[0] text-[#2ca9af]">
          <Link to="/forgot-password" className="transition-colors hover:text-[#1f8287]">
            Forgot password?
          </Link>
          <Link to="/signup" className="transition-colors hover:text-[#1f8287]">
            Create account
          </Link>
        </div>
      </form>

      <div className="mt-[28px] flex items-center gap-[13px]">
        <div className="h-px flex-1 bg-[#edf0f5]" />
        <div className="text-[12px] font-extrabold uppercase leading-none tracking-[0.18em] text-[#b5b6be]">
          Demo Access
        </div>
        <div className="h-px flex-1 bg-[#edf0f5]" />
      </div>

      <div className="mt-[16px] space-y-[10px]">
        <DemoAccessButton
          label="Continue as Fan"
          icon={<UserRound className="h-[17px] w-[17px]" strokeWidth={2.25} />}
          loading={pendingLogin === "fan"}
          disabled={pendingLogin !== null}
          onClick={() => void signInWithDemoAccess("fan")}
        />
        <DemoAccessButton
          label="Continue as Creator"
          icon={<BriefcaseBusiness className="h-[17px] w-[17px]" strokeWidth={2.25} />}
          loading={pendingLogin === "creator"}
          disabled={pendingLogin !== null}
          onClick={() => void signInWithDemoAccess("creator")}
        />
        <DemoAccessButton
          label="Continue as Admin"
          icon={<ShieldCheck className="h-[17px] w-[17px]" strokeWidth={2.25} />}
          loading={pendingLogin === "admin"}
          disabled={pendingLogin !== null}
          onClick={() => void signInWithDemoAccess("admin")}
        />
      </div>
    </AuthShell>
  );
}

function DemoAccessButton({
  label,
  icon,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[44px] w-full items-center justify-center gap-[10px] rounded-[18px] border border-[#e8e9ee] bg-white text-[14px] font-extrabold tracking-[0] text-[#3d3f4a] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-colors hover:border-[#d8dbe5] hover:bg-[#fbfcff] focus:outline-none focus:ring-4 focus:ring-[#65d7e5]/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#55dae7_0%,#e362d5_82%)] text-[#1c1730] shadow-[0_4px_10px_rgba(79,210,225,0.22)]">
        {icon}
      </span>
      {loading ? "Signing in..." : label}
    </button>
  );
}
