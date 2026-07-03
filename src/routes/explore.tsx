import { createFileRoute } from "@tanstack/react-router";
import { DiscoveryPage } from "@/components/cabana/discovery/DiscoveryPage";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "description", content: "Explore creators on CABANA." }],
  }),
  component: DiscoveryPage,
});
