import { createFileRoute } from "@tanstack/react-router";
import { RequireSignedIn } from "@/components/cabana/auth/RequireSignedIn";
import { Inbox } from "@/components/cabana/messaging/Inbox";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Your CABANA messages." },
    ],
  }),
  component: MessagesRoute,
});

function MessagesRoute() {
  return (
    <RequireSignedIn>
      <Inbox />
    </RequireSignedIn>
  );
}
