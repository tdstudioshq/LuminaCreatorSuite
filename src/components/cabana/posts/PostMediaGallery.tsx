import { ImageOff } from "lucide-react";
import { usePostMediaUrls } from "@/lib/use-posts";
import { useFeedBatchGate } from "@/lib/feed-batch-context";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";

/**
 * Fetches authorization-gated signed URLs for a post's media and renders them.
 * `enabled` should be false for locked posts so no request is made.
 */
export function PostMediaGallery({
  postId,
  enabled = true,
  flush = false,
}: {
  postId: string;
  enabled?: boolean;
  flush?: boolean;
}) {
  const batched = useFeedBatchGate();
  const { data: media, isLoading, isError, refetch } = usePostMediaUrls(postId, enabled);

  if (!enabled) return null;
  // Inside a FeedBatchScope this query is disabled (isLoading stays false) while
  // the scope batch-signs the media; keep showing the skeleton until the cache is
  // seeded so there's no empty-frame layout shift (PostCard only mounts this
  // gallery when the post actually has media).
  if (isLoading || (batched && media === undefined && !isError)) {
    return (
      <div
        className={`aspect-[4/5] w-full animate-pulse bg-white/5 ${flush ? "" : "rounded-2xl"}`}
      />
    );
  }
  // Error card only when there is nothing to show — a failed background
  // refetch keeps rendering the cached media rather than yanking it away.
  if (isError && !media) {
    return <QueryErrorState title="Couldn’t load this post’s media" onRetry={refetch} />;
  }
  if (!media || media.length === 0) return null;

  return (
    <div className={`grid gap-2 ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {media.map((m) => (
        <div
          key={m.id}
          className={`relative overflow-hidden bg-white/5 ${flush ? "" : "rounded-2xl"}`}
        >
          {m.url ? (
            <img
              src={m.url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              style={m.width && m.height ? { aspectRatio: `${m.width} / ${m.height}` } : undefined}
            />
          ) : (
            <div className="flex aspect-square items-center justify-center text-muted-foreground">
              <ImageOff className="h-5 w-5" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
