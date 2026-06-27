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
 * The seven dashboard KPI cards. All values + hints are pre-computed by the
 * pure `buildKpiCards`; this component only paints them.
 */
export function KpiCards({ cards }: { cards: KpiCardView[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="glass-strong rounded-3xl p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{card.label}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[card.tone]}`} />
          </div>
          <div
            className={`mt-3 font-display text-2xl font-semibold tabular-nums lg:text-3xl ${TONE_VALUE[card.tone]}`}
          >
            {card.value}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{card.hint}</div>
        </motion.div>
      ))}
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="glass-strong h-[104px] animate-pulse rounded-3xl p-5">
          <div className="h-3 w-20 rounded bg-foreground/10" />
          <div className="mt-4 h-6 w-24 rounded bg-foreground/10" />
          <div className="mt-3 h-2 w-16 rounded bg-foreground/5" />
        </div>
      ))}
    </div>
  );
}
