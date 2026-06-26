import { createFileRoute } from "@tanstack/react-router";
import { MemberNotificationsPage } from "@/components/cabana/notifications/MemberNotificationsPage";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "CABANA member notifications.",
      },
    ],
  }),
  component: MemberNotificationsPage,
});
