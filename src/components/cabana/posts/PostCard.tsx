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
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.4) }}
      className="group/post relative overflow-hidden rounded-xl border border-white/[0.085] bg-[linear-gradient(150deg,oklch(0.18_0.02_280/0.76),oklch(0.14_0.015_280/0.72))] shadow-[0_28px_80px_-58px_oklch(0_0_0/0.95),inset_0_1px_0_oklch(1_0_0/0.075)] transition-all hover:border-white/[0.13] hover:bg-[linear-gradient(150deg,oklch(0.19_0.022_280/0.8),oklch(0.15_0.017_280/0.76))]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent opacity-0 transition-opacity group-hover/post:opacity-100" />
      <header className="flex items-start gap-3.5 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <Link
          to="/$username"
          params={{ username: post.username }}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5 text-sm font-medium outline-none ring-2 ring-white/[0.09] transition-all hover:scale-[1.03] hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring sm:h-12 sm:w-12"
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
            className="block w-fit max-w-full truncate text-[15px] font-semibold tracking-[-0.015em] outline-none transition-colors hover:text-primary focus-visible:text-primary"
          >
            {post.displayName}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="truncate">@{post.username}</span>
            {post.publishedAt ? (
              <>
                <span aria-hidden>·</span>
                <time dateTime={post.publishedAt}>
                  {formatDistanceToNow(new Date(post.publishedAt), { addSuffix: true })}
                </time>
              </>
            ) : null}
            <span className="hidden sm:inline" aria-hidden>
              ·
            </span>
            <span className="basis-full sm:basis-auto">
              <PostVisibilityBadge visibility={post.visibility} />
            </span>
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
        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
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
            <p className="whitespace-pre-wrap px-5 pb-5 text-[15px] leading-7 text-foreground/90 sm:px-6">
              {post.caption}
            </p>
          )}
          {post.media.length > 0 && (
            <div className="mx-3 overflow-hidden rounded-3xl border border-white/[0.075] bg-black/20 sm:mx-4">
              <PostMediaGallery
                postId={post.postId}
                flush
                hasVideo={post.media.some((m) => m.kind === "video")}
              />
            </div>
          )}
          <div
            className={`mx-4 px-0 py-3 sm:mx-5 ${
              post.media.length > 0 ? "" : "border-t border-white/[0.07]"
            }`}
          >
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
