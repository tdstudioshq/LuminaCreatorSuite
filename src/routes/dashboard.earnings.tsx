import { createFileRoute } from "@tanstack/react-router";
import { DemoEarnings } from "@/components/cabana/demo/DemoEarnings";

export const Route = createFileRoute("/dashboard/earnings")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DemoEarnings,
});
