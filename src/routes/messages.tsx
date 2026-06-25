import { createFileRoute } from "@tanstack/react-router";
import { MessageCircleMore } from "lucide-react";
import { FoundationPage } from "@/components/cabana/foundation/FoundationPage";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "CABANA member messaging foundation.",
      },
    ],
  }),
  component: MemberMessagesFoundation,
});

const capabilities = [
  "Member conversation list and chat view",
  "Participant-only message access",
  "Read state and future real-time delivery",
  "No private data or paid messages are active",
] as const;

function MemberMessagesFoundation() {
  return (
    <FoundationPage
      publicShell
      eyebrow="Member inbox"
      title="Messages"
      description="A future member inbox for direct creator conversations. Authentication, participant authorization, and real-time delivery will be added in later phases."
      icon={MessageCircleMore}
      capabilities={capabilities}
      backTo="/"
      backLabel="Back to CABANA"
    />
  );
}
