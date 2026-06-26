import { createFileRoute } from "@tanstack/react-router";
import { PostDetail } from "@/components/cabana/posts/PostDetail";

export const Route = createFileRoute("/post/$postId")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "A post on CABANA." },
    ],
  }),
  component: PostDetailRoute,
});

function PostDetailRoute() {
  const { postId } = Route.useParams();
  return <PostDetail postId={postId} />;
}
