// ============================================================================
// CABANA — creator-subscription React hooks (Phase 4, DEMO-ONLY)
// ----------------------------------------------------------------------------
// React Query bindings over the subscription server actions. Subscribing/
// cancelling invalidates the creator feed + post detail so subscriber-only
// posts lock/unlock immediately. All monetization here is demo — no real money.
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/cabana-auth";
import {
  cancelSubscription,
  getCreatorSubscribers,
  getCreatorTiers,
  getMyTiers,
  getSubscriptionState,
  setTierActive,
  subscribeToCreator,
  upsertTier,
} from "@/lib/subscription-actions";

const subscriptionKey = (username: string) => ["subscription", username.toLowerCase()] as const;
const creatorTiersKey = (username: string) => ["creator-tiers", username.toLowerCase()] as const;
const myTiersKey = ["my-tiers"] as const;

// ─────────────────────────────── Reads ──────────────────────────────────────

export function useCreatorTiers(username: string) {
  const normalized = username.toLowerCase();
  return useQuery({
    queryKey: creatorTiersKey(normalized),
    enabled: !!normalized,
    queryFn: () => getCreatorTiers({ data: { username: normalized } }),
  });
}

export function useMyTiers() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: myTiersKey,
    enabled: !loading && !!user,
    queryFn: () => getMyTiers(),
  });
}

export function useSubscriptionState(username: string) {
  const normalized = username.toLowerCase();
  return useQuery({
    queryKey: subscriptionKey(normalized),
    enabled: !!normalized,
    queryFn: () => getSubscriptionState({ data: { username: normalized } }),
  });
}

export function useCreatorSubscribers() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: ["creator-subscribers"],
    enabled: !loading && !!user,
    queryFn: () => getCreatorSubscribers(),
  });
}

// ─────────────────────────────── Subscribe / cancel ─────────────────────────

export function useSubscribe(username: string) {
  const qc = useQueryClient();
  const normalized = username.toLowerCase();
  const { user } = useAuthSession();
  const state = useSubscriptionState(normalized);

  function invalidate() {
    qc.invalidateQueries({ queryKey: subscriptionKey(normalized) });
    qc.invalidateQueries({ queryKey: ["creator-feed", normalized] });
    qc.invalidateQueries({ queryKey: ["home-feed"] });
    qc.invalidateQueries({ queryKey: ["post"] });
  }

  const subscribe = useMutation({
    mutationFn: (tierId: string) => subscribeToCreator({ data: { username: normalized, tierId } }),
    onSuccess: (next) => {
      qc.setQueryData(subscriptionKey(normalized), next);
      invalidate();
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelSubscription({ data: { username: normalized } }),
    onSuccess: (next) => {
      qc.setQueryData(subscriptionKey(normalized), next);
      invalidate();
    },
  });

  return {
    ...state,
    signedIn: !!user,
    subscribed: state.data?.subscribed ?? false,
    isSelf: state.data?.isSelf ?? false,
    pending: subscribe.isPending || cancel.isPending,
    subscribe: (tierId: string) => subscribe.mutateAsync(tierId),
    cancel: () => cancel.mutateAsync(),
  };
}

// ─────────────────────────────── Tier mutations ─────────────────────────────

export function useUpsertTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tierId?: string; name: string; priceCents: number; currency?: string }) =>
      upsertTier({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: myTiersKey }),
  });
}

export function useSetTierActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tierId: string; isActive: boolean }) => setTierActive({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: myTiersKey }),
  });
}
