import { createFileRoute } from "@tanstack/react-router";
import { DiscoveryPage } from "@/components/cabana/discovery/DiscoveryPage";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "CABANA discovery and global search.",
      },
    ],
  }),
  component: DiscoverRoute,
});

function DiscoverRoute() {
  return <DiscoveryPage />;
}
