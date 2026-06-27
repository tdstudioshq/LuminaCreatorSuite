import { Link } from "@tanstack/react-router";
import { Bookmark, Heart, MessageCircle, type LucideIcon } from "lucide-react";
import type { AnalyticsPost, ContentAnalyticsView } from "@/lib/cabana-creator-analytics";

function captionLabel(caption: string): string {
  const trimmed = caption.trim();
  return trimmed.length > 0 ? trimmed : "Untitled post";
}

function TopList({
  title,
  icon: Icon,
  posts,
  metric,
}: {
  title: string;
  icon: LucideIcon;
  posts: AnalyticsPost[];
  metric: (p: AnalyticsPost) => number;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      {posts.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No data in this range yet.</p>
      ) : (
        <ol className="space-y-2">
          {posts.map((p, i) => (
            <li key={p.postId} className="flex items-center gap-2.5 text-sm">
              <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <Link
                to="/post/$postId"
                params={{ postId: p.postId }}
                className="min-w-0 flex-1 truncate hover:text-iridescent"
                title={captionLabel(p.caption)}
              >
                {captionLabel(p.caption)}
              </Link>
              <span className="shrink-0 font-medium tabular-nums">{metric(p)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ContentAnalytics({ content }: { content: ContentAnalyticsView }) {
  return (
    <section className="glass-strong rounded-3xl p-6">
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold">Top content</h2>
        <p className="text-xs text-muted-foreground">Your best-performing posts in this range.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <TopList
          title="Most liked"
          icon={Heart}
          posts={content.topByLikes}
          metric={(p) => p.likeCount}
        />
        <TopList
          title="Most commented"
          icon={MessageCircle}
          posts={content.topByComments}
          metric={(p) => p.commentCount}
        />
        <TopList
          title="Most saved"
          icon={Bookmark}
          posts={content.topBySaves}
          metric={(p) => p.saveCount}
        />
      </div>
    </section>
  );
}
