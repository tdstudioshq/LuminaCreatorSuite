import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "@/components/cabana/messaging/Inbox";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Your CABANA messages." },
    ],
  }),
  component: Inbox,
});
