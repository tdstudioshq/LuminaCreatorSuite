import { motion } from "framer-motion";
import type { KpiCardView, KpiTone } from "@/lib/cabana-dashboard";

const TONE_VALUE: Record<KpiTone, string> = {
  neutral: "text-foreground",
  positive: "text-iridescent",
  attention: "text-amber-200",
};

const TONE_DOT: Record<KpiTone, string> = {
  neutral: "bg-muted-foreground/40",
  positive: "bg-emerald-400/80",
  attention: "bg-amber-400/80",
};

/**
 * The seven dashboard KPI cards. All values + hints are pre-computed by the pure
 * `buildKpiCards`; this component only paints them. Laid out as an even 4-up
 * money row + 3-up subscriber row so no card is ever orphaned on its own line at
 * any breakpoint; grid stretch keeps cards in a row equal-height.
 */
export function KpiCards({ cards }: { cards: KpiCardView[] }) {
  const money = cards.slice(0, 4);
  const subscribers = cards.slice(4);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {money.map((card, i) => (
          <KpiCard key={card.key} card={card} index={i} />
        ))}
      </div>
      {subscribers.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {subscribers.map((card, i) => (
            <KpiCard key={card.key} card={card} index={money.length + i} />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ card, index }: { card: KpiCardView; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="glass-strong flex h-full flex-col rounded-3xl p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{card.label}</span>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[card.tone]}`} />
      </div>
      <div
        className={`mt-3 font-display text-2xl font-semibold tabular-nums lg:text-3xl ${TONE_VALUE[card.tone]}`}
      >
        {card.value}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{card.hint}</div>
    </motion.div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <KpiSkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

function KpiSkeletonCard() {
  return (
    <div className="glass-strong h-[104px] animate-pulse rounded-3xl p-5">
      <div className="h-3 w-20 rounded bg-foreground/10" />
      <div className="mt-4 h-6 w-24 rounded bg-foreground/10" />
      <div className="mt-3 h-2 w-16 rounded bg-foreground/5" />
    </div>
  );
}
