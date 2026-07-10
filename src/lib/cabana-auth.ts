import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { type AccountType, resolveAccountType } from "@/lib/cabana-account";

export type CabanaUser = {
  id: string;
  name: string;
  email: string;
};

function toCabana(user: User | null): CabanaUser | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as { name?: string };
  return {
    id: user.id,
    name: meta.name?.trim() || user.email?.split("@")[0] || "Creator",
    email: user.email ?? "",
  };
}

export const cabanaAuth = {
  async signup(input: {
    name: string;
    email: string;
    password: string;
    /** Defaults to "creator" — preserves existing creator signup behavior. */
    accountType?: AccountType;
  }) {
    const email = input.email.trim().toLowerCase();
    if (!input.name.trim()) return { ok: false as const, error: "Please enter your name." };
    if (!/^\S+@\S+\.\S+$/.test(email))
      return { ok: false as const, error: "Enter a valid email address." };
    if (input.password.length < 6)
      return { ok: false as const, error: "Password must be at least 6 characters." };

    const accountType = resolveAccountType(input.accountType);
    // Members land on /account; creators keep the /dashboard onboarding flow.
    const landing = accountType === "member" ? "/account" : "/dashboard";
    const emailRedirectTo =
      typeof window !== "undefined" ? `${window.location.origin}${landing}` : undefined;

    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: { name: input.name.trim(), account_type: accountType },
        emailRedirectTo,
      },
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, user: toCabana(data.user)!, accountType };
  },

  /**
   * Starts the Google OAuth flow. On success the browser redirects to Google,
   * then back to `/auth/callback`, which finishes the session and routes the
   * user — so a `{ ok: true }` return only means the redirect was initiated.
   *
   * We build the authorize URL with `skipBrowserRedirect` and pre-flight it,
   * so a provider-side failure (e.g. the provider isn't enabled) surfaces as an
   * in-app error instead of navigating the browser to a raw JSON error page.
   * A configured provider answers `/authorize` with a redirect (an opaque
   * cross-origin response); a failure answers with a readable non-redirect
   * error. Any ambiguity (network/CORS error while pre-flighting) falls back to
   * navigating, so a healthy flow never regresses.
   */
  async loginWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { ok: false as const, error: error.message };
    const url = data?.url;
    if (!url) {
      return { ok: false as const, error: "Could not start Google sign-in. Please try again." };
    }

    try {
      const res = await fetch(url, { method: "GET", redirect: "manual" });
      const redirecting = res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400);
      if (!redirecting) {
        return {
          ok: false as const,
          error:
            "Google sign-in isn’t available right now. Please sign in with your email and password.",
        };
      }
    } catch {
      // Couldn't pre-flight (network/CORS) — don't block a possibly-healthy
      // provider; fall through to the normal browser redirect.
    }

    window.location.assign(url);
    return { ok: true as const };
  },

  async login(input: { email: string; password: string }) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, user: toCabana(data.user)! };
  },

  async logout() {
    await supabase.auth.signOut();
  },

  async requestPasswordReset(email: string) {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  },

  async updatePassword(password: string) {
    if (password.length < 6)
      return { ok: false as const, error: "Password must be at least 6 characters." };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  },
};

/** Tracks the signed-in user. `loading` is true until the first session check finishes. */
export function useAuthSession() {
  const [state, setState] = useState<{ user: CabanaUser | null; loading: boolean }>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: toCabana(session?.user ?? null), loading: false });
    });
    supabase.auth
      .getSession()
      .then(({ data }) => setState({ user: toCabana(data.session?.user ?? null), loading: false }));
    return () => subscription.unsubscribe();
  }, []);

  return state;
}

export function useCabanaUser(): CabanaUser | null {
  return useAuthSession().user;
}
