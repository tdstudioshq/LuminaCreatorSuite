import { createFileRoute } from "@tanstack/react-router";
import { RequireSignedIn } from "@/components/cabana/auth/RequireSignedIn";
import { ConversationView } from "@/components/cabana/messaging/ConversationView";

export const Route = createFileRoute("/messages/$conversationId")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ConversationRoute,
});

function ConversationRoute() {
  const { conversationId } = Route.useParams();
  return (
    <RequireSignedIn>
      <ConversationView conversationId={conversationId} />
    </RequireSignedIn>
  );
}
