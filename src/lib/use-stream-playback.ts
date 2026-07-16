// ============================================================================
// CABANA — Stream playback React hooks (Checkpoint 5B)
// ----------------------------------------------------------------------------
// The read side of Stream video. Deliberately the exact twin of
// `usePostMediaUrls` (use-posts.ts): same cache-key shape, same FeedBatchScope
// gate, same "hold the URL just under its signing TTL" staleTime — because the
// two are the same problem (authorize, sign, cache, don't re-sign needlessly)
// applied to two different storage backends.
//
// Authorization is NOT this layer's job and must never be reimplemented here:
// `getStreamPlayback(+Batch)` runs `can_view_post` under the caller's own
// context and only then reads READY media with the service role. A viewer who
// cannot see the post gets an empty array, never a token.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { useFeedBatchGate } from "@/lib/feed-batch-context";
import { getStreamPlayback } from "@/lib/stream-actions";
import { STREAM_PLAYBACK_TOKEN_TTL_SECONDS } from "@/lib/cabana-stream";

export const streamPlaybackKey = (postId: string) => ["stream-playback", postId] as const;

/**
 * Hold a signed playback token for most of its life, but re-sign before it
 * expires: a token handed to an <iframe> after expiry fails to play, and the
 * user's only recovery would be a reload. 10 minutes of headroom under the
 * 1-hour TTL covers a long watch session started right before the cutoff.
 */
export const STREAM_PLAYBACK_STALE_MS = (STREAM_PLAYBACK_TOKEN_TTL_SECONDS - 600) * 1000;

/**
 * Signed playback for one post's Stream media.
 *
 * `enabled` should be false for locked posts and for posts with no video, so a
 * viewer who cannot play anything never issues a request. Inside a
 * <FeedBatchScope> this query is disabled and the scope seeds this exact cache
 * in one batched round-trip; outside a scope (post detail) it fetches per post.
 */
export function useStreamPlayback(postId: string | null, enabled = true) {
  const batched = useFeedBatchGate();
  return useQuery({
    queryKey: streamPlaybackKey(postId ?? ""),
    enabled: enabled && !!postId && !batched,
    queryFn: () => getStreamPlayback({ data: { postId: postId! } }),
    staleTime: STREAM_PLAYBACK_STALE_MS,
  });
}
