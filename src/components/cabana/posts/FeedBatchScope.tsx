// H-08 feed batching scope.
//
// Wrap a list of PostCards in this to collapse the per-card N+1 (one
// getPostMediaUrls + one getPostEngagementState PER card → ~2N server-fn calls
// for an N-post feed) into at most TWO batched round-trips. It seeds the exact
// per-post React Query caches the cards read (`["post-media", id]` /
// `["engagement", id]`) and flips the FeedBatchContext gate so the cards'
// hooks observe those caches instead of fetching. Behavior is preserved: cards
// render identical media/engagement, like/save toggles still mutate the same
// cache keys, and the single-post detail page (no scope) keeps fetching per post.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getPostMediaUrlsBatch } from "@/lib/post-actions";
import { getPostEngagementStateBatch } from "@/lib/engagement-actions";
import { getStreamPlaybackBatch } from "@/lib/stream-actions";
import { FeedBatchContext } from "@/lib/feed-batch-context";
import { STREAM_PLAYBACK_STALE_MS } from "@/lib/use-stream-playback";

// Mirror usePostMediaUrls' staleTime so we never re-sign media that is still
// within its signed-URL validity window (avoids "load more" image flicker).
const MEDIA_STALE_MS = 25 * 60_000;
// Match the QueryClient's global staleTime so a batched feed refreshes others'
// like/comment counts on the same cadence the per-card query used pre-batching.
const ENGAGEMENT_STALE_MS = 30_000;

export function FeedBatchScope({
  mediaPostIds,
  videoPostIds = [],
  engagementPostIds,
  children,
}: {
  /** Ids of non-locked posts that HAVE image media (need signed URLs). */
  mediaPostIds: string[];
  /** Ids of non-locked posts that HAVE video media (need signed playback tokens). */
  videoPostIds?: string[];
  /** Ids of non-locked posts (need engagement state). */
  engagementPostIds: string[];
  children: React.ReactNode;
}) {
  const qc = useQueryClient();
  const mediaKey = [...mediaPostIds].sort().join(",");
  const videoKey = [...videoPostIds].sort().join(",");
  const engagementKey = [...engagementPostIds].sort().join(",");

  // Media: only sign ids without a fresh cached entry (respects the 25-min TTL).
  useEffect(() => {
    const ids = mediaPostIds.filter((id) => {
      const state = qc.getQueryState(["post-media", id]);
      return !state || state.isInvalidated || Date.now() - state.dataUpdatedAt > MEDIA_STALE_MS;
    });
    if (ids.length === 0) return;
    let cancelled = false;
    void getPostMediaUrlsBatch({ data: { postIds: ids } })
      .then((map) => {
        if (cancelled) return;
        for (const id of ids) qc.setQueryData(["post-media", id], map[id] ?? []);
      })
      .catch(() => {
        // Leave caches unseeded on failure; cards render without media rather
        // than crash. The feed query itself surfaces connectivity errors.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey, qc]);

  // Video: the same batching story as media, against Cloudflare instead of
  // Supabase storage. Kept as its own effect (not merged into the media one)
  // because the two hit different actions with different TTLs — a token lives an
  // hour, a signed storage URL half that — so merging them would re-sign one
  // backend on the other's cadence.
  useEffect(() => {
    const ids = videoPostIds.filter((id) => {
      const state = qc.getQueryState(["stream-playback", id]);
      return (
        !state || state.isInvalidated || Date.now() - state.dataUpdatedAt > STREAM_PLAYBACK_STALE_MS
      );
    });
    if (ids.length === 0) return;
    let cancelled = false;
    void getStreamPlaybackBatch({ data: { postIds: ids } })
      .then((map) => {
        if (cancelled) return;
        for (const id of ids) qc.setQueryData(["stream-playback", id], map[id] ?? []);
      })
      .catch(() => {
        // Leave caches unseeded on failure; cards render the skeleton and then
        // nothing, rather than crashing the feed.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKey, qc]);

  // Engagement: seed ids that are missing, invalidated, or stale — mirroring the
  // per-card query's old 30s refresh so a batched feed still picks up OTHERS'
  // like/comment activity (self-actions already update via setQueryData). Without
  // the staleness/invalidation check the disabled batched query would freeze
  // counts for the whole session.
  useEffect(() => {
    const ids = engagementPostIds.filter((id) => {
      const state = qc.getQueryState(["engagement", id]);
      return (
        !state || state.isInvalidated || Date.now() - state.dataUpdatedAt > ENGAGEMENT_STALE_MS
      );
    });
    if (ids.length === 0) return;
    let cancelled = false;
    void getPostEngagementStateBatch({ data: { postIds: ids } })
      .then((map) => {
        if (cancelled) return;
        for (const id of ids) if (map[id]) qc.setQueryData(["engagement", id], map[id]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagementKey, qc]);

  return <FeedBatchContext.Provider value={true}>{children}</FeedBatchContext.Provider>;
}
