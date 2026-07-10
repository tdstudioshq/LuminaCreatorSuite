import { createFileRoute } from "@tanstack/react-router";
import { DashHome } from "@/components/cabana/dashboard/DashHome";

export const Route = createFileRoute("/dashboard/link-in-bio")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DashHome,
});
