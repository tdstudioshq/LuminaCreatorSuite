import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Link } from "@tanstack/react-router";
import { ExternalLink, MoreHorizontal, UserRound } from "lucide-react";
import type { FeedPost } from "@/lib/cabana-posts";
import { ReportButton } from "@/components/cabana/reporting/ReportButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PostVisibilityBadge } from "./PostVisibilityBadge";
import { PostMediaGallery } from "./PostMediaGallery";
import { LockedContentGate } from "./LockedContentGate";
import { EngagementBar } from "./EngagementBar";

export function PostCard({
  post,
  index = 0,
  onUnlock,
  unlockPending = false,
  isOwner = false,
}: {
  post: FeedPost;
  index?: number;
  onUnlock?: () => void;
  unlockPending?: boolean;
  /** Hide the report control on the viewer's own post. */
  isOwner?: boolean;
}) {
  const initial = (post.displayName || post.username || "?").charAt(0).toUpperCase();
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="group/post relative overflow-hidden bg-[oklch(0.145_0.016_280/0.7)] shadow-[0_28px_80px_-65px_oklch(0.78_0.18_280/0.9)] transition-colors hover:bg-[oklch(0.155_0.018_280/0.78)]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent opacity-0 transition-opacity group-hover/post:opacity-100" />
      <header className="flex items-start gap-3.5 px-5 pb-3 pt-5 sm:px-6">
        <Link
          to="/$username"
          params={{ username: post.username }}
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5 text-sm font-medium outline-none ring-2 ring-white/[0.08] transition-all hover:scale-[1.03] hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View ${post.displayName}'s profile`}
        >
          {post.avatarUrl ? (
            <img src={post.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </Link>
        <div className="min-w-0 flex-1 pt-0.5">
          <Link
            to="/$username"
            params={{ username: post.username }}
            className="block w-fit truncate text-[15px] font-semibold tracking-[-0.01em] outline-none transition-colors hover:text-primary focus-visible:text-primary"
          >
            {post.displayName}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">@{post.username}</span>
            {post.publishedAt ? (
              <>
                <span aria-hidden>·</span>
                <time>{formatDistanceToNow(new Date(post.publishedAt), { addSuffix: true })}</time>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <PostVisibilityBadge visibility={post.visibility} />
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {!isOwner && !post.locked && (
            <ReportButton subjectType="post" subjectId={post.postId} subjectLabel="post" iconOnly />
          )}
          <PostMenu post={post} isOwner={isOwner} />
        </div>
      </header>

      {post.locked ? (
        <div className="px-5 pb-5 sm:px-6">
          <LockedContentGate
            visibility={post.visibility}
            username={post.username}
            onUnlock={onUnlock}
            pending={unlockPending}
          />
        </div>
      ) : (
        <>
          {post.caption && (
            <p className="whitespace-pre-wrap px-5 pb-4 text-[15px] leading-relaxed text-foreground/90 sm:px-6">
              {post.caption}
            </p>
          )}
          {post.media.length > 0 && (
            <div className="border-y border-white/[0.07] bg-black/20">
              <PostMediaGallery postId={post.postId} flush />
            </div>
          )}
          <div className="px-4 py-2.5 sm:px-5">
            <EngagementBar postId={post.postId} />
          </div>
        </>
      )}
    </motion.article>
  );
}

function PostMenu({ post, isOwner }: { post: FeedPost; isOwner: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Post options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-44 rounded-2xl border-border/70 bg-popover/95 p-1.5 shadow-luxury backdrop-blur-xl"
      >
        <DropdownMenuItem asChild className="cursor-pointer rounded-xl">
          <Link to="/post/$postId" params={{ postId: post.postId }}>
            <ExternalLink className="h-4 w-4" /> View post
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer rounded-xl">
          <Link to="/$username" params={{ username: post.username }}>
            <UserRound className="h-4 w-4" /> View creator
          </Link>
        </DropdownMenuItem>
        {isOwner ? (
          <DropdownMenuItem asChild className="cursor-pointer rounded-xl">
            <Link to="/dashboard/posts">Manage posts</Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
