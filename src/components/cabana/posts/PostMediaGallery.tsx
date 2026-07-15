import { ImageOff } from "lucide-react";
import { usePostMediaUrls } from "@/lib/use-posts";
import { useStreamPlayback } from "@/lib/use-stream-playback";
import { useFeedBatchGate } from "@/lib/feed-batch-context";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import { StreamVideoPlayer } from "./StreamVideoPlayer";

/**
 * Fetches authorization-gated media for a post and renders it.
 * `enabled` should be false for locked posts so no request is made.
 *
 * Video and images come from two different backends and are fetched by two
 * different actions, so this forks on `hasVideo` rather than fetching both: the
 * media-mix rule is one video XOR images, so exactly one branch is ever live and
 * the other would be a guaranteed-empty round-trip.
 */
export function PostMediaGallery({
  postId,
  enabled = true,
  flush = false,
  hasVideo = false,
}: {
  postId: string;
  enabled?: boolean;
  flush?: boolean;
  /** True when the post's media descriptors include a video (feed RPCs carry `kind`). */
  hasVideo?: boolean;
}) {
  if (!enabled) return null;
  return hasVideo ? (
    <PostVideo postId={postId} flush={flush} />
  ) : (
    <PostImages postId={postId} flush={flush} />
  );
}

function Skeleton({ flush }: { flush: boolean }) {
  return (
    <div className={`aspect-[4/5] w-full animate-pulse bg-white/5 ${flush ? "" : "rounded-2xl"}`} />
  );
}

function PostVideo({ postId, flush }: { postId: string; flush: boolean }) {
  const batched = useFeedBatchGate();
  const { data: items, isLoading, isError, refetch } = useStreamPlayback(postId);

  if (isLoading || (batched && items === undefined && !isError)) return <Skeleton flush={flush} />;
  if (isError && !items) {
    return <QueryErrorState title="Couldn’t load this video" onRetry={refetch} />;
  }
  // Empty is the deny-by-default answer AND the not-ready-yet answer: the server
  // issues no token for a video that is processing, errored, or not viewable.
  // Rendering nothing is correct for all of them — and a processing video starts
  // playing on its own once encoding finishes and this query refetches.
  if (!items || items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2">
      {items.map((item) => (
        <StreamVideoPlayer key={item.mediaId} item={item} flush={flush} />
      ))}
    </div>
  );
}

function PostImages({ postId, flush }: { postId: string; flush: boolean }) {
  const batched = useFeedBatchGate();
  const { data: media, isLoading, isError, refetch } = usePostMediaUrls(postId);

  // Inside a FeedBatchScope this query is disabled (isLoading stays false) while
  // the scope batch-signs the media; keep showing the skeleton until the cache is
  // seeded so there's no empty-frame layout shift (PostCard only mounts this
  // gallery when the post actually has media).
  if (isLoading || (batched && media === undefined && !isError)) return <Skeleton flush={flush} />;
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
