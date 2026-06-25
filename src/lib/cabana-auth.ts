import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  async signup(input: { name: string; email: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    if (!input.name.trim()) return { ok: false as const, error: "Please enter your name." };
    if (!/^\S+@\S+\.\S+$/.test(email))
      return { ok: false as const, error: "Enter a valid email address." };
    if (input.password.length < 6)
      return { ok: false as const, error: "Password must be at least 6 characters." };

    const emailRedirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;

    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: { data: { name: input.name.trim() }, emailRedirectTo },
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, user: toCabana(data.user)! };
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
