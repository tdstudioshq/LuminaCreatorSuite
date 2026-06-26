// ============================================================================
// CABANA — admin payout workflow React hooks (Phase 8C.2)
// ----------------------------------------------------------------------------
// React Query bindings over the admin payout server actions. The queue read is
// RLS-scoped server-side (admins see all); these hooks gate only on an
// authenticated session — the route enforces the admin gate. A decision
// invalidates the payout queue plus the finance reads (balances move) and the
// audit log (the DB trigger appended a row).
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/cabana-auth";
import type { PayoutAction } from "@/lib/cabana-payouts";
import { getAdminPayoutRequests, reviewPayout } from "@/lib/admin-payout-actions";

const payoutsKey = ["admin-payout-requests"] as const;

export function useAdminPayoutRequests() {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: payoutsKey,
    enabled: !loading && !!user,
    queryFn: () => getAdminPayoutRequests(),
  });
}

export function useReviewPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { payoutRequestId: string; action: PayoutAction; note?: string }) =>
      reviewPayout({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payoutsKey });
      qc.invalidateQueries({ queryKey: ["admin-finance"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
  });
}
