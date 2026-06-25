import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "moderator" | "user";

/**
 * Returns whether the current signed-in user has the given role.
 * Resolves immediately from the cached Supabase session — no `getUser()` round-trip,
 * so client-side navigations never stall on "Verifying access…".
 */
export function useHasRole(role: AppRole) {
  const [state, setState] = useState<{ loading: boolean; hasRole: boolean; signedIn: boolean }>({
    loading: true,
    hasRole: false,
    signedIn: false,
  });

  useEffect(() => {
    let active = true;

    async function checkForUser(userId: string | null) {
      if (!userId) {
        if (active) setState({ loading: false, hasRole: false, signedIn: false });
        return;
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", role)
        .maybeSingle();
      if (!active) return;
      setState({ loading: false, hasRole: !error && !!data, signedIn: true });
    }

    // 1. Subscribe first so we never miss an event.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Do not await inside the callback — schedule the role check.
      void checkForUser(session?.user?.id ?? null);
    });

    // 2. Read the cached session synchronously after subscription is wired.
    supabase.auth.getSession().then(({ data }) => {
      void checkForUser(data.session?.user?.id ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [role]);

  return state;
}
