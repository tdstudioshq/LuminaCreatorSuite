import { format } from "date-fns";
import { formatMoney } from "@/lib/cabana-money";
import { useTips } from "@/lib/use-money";
import { HistoryCard } from "./HistoryCard";

export function TipHistory() {
  const { data, isLoading, isError, refetch } = useTips();
  const rows = data ?? [];

  return (
    <HistoryCard
      title="Tips received"
      count={rows.length}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      isEmpty={rows.length === 0}
      emptyLabel="No tips yet."
    >
      <ul>
        {rows.map((tip) => (
          <li
            key={tip.id}
            className="flex items-start justify-between gap-4 border-b border-border/40 px-6 py-4 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold tabular-nums text-iridescent">
                {formatMoney(tip.amountCents, tip.currency)}
              </p>
              {tip.message && (
                <p className="mt-1 truncate text-xs text-muted-foreground">“{tip.message}”</p>
              )}
            </div>
            <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {format(new Date(tip.createdAt), "MMM d, yyyy")}
            </time>
          </li>
        ))}
      </ul>
    </HistoryCard>
  );
}
