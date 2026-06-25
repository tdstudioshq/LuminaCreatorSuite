import { createFileRoute } from "@tanstack/react-router";
import { DemoPosts } from "@/components/cabana/demo/DemoPosts";

export const Route = createFileRoute("/dashboard/posts")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DemoPosts,
});
