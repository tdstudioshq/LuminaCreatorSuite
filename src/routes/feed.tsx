import { createFileRoute } from "@tanstack/react-router";
import { RequireSignedIn } from "@/components/cabana/auth/RequireSignedIn";
import { HomeFeed } from "@/components/cabana/posts/HomeFeed";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Your CABANA feed — updates from creators you follow." },
    ],
  }),
  component: FeedRoute,
});

function FeedRoute() {
  return (
    <RequireSignedIn>
      <HomeFeed />
    </RequireSignedIn>
  );
}
