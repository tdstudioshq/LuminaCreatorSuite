import { motion } from "framer-motion";
import { Bookmark, Gauge, Heart, MessageCircle, type LucideIcon } from "lucide-react";
import type { EngagementAnalyticsView } from "@/lib/cabana-creator-analytics";

const ICONS: Record<string, LucideIcon> = {
  likes: Heart,
  comments: MessageCircle,
  saves: Bookmark,
  rate: Gauge,
};

/** Reusable engagement KPI cards: likes, comments, saves, engagement rate. */
export function EngagementSummary({ engagement }: { engagement: EngagementAnalyticsView }) {
  return (
    <section className="glass-strong rounded-3xl p-6">
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold">Engagement</h2>
        <p className="text-xs text-muted-foreground">Totals across posts in this range.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {engagement.kpis.map((card, i) => {
          const Icon = ICONS[card.key] ?? Gauge;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass rounded-2xl p-4"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {card.label}
              </div>
              <div className="mt-1.5 font-display text-2xl font-semibold tabular-nums">
                {card.value}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{card.hint}</div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
