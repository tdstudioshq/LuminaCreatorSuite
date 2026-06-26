import { createFileRoute } from "@tanstack/react-router";
import { SubscribersDashboard } from "@/components/cabana/subscriptions/SubscribersDashboard";

export const Route = createFileRoute("/dashboard/subscribers")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SubscribersDashboard,
});
