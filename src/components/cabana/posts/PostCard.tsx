import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import type { FeedPost } from "@/lib/cabana-posts";
import { PostVisibilityBadge } from "./PostVisibilityBadge";
import { PostMediaGallery } from "./PostMediaGallery";
import { LockedContentGate } from "./LockedContentGate";
import { EngagementBar } from "./EngagementBar";

export function PostCard({
  post,
  index = 0,
  onUnlock,
  unlockPending = false,
}: {
  post: FeedPost;
  index?: number;
  onUnlock?: () => void;
  unlockPending?: boolean;
}) {
  const initial = (post.displayName || post.username || "?").charAt(0).toUpperCase();
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="glass flex flex-col gap-4 rounded-3xl p-5"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/5 text-sm font-medium">
          {post.avatarUrl ? (
            <img src={post.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{post.displayName}</p>
          <p className="truncate text-[11px] text-muted-foreground">@{post.username}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <PostVisibilityBadge visibility={post.visibility} />
          {post.publishedAt && (
            <time className="text-[10px] text-muted-foreground/70">
              {formatDistanceToNow(new Date(post.publishedAt), { addSuffix: true })}
            </time>
          )}
        </div>
      </header>

      {post.locked ? (
        <LockedContentGate onUnlock={onUnlock} pending={unlockPending} />
      ) : (
        <>
          {post.caption && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {post.caption}
            </p>
          )}
          {post.media.length > 0 && <PostMediaGallery postId={post.postId} />}
          <EngagementBar postId={post.postId} />
        </>
      )}
    </motion.article>
  );
}
