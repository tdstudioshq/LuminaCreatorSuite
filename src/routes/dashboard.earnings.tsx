import { createFileRoute } from "@tanstack/react-router";
import { EarningsDashboard } from "@/components/cabana/earnings/EarningsDashboard";

export const Route = createFileRoute("/dashboard/earnings")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: EarningsDashboard,
});
