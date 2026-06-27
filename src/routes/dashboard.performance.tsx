import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsDashboard } from "@/components/cabana/dashboard/analytics/AnalyticsDashboard";

export const Route = createFileRoute("/dashboard/performance")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AnalyticsDashboard,
});
