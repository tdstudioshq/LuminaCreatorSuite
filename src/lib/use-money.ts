// ============================================================================
// CABANA — monetization React hooks (Phase 6, DEMO-ONLY)
// ----------------------------------------------------------------------------
// React Query bindings over the money server actions. The creator earnings
// dashboard reads balance / transactions / payouts / tips / sales; the payout
// dialog and (mock) tip / purchase flows are mutations that invalidate the
// affected reads so the UI reflects the new ledger state immediately. All
// monetization here is demo — no real money moves.
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/cabana-auth";
import {
  createMockPurchase,
  createMockTip,
  getCreatorBalance,
  getEntitlements,
  getPayoutHistory,
  getPurchases,
  getTips,
  getTransactions,
  requestPayout,
} from "@/lib/money-actions";

const balanceKey = ["creator-balance"] as const;
const transactionsKey = ["ledger-transactions"] as const;
const payoutsKey = ["payout-history"] as const;
const purchasesKey = ["sales-history"] as const;
const tipsKey = ["tip-history"] as const;
const entitlementsKey = ["my-entitlements"] as const;

// ─────────────────────────────── Reads ──────────────────────────────────────

export function useBalance() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: balanceKey,
    enabled: !loading && !!user,
    queryFn: () => getCreatorBalance(),
  });
}

export function useTransactions() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: transactionsKey,
    enabled: !loading && !!user,
    queryFn: () => getTransactions(),
  });
}

export function usePayouts() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: payoutsKey,
    enabled: !loading && !!user,
    queryFn: () => getPayoutHistory(),
  });
}

export function usePurchases() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: purchasesKey,
    enabled: !loading && !!user,
    queryFn: () => getPurchases(),
  });
}

export function useTips() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: tipsKey,
    enabled: !loading && !!user,
    queryFn: () => getTips(),
  });
}

export function useEntitlements() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: entitlementsKey,
    enabled: !loading && !!user,
    queryFn: () => getEntitlements(),
  });
}

// ─────────────────────────────── Mutations (mock) ───────────────────────────

/** Request a (mock) payout; refreshes the balance + payout history. */
export function useRequestPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amountCents: number; note?: string }) => requestPayout({ data: input }),
    onSuccess: (balance) => {
      qc.setQueryData(balanceKey, balance);
      qc.invalidateQueries({ queryKey: payoutsKey });
    },
  });
}

/** Send a (mock) tip to a creator. Invalidates ledger reads for both parties. */
export function useSendTip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; amountCents: number; message?: string }) =>
      createMockTip({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: balanceKey });
      qc.invalidateQueries({ queryKey: tipsKey });
      qc.invalidateQueries({ queryKey: transactionsKey });
    },
  });
}

/**
 * Unlock a `purchase` post (mock). Invalidates the viewer's entitlements and the
 * post/feed reads so the unlocked content renders immediately.
 */
export function usePurchaseUnlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const result = await createMockPurchase({ data: { postId } });
      // The purchase handler returns `{ ok: true }` only when the RPC actually
      // ran. When the caller is unauthenticated (no/expired session) the auth
      // middleware short-circuits with a 401 whose body the server-fn client
      // *resolves* rather than rejects — so guard on the payload and fail loudly
      // instead of letting React Query fire `onSuccess` for a purchase that
      // never happened.
      if (!result || (result as { ok?: unknown }).ok !== true) {
        throw new Error("Please sign in to unlock this post.");
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: entitlementsKey });
      qc.invalidateQueries({ queryKey: ["post"] });
      qc.invalidateQueries({ queryKey: ["creator-feed"] });
      qc.invalidateQueries({ queryKey: ["home-feed"] });
    },
  });
}
