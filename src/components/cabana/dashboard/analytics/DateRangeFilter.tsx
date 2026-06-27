import {
  ANALYTICS_RANGES,
  ANALYTICS_RANGE_LABELS,
  type AnalyticsRange,
} from "@/lib/cabana-creator-analytics";

/** Segmented control for the analytics date range (7d / 30d / 90d / all). */
export function DateRangeFilter({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex items-center gap-1 rounded-full glass p-1"
    >
      {ANALYTICS_RANGES.map((range) => {
        const active = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(range)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-iridescent text-background shadow-glow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {ANALYTICS_RANGE_LABELS[range]}
          </button>
        );
      })}
    </div>
  );
}
