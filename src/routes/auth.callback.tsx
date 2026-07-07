import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { accountHomePath, DEFAULT_ACCOUNT_TYPE } from "@/lib/cabana-account";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Completing your CABANA sign-in." },
    ],
  }),
  component: AuthCallback,
});

/**
 * Fresh OAuth signups (no prior session for this user) go to onboarding;
 * returning users go straight to their home surface. There is no persisted
 * onboarding-completion flag, so "account created moments ago" is the signal —
 * the OAuth round-trip takes seconds, minutes only on a slow consent screen.
 */
const NEW_USER_WINDOW_MS = 5 * 60_000;

/**
 * Lands the Supabase OAuth redirect (`/auth/callback`). The Supabase client
 * (detectSessionInUrl) consumes the tokens from the URL on load; this route
 * waits for the resulting session, then routes:
 *   - member accounts → /account (their home surface, mirroring signup/login)
 *   - brand-new users → /onboarding
 *   - returning users → /dashboard
 */
function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    // Provider errors come back in the query string or the hash fragment.
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const providerError =
      search.get("error_description") ||
      hash.get("error_description") ||
      search.get("error") ||
      hash.get("error");
    if (providerError) {
      setError(providerError.replace(/\+/g, " "));
      return;
    }

    const finish = async (userId: string, createdAt: string) => {
      if (handled.current) return;
      handled.current = true;

      // Same lightweight lookup as useAccountType; on any failure fall back to
      // the default (creator) rather than blocking sign-in.
      let accountType: string = DEFAULT_ACCOUNT_TYPE;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("account_type")
          .eq("id", userId)
          .maybeSingle();
        accountType = data?.account_type ?? DEFAULT_ACCOUNT_TYPE;
      } catch {
        // ignore — route as creator; the dashboard guard re-checks anyway
      }

      if (accountType === "member") {
        navigate({ to: accountHomePath("member"), replace: true });
        return;
      }
      const isNewUser = Date.now() - new Date(createdAt).getTime() < NEW_USER_WINDOW_MS;
      navigate({ to: isNewUser ? "/onboarding" : "/dashboard", replace: true });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void finish(session.user.id, session.user.created_at);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void finish(data.session.user.id, data.session.user.created_at);
    });

    // If no session materializes (misconfigured provider, expired code…), fail
    // visibly instead of spinning forever.
    const timer = setTimeout(() => {
      if (!handled.current) {
        setError("We couldn't complete the sign-in. Please try again.");
      }
    }, 10_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [navigate]);

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
      <div className="relative w-full max-w-md">
        <div className="absolute inset-0 -z-10 rounded-[32px] bg-black/40 blur-3xl" />
        <div className="relative overflow-hidden rounded-[32px] border-2 border-white/20 bg-black/30 px-10 py-12 text-center shadow-[0_0_45px_rgba(0,0,0,0.65)] backdrop-blur-lg">
          <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/10" />
          {error ? (
            <div className="relative flex flex-col items-center gap-5 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/85">
                Sign-in failed
              </p>
              <p className="text-sm text-white/70">{error}</p>
              <Link
                to="/login"
                className="text-xs text-white/80 underline underline-offset-4 transition hover:text-white"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <div className="relative flex flex-col items-center gap-5 text-white">
              <img
                src="/cabana-logo.png"
                alt="Cabana"
                width={96}
                height={96}
                className="h-24 w-24 animate-pulse object-contain"
              />
              <p className="text-xs uppercase tracking-[0.3em] text-white/70">Signing you in…</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
