import { createFileRoute } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { FoundationPage } from "@/components/cabana/foundation/FoundationPage";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "CABANA creator discovery foundation.",
      },
    ],
  }),
  component: DiscoverFoundation,
});

const capabilities = [
  "Curated creator discovery and category browsing",
  "Public-profile-safe search results",
  "Featured creator and editorial collection modules",
  "No ranking or recommendation service in Phase 1",
] as const;

function DiscoverFoundation() {
  return (
    <FoundationPage
      publicShell
      eyebrow="Explore CABANA"
      title="Discover"
      description="A premium discovery surface for finding creators and collections without changing the existing creator profile experience."
      icon={Compass}
      capabilities={capabilities}
      backTo="/"
      backLabel="Back to CABANA"
    />
  );
}
