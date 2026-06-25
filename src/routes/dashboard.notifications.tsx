import { createFileRoute } from "@tanstack/react-router";
import { DemoNotifications } from "@/components/cabana/demo/DemoNotifications";

export const Route = createFileRoute("/dashboard/notifications")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DemoNotifications,
});
