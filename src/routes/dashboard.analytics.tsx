import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/cabana/dashboard/AnalyticsPage";

export const Route = createFileRoute("/dashboard/analytics")({
  head: () => ({ meta: [{ title: "CABANA" }, { name: "robots", content: "noindex" }] }),
  component: AnalyticsPage,
});
