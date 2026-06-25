import { motion } from "framer-motion";
import { Archive, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Post } from "@/lib/cabana-posts";
import { useArchivePost, useDeletePost, useOwnPosts, usePublishPost } from "@/lib/use-posts";
import { PostComposer } from "./PostComposer";
import { PostVisibilityBadge } from "./PostVisibilityBadge";
import { PostMediaGallery } from "./PostMediaGallery";

const STATUS_STYLES: Record<Post["status"], string> = {
  draft: "text-muted-foreground",
  scheduled: "text-sky-300/90",
  published: "text-emerald-300/90",
  archived: "text-amber-300/80",
};

export function PostsDashboard() {
  const { data: posts, isLoading } = useOwnPosts();
  const publishPost = usePublishPost();
  const archivePost = useArchivePost();
  const deletePost = useDeletePost();

  async function run(action: Promise<unknown>, ok: string) {
    try {
      await action;
      toast.success(ok);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow text-muted-foreground mb-1.5">Creator publishing</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Posts</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Publish public updates or followers-only drops. Followers-only media stays private and is
          served through authorized, expiring links.
        </p>
      </div>

      <PostComposer />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Your posts</h2>

        {isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !posts || posts.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
            No posts yet. Share your first update above.
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post, i) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass flex flex-col gap-3 rounded-2xl p-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-widest ${STATUS_STYLES[post.status]}`}
                  >
                    {post.status}
                  </span>
                  <PostVisibilityBadge visibility={post.visibility} />
                  <div className="ml-auto flex items-center gap-1">
                    {post.status !== "published" && (
                      <button
                        onClick={() => void run(publishPost.mutateAsync(post.id), "Published.")}
                        className="btn-ghost !px-2.5 !py-1.5 text-[11px]"
                        title="Publish"
                      >
                        <Send className="h-3.5 w-3.5" /> Publish
                      </button>
                    )}
                    {post.status !== "archived" && (
                      <button
                        onClick={() => void run(archivePost.mutateAsync(post.id), "Archived.")}
                        className="btn-ghost !px-2 !py-1.5 text-[11px]"
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => void run(deletePost.mutateAsync(post.id), "Deleted.")}
                      className="btn-ghost !px-2 !py-1.5 text-[11px] text-red-300/80"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {post.caption && (
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{post.caption}</p>
                )}
                <PostMediaGallery postId={post.id} />
              </motion.article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
