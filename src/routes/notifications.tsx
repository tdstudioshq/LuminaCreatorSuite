import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { FoundationPage } from "@/components/cabana/foundation/FoundationPage";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "CABANA member notifications foundation.",
      },
    ],
  }),
  component: MemberNotificationsFoundation,
});

const capabilities = [
  "Member subscription, post, message, and system activity",
  "Read and unread state foundation",
  "Entity-aware deep-link targets",
  "No backend triggers or external delivery in Phase 1",
] as const;

function MemberNotificationsFoundation() {
  return (
    <FoundationPage
      publicShell
      eyebrow="Member activity"
      title="Notifications"
      description="A future member activity center for creator posts, subscription events, messages, and platform notices. This screen currently renders no private account data."
      icon={Bell}
      capabilities={capabilities}
      backTo="/"
      backLabel="Back to CABANA"
    />
  );
}
