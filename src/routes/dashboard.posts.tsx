import { createFileRoute } from "@tanstack/react-router";
import { PostsDashboard } from "@/components/cabana/posts/PostsDashboard";

export const Route = createFileRoute("/dashboard/posts")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PostsDashboard,
});
