// ============================================================================
// CABANA — admin finance React hooks (Phase 8C.1, read-only)
// ----------------------------------------------------------------------------
// React Query bindings over the read-only admin finance server actions. Reads
// are RLS-scoped server-side (admins see all creators); these hooks only gate on
// an authenticated session — the routes enforce the admin gate. No mutations in
// this slice (payout management lands in 8C.2).
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/cabana-auth";
import {
  getAdminCreatorEarnings,
  getAdminPayouts,
  getAdminTransactionDetail,
  getAdminTransactions,
} from "@/lib/admin-finance-actions";

const financeKey = ["admin-finance"] as const;

export function useAdminTransactions(limit?: number) {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: [...financeKey, "transactions", limit ?? "default"] as const,
    enabled: !loading && !!user,
    queryFn: () => getAdminTransactions({ data: { limit } }),
  });
}

export function useAdminTransactionDetail(transactionId: string | undefined) {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: [...financeKey, "transaction", transactionId] as const,
    enabled: !loading && !!user && !!transactionId,
    queryFn: () => getAdminTransactionDetail({ data: { transactionId: transactionId! } }),
  });
}

export function useAdminPayouts() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: [...financeKey, "payouts"] as const,
    enabled: !loading && !!user,
    queryFn: () => getAdminPayouts(),
  });
}

export function useAdminCreatorEarnings() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: [...financeKey, "creator-earnings"] as const,
    enabled: !loading && !!user,
    queryFn: () => getAdminCreatorEarnings(),
  });
}
