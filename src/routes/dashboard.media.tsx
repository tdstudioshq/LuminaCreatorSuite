import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/dashboard/media")({
  head: () => ({
    meta: [{ title: "Media | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: MediaRoute,
});

function MediaRoute() {
  return (
    <MvpRouteShell
      contained
      eyebrow="Creator studio"
      title="Media library"
      description="MVP shell for creator media management: uploads, search, type filters, detail preview, used/unused state, and deletion."
      bullets={[
        "Photo and video library",
        "Upload and detail preview flow",
        "Used/unused media indicators",
      ]}
      primaryTo="/dashboard/home"
      primaryLabel="Dashboard home"
      secondaryTo="/dashboard/posts/new"
      secondaryLabel="Create post"
    />
  );
}
