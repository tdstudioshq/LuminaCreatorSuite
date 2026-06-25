import { createFileRoute } from "@tanstack/react-router";
import { MediaKit } from "@/components/cabana/dashboard/MediaKit";

export const Route = createFileRoute("/dashboard/media-kit")({
  head: () => ({ meta: [{ title: "CABANA" }] }),
  component: MediaKit,
});
