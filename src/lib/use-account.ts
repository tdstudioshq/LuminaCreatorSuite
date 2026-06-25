// ============================================================================
// CABANA — account React hooks
// ----------------------------------------------------------------------------
// Client integration for the account-type model. `useAccountType` powers the
// critical auth-guard / redirect paths with a lightweight direct query (same
// pattern as `useHasRole`, so the creator dashboard never regresses). The
// member-profile hooks go through the protected server-action tier to prove it
// works end-to-end under RLS.
// ============================================================================
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type AccountType, DEFAULT_ACCOUNT_TYPE } from "./cabana-account";
import { getAccountContext, getMemberProfile, updateMemberProfile } from "./account-actions";

/** Tracks the signed-in user id; `ready` flips true after the first check. */
function useSessionUserId() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.session?.user?.id ?? null);
      setReady(true);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  return { userId, ready };
}

/**
 * Resolve the signed-in account's type. `loading` stays true until both the
 * session check and (when signed in) the profile read have settled, so callers
 * can defer redirects until `accountType` is known.
 */
export function useAccountType(): {
  loading: boolean;
  signedIn: boolean;
  accountType: AccountType | null;
} {
  const { userId, ready } = useSessionUserId();
  const query = useQuery({
    queryKey: ["account-type", userId],
    enabled: ready && !!userId,
    queryFn: async (): Promise<AccountType> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data?.account_type ?? DEFAULT_ACCOUNT_TYPE;
    },
  });
  return {
    loading: !ready || (!!userId && (query.isLoading || query.isPending)),
    signedIn: !!userId,
    accountType: userId ? (query.data ?? null) : null,
  };
}

/** Full authenticated account context via the protected server action. */
export function useAccountContext() {
  const { userId, ready } = useSessionUserId();
  return useQuery({
    queryKey: ["account-context", userId],
    enabled: ready && !!userId,
    queryFn: () => getAccountContext(),
  });
}

/** The caller's member profile (via server action; null if none yet). */
export function useMemberProfile() {
  const { userId, ready } = useSessionUserId();
  return useQuery({
    queryKey: ["member-profile", userId],
    enabled: ready && !!userId,
    queryFn: () => getMemberProfile(),
  });
}

/** Create-or-update the caller's member profile through the server action. */
export function useUpdateMemberProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { displayName: string; bio: string }) =>
      updateMemberProfile({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member-profile"] });
      qc.invalidateQueries({ queryKey: ["account-context"] });
    },
  });
}
