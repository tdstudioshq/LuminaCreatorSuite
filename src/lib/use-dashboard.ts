// ============================================================================
// CABANA — creator dashboard React hook (Phase 11A)
// ----------------------------------------------------------------------------
// React Query binding over the `getCreatorDashboard` server action. The raw
// RLS-scoped bundle is mapped into the dashboard view by the pure
// `buildCreatorDashboard` aggregator, so the UI consumes a ready-to-render view
// model and never re-derives money or counts. DEMO-ONLY money throughout.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/cabana-auth";
import { getCreatorDashboard } from "@/lib/dashboard-actions";
import { buildCreatorDashboard, type CreatorDashboardView } from "@/lib/cabana-dashboard";

const dashboardKey = ["creator-dashboard"] as const;

/**
 * The current creator's dashboard view model. Returns the aggregated KPIs,
 * revenue/subscriber summaries, and recent activity. `now` is captured at fetch
 * time so the month-scoped roll-ups are stable for the rendered snapshot.
 */
export function useCreatorDashboard() {
  const { user, loading } = useAuthSession();
  return useQuery<CreatorDashboardView>({
    queryKey: dashboardKey,
    enabled: !loading && !!user,
    queryFn: async () => {
      const data = await getCreatorDashboard();
      return buildCreatorDashboard(data, new Date().toISOString());
    },
  });
}
