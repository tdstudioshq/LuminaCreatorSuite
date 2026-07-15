// ============================================================================
// CABANA — admin creator directory hooks (Phase 1, read-only)
// ----------------------------------------------------------------------------
// React Query binding over the read-only admin creator directory action. The
// hook gates only on an authenticated session; the ADMIN gate is enforced twice
// where it counts — by `AdminGate` on the route and by `assertAdmin` inside the
// server action (which reads `user_roles`, never an email).
//
// `placeholderData: keepPreviousData` keeps the current page visible while the
// next one loads, so paging doesn't flash an empty table.
// ============================================================================
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/cabana-auth";
import { getAdminCreators } from "@/lib/admin-creator-actions";
import type { AdminCreatorsQuery } from "@/lib/cabana-admin-creators";

const adminCreatorsKey = ["admin-creators"] as const;

export function useAdminCreators(query: AdminCreatorsQuery) {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: [
      ...adminCreatorsKey,
      query.page,
      query.pageSize,
      query.search,
      query.claimed,
      query.status,
    ] as const,
    enabled: !loading && !!user,
    placeholderData: keepPreviousData,
    queryFn: () =>
      getAdminCreators({
        data: {
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          claimed: query.claimed,
          status: query.status,
        },
      }),
  });
}
