import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/dashboard/posts/new")({
  head: () => ({
    meta: [{ title: "New Post | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: NewPostRoute,
});

function NewPostRoute() {
  return (
    <MvpRouteShell
      contained
      eyebrow="Creator studio"
      title="Create post"
      description="Dedicated MVP shell for the creator composer: text, audience selection, PPV pricing, media attach, drafts, publishing, and scheduling."
      bullets={[
        "Text and media composer",
        "Public, subscriber, and PPV options",
        "Draft, publish, and schedule actions",
      ]}
      primaryTo="/dashboard/posts"
      primaryLabel="Back to posts"
      secondaryTo="/dashboard/home"
      secondaryLabel="Dashboard home"
    />
  );
}
