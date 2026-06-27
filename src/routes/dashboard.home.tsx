import { createFileRoute } from "@tanstack/react-router";
import { CreatorDashboard } from "@/components/cabana/dashboard/overview/CreatorDashboard";

export const Route = createFileRoute("/dashboard/home")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: CreatorDashboard,
});
