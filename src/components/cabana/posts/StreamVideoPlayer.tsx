// ============================================================================
// CABANA — Stream video player (Checkpoint 5B)
// ----------------------------------------------------------------------------
// Poster-first, click-to-mount. The resting state is a plain <img> thumbnail
// plus our own play affordance; the Cloudflare <iframe> player is only mounted
// once the viewer explicitly asks for it.
//
// WHY THE IFRAME, not hls.js:
// Cloudflare serves HLS, which natively plays ONLY in Safari — every other
// browser needs a JS player (~150KB gzip), a second lockfile entry, an
// optimizeDeps entry, and ownership of ABR/SSR-safety. The iframe is already
// built by `buildStreamPlaybackUrls` and costs nothing. The trade we accept is
// that our design system stops at the frame boundary, which is exactly why the
// RESTING state (all the feed ever shows) is ours and the frame appears only on
// intent. It also keeps a 20-post feed from mounting 20 player bundles.
//
// NOT autoplay: nothing plays until a click. `autoplay=true` is added only to
// the post-click mount so the viewer's single gesture actually starts playback
// instead of requiring a second press inside the frame.
// ============================================================================
import { useState } from "react";
import { Play, VideoOff } from "lucide-react";
import { formatStreamDuration } from "@/lib/cabana-stream";
import type { StreamPlaybackItem } from "@/lib/stream-actions";

/** Cloudflare's player controls its own chrome; we only pass intent. */
function iframeSrc(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}autoplay=true`;
}

function aspectStyle(item: StreamPlaybackItem) {
  return item.width && item.height
    ? { aspectRatio: `${item.width} / ${item.height}` }
    : { aspectRatio: "16 / 9" };
}

export function StreamVideoPlayer({
  item,
  flush = false,
}: {
  item: StreamPlaybackItem;
  flush?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const duration = formatStreamDuration(item.durationSeconds);
  const radius = flush ? "" : "rounded-2xl";

  if (playing) {
    return (
      <div className={`relative overflow-hidden bg-black ${radius}`} style={aspectStyle(item)}>
        <iframe
          src={iframeSrc(item.urls.iframe)}
          title="Video player"
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; gyroscope; encrypted-media; picture-in-picture;"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label="Play video"
      className={`group relative block w-full overflow-hidden bg-black/40 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${radius}`}
      style={aspectStyle(item)}
    >
      {posterFailed ? (
        // The token signs the thumbnail too, so a poster failure is usually an
        // expired token rather than a missing video — the frame is still
        // playable, so this stays an affordance, not an error state.
        <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <VideoOff className="h-5 w-5" />
        </span>
      ) : (
        <img
          src={item.urls.thumbnail}
          alt=""
          loading="lazy"
          onError={() => setPosterFailed(true)}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02] group-hover:opacity-90"
        />
      )}

      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/55 backdrop-blur-md transition group-hover:scale-105 group-hover:bg-black/70">
          <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
        </span>
      </span>

      {duration ? (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
          {duration}
        </span>
      ) : null}
    </button>
  );
}
