import { createFileRoute } from "@tanstack/react-router";
import { DemoSubscribers } from "@/components/cabana/demo/DemoSubscribers";

export const Route = createFileRoute("/dashboard/subscribers")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DemoSubscribers,
});
