import { motion } from "framer-motion";
import { format } from "date-fns";
import { Heart, MessageCircle, Bookmark, Globe, Users, Crown, Lock } from "lucide-react";
import type { ContentVisibility } from "@/lib/cabana-types";
import { CABANA_DEMO_DATA } from "@/lib/cabana-demo-data";
import { formatMoney } from "@/lib/cabana-money";
import { DemoNotice, DemoPageHeader, StatusPill } from "@/components/cabana/demo/DemoShell";

const VISIBILITY_META: Record<
  ContentVisibility,
  { label: string; icon: typeof Globe; className: string }
> = {
  public: { label: "Public", icon: Globe, className: "text-foreground/70" },
  followers: { label: "Followers", icon: Users, className: "text-sky-300/90" },
  subscribers: { label: "Subscribers", icon: Crown, className: "text-iridescent" },
  purchase: { label: "Paid unlock", icon: Lock, className: "text-amber-300/90" },
};

export function DemoPosts() {
  const { posts } = CABANA_DEMO_DATA;

  return (
    <div className="space-y-8">
      <DemoPageHeader
        eyebrow="Creator publishing"
        title="Posts"
        description="Your publishing surface for premium updates, media drops, and subscriber-only releases. These are demo posts from the mock data layer — nothing is published live."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Posts" value={posts.length} />
        <Stat
          label="Subscriber-only"
          value={posts.filter((p) => p.visibility === "subscribers").length}
        />
        <Stat label="Likes" value={posts.reduce((s, p) => s + p.likeCount, 0)} />
        <Stat label="Comments" value={posts.reduce((s, p) => s + p.commentCount, 0)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {posts.map((post, index) => {
          const meta = VISIBILITY_META[post.visibility];
          const Icon = meta.icon;
          return (
            <motion.article
              key={post.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass flex flex-col gap-4 rounded-3xl p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.className}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                  {post.visibility === "purchase" && post.priceCents != null
                    ? ` · ${formatMoney(post.priceCents, post.currency ?? "USD")}`
                    : ""}
                </span>
                <StatusPill status={post.status} />
              </div>

              <p className="text-sm leading-relaxed text-foreground/85">{post.caption}</p>

              <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5" /> {post.likeCount}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5" /> {post.commentCount}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Bookmark className="h-3.5 w-3.5" /> {post.saveCount}
                  </span>
                </div>
                {post.publishedAt ? (
                  <span className="tabular-nums">
                    {format(new Date(post.publishedAt), "MMM d, yyyy")}
                  </span>
                ) : null}
              </div>
            </motion.article>
          );
        })}
      </div>

      <DemoNotice>
        Demo content from the mock data layer. The post composer, media uploads, scheduling, and
        comment moderation are not active in this phase.
      </DemoNotice>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="font-display text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
