// ============================================================================
// CABANA — creator analytics React hook (Phase 11B)
// ----------------------------------------------------------------------------
// React Query binding over `getCreatorAnalytics`. The raw RLS-scoped bundle is
// fetched once (range-independent); the consuming page applies the selected
// date range through the pure `buildCreatorAnalytics` pipeline, so changing the
// range never re-fetches and never re-derives money differently. DEMO-ONLY.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/cabana-auth";
import { getCreatorAnalytics } from "@/lib/analytics-actions";
import type { CreatorAnalyticsData } from "@/lib/cabana-creator-analytics";

const analyticsKey = ["creator-analytics"] as const;

/** The current creator's raw analytics bundle (range applied client-side). */
export function useCreatorAnalytics() {
  const { user, loading } = useAuthSession();
  return useQuery<CreatorAnalyticsData>({
    queryKey: analyticsKey,
    enabled: !loading && !!user,
    queryFn: () => getCreatorAnalytics(),
  });
}
