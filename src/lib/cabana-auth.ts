import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { type AccountType, resolveAccountType } from "@/lib/cabana-account";

export type DemoRole = "fan" | "creator" | "admin";

export type CabanaUser = {
  id: string;
  name: string;
  email: string;
  accountType: AccountType;
};

function toCabana(user: User | null): CabanaUser | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as { name?: string; account_type?: unknown };
  return {
    id: user.id,
    name: meta.name?.trim() || user.email?.split("@")[0] || "Creator",
    email: user.email ?? "",
    accountType: resolveAccountType(meta.account_type),
  };
}

const DEMO_CREDENTIALS: Record<DemoRole, { email: string; password: string }> = {
  fan: { email: "fan@cabana.demo", password: "password123" },
  creator: { email: "creator@cabana.demo", password: "password123" },
  admin: { email: "admin@cabana.demo", password: "password123" },
};

export function getDemoCredentials(role: DemoRole) {
  return DEMO_CREDENTIALS[role];
}

/** Accept only same-app paths from the login redirect query parameter. */
export function sanitizeAuthRedirect(raw: string | null | undefined, fallback: string): string {
  if (!raw?.startsWith("/") || raw.startsWith("//")) return fallback;

  try {
    const base = new URL("https://cabana.local");
    const destination = new URL(raw, base);
    if (destination.origin !== base.origin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
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
    // Members land on /settings; creators keep the /dashboard onboarding flow.
    const landing = accountType === "member" ? "/settings" : "/dashboard";
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
    return {
      ok: true as const,
      user: toCabana(data.user)!,
      accountType,
      requiresEmailConfirmation: !data.session,
    };
  },

  async login(input: { email: string; password: string }) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
    if (error) return { ok: false as const, error: error.message };
    const user = toCabana(data.user)!;
    return { ok: true as const, user, accountType: user.accountType };
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
