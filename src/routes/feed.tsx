import { createFileRoute } from "@tanstack/react-router";
import { Rows3 } from "lucide-react";
import { FoundationPage } from "@/components/cabana/foundation/FoundationPage";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "CABANA member feed foundation.",
      },
    ],
  }),
  component: FeedFoundation,
});

const capabilities = [
  "Cursor-based post timeline",
  "Public and entitlement-aware content cards",
  "Like, save, and comment foundations",
  "No production feed ranking in Phase 1",
] as const;

function FeedFoundation() {
  return (
    <FoundationPage
      publicShell
      eyebrow="Member experience"
      title="Feed"
      description="The future home for updates from followed and subscribed creators. This route is a styled foundation only and does not expose private or paid content."
      icon={Rows3}
      capabilities={capabilities}
      backTo="/"
      backLabel="Back to CABANA"
    />
  );
}
