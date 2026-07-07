import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cabanaAuth, useAuthSession } from "@/lib/cabana-auth";

/**
 * The CABANA sign-in card (marble backdrop, glass card, chrome ENTER button —
 * mirrors the cabanamgmt home hero). Shared by the home route (`/`) and
 * `/login` so the two never drift.
 */
export function LoginCard() {
  const navigate = useNavigate();
  const redirectTo = useRouterState({
    select: (s) => new URLSearchParams(s.location.searchStr).get("redirect") || "/dashboard",
  });
  const { user } = useAuthSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate({ to: redirectTo });
  }, [user, redirectTo, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!username || !password) {
      toast.error("Enter email and password");
      return;
    }

    setLoading(true);
    const res = await cabanaAuth.login({ email: username, password });
    setLoading(false);

    if (!res.ok) {
      toast.error(res.error || "Sign-in failed");
      return;
    }

    toast.success("Signed in");
    navigate({ to: redirectTo });
  };

  const signInWithGoogle = async () => {
    setGoogleError(null);
    setGoogleLoading(true);
    const res = await cabanaAuth.loginWithGoogle();
    if (!res.ok) {
      setGoogleLoading(false);
      setGoogleError(res.error);
      return;
    }
    // Success means the browser is redirecting to Google — keep the button in
    // its loading state until the page unloads.
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center px-6 py-12"
      style={{
        backgroundImage: "url('/td-studios-black-marble.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <h1 className="sr-only">CABANA</h1>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-full max-w-md"
      >
        <div className="absolute inset-0 -z-10 rounded-[32px] bg-black/40 blur-3xl" />
        <div className="relative overflow-hidden rounded-[32px] border-2 border-white/20 bg-black/30 px-10 py-12 shadow-[0_0_45px_rgba(0,0,0,0.65)] backdrop-blur-lg">
          <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/10" />
          <div className="pointer-events-none absolute inset-x-10 top-0 h-48 rounded-b-full bg-white/15 opacity-60 blur-3xl" />
          <div className="relative flex flex-col items-center gap-6 text-center text-white">
            <img
              src="/cabana-logo.png"
              alt="Cabana"
              width={120}
              height={120}
              className="h-28 w-28 object-contain"
            />
            <div className="flex w-full items-center gap-3">
              <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent to-white/50" />
              <span className="text-[11px] uppercase tracking-[0.35em] text-white/60">Sign in</span>
              <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent to-white/50" />
            </div>
            <form onSubmit={submit} className="w-full space-y-5 text-left">
              <div className="space-y-2">
                <label
                  className="text-sm font-semibold tracking-wide text-white"
                  htmlFor="home-username"
                >
                  Username
                </label>
                <input
                  id="home-username"
                  className="h-12 w-full rounded-xl border border-white/30 bg-white/10 px-4 text-white placeholder:text-white/60 focus:border-white/60 focus:outline-none focus:ring-0"
                  placeholder="you@domain.com"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-semibold tracking-wide text-white"
                  htmlFor="home-password"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="home-password"
                    type={showPassword ? "text" : "password"}
                    className="h-12 w-full rounded-xl border border-white/30 bg-white/10 px-4 pr-12 text-white placeholder:text-white/60 focus:border-white/60 focus:outline-none focus:ring-0"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 transition hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="relative mt-6 flex h-14 w-full items-center justify-center rounded-full border border-white/30 bg-gradient-to-b from-white via-white to-gray-200 text-lg font-semibold uppercase tracking-[0.4em] text-black shadow-[inset_0_2px_10px_rgba(255,255,255,0.9),inset_0_-6px_12px_rgba(0,0,0,0.3),0_12px_24px_rgba(0,0,0,0.45)] transition-all duration-200 hover:shadow-[inset_0_2px_12px_rgba(255,255,255,1),inset_0_-6px_14px_rgba(0,0,0,0.35),0_14px_28px_rgba(0,0,0,0.5)] disabled:cursor-not-allowed disabled:opacity-85"
              >
                <span className="relative z-10">{loading ? "Signing in…" : "Enter"}</span>
                <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/90 via-white/40 to-transparent" />
              </button>
            </form>
            <div className="flex w-full items-center gap-3">
              <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent to-white/50" />
              <span className="text-[11px] uppercase tracking-[0.35em] text-white/60">
                Sign up/Sign in
              </span>
              <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent to-white/50" />
            </div>
            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={googleLoading}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-white/30 bg-white text-sm font-semibold text-black shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-85"
              >
                <GoogleIcon className="h-5 w-5" />
                {googleLoading ? "Redirecting to Google…" : "Continue with Google"}
              </button>
              {googleError && (
                <p role="alert" className="text-xs text-red-300">
                  {googleError}
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </main>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path
        fill="#4285F4"
        d="M23.52 12.273c0-.851-.076-1.67-.218-2.455H12v4.642h6.458a5.52 5.52 0 0 1-2.394 3.622v3.01h3.878c2.269-2.088 3.578-5.165 3.578-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.956-1.075 7.942-2.907l-3.878-3.011c-1.075.72-2.45 1.146-4.064 1.146-3.125 0-5.771-2.111-6.715-4.948H1.276v3.109A11.995 11.995 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.285 14.28A7.213 7.213 0 0 1 4.909 12c0-.791.136-1.56.376-2.28V6.611H1.276A11.995 11.995 0 0 0 0 12c0 1.936.464 3.769 1.276 5.389l4.009-3.109z"
      />
      <path
        fill="#EA4335"
        d="M12 4.773c1.762 0 3.344.605 4.587 1.794l3.442-3.442C17.951 1.19 15.235 0 12 0 7.31 0 3.253 2.69 1.276 6.611l4.009 3.109C6.229 6.883 8.875 4.773 12 4.773z"
      />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.57 18.57 0 0 1 5.06-5.94" />
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}
