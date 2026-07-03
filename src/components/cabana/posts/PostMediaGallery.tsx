import { ImageOff } from "lucide-react";
import { usePostMediaUrls } from "@/lib/use-posts";

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
  const { data: media, isLoading } = usePostMediaUrls(postId, enabled);

  if (!enabled) return null;
  if (isLoading) {
    return (
      <div
        className={`aspect-[4/5] w-full animate-pulse bg-white/5 ${flush ? "" : "rounded-2xl"}`}
      />
    );
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
