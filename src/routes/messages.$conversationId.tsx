import { createFileRoute } from "@tanstack/react-router";
import { ConversationView } from "@/components/cabana/messaging/ConversationView";

export const Route = createFileRoute("/messages/$conversationId")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ConversationRoute,
});

function ConversationRoute() {
  const { conversationId } = Route.useParams();
  return <ConversationView conversationId={conversationId} />;
}
