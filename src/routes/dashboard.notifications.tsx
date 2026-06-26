import { createFileRoute } from "@tanstack/react-router";
import { NotificationsDashboard } from "@/components/cabana/notifications/NotificationsDashboard";

export const Route = createFileRoute("/dashboard/notifications")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: NotificationsDashboard,
});
