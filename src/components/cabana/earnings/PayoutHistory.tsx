import { format } from "date-fns";
import { formatMoney } from "@/lib/cabana-money";
import { usePayouts } from "@/lib/use-money";
import { StatusPill } from "@/components/cabana/demo/DemoShell";
import { HistoryCard } from "./HistoryCard";

/** Mock payout (disbursement) history. No real payouts are ever issued. */
export function PayoutHistory() {
  const { data, isLoading, isError, refetch } = usePayouts();
  const rows = data ?? [];

  return (
    <HistoryCard
      title="Payouts"
      count={rows.length}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      isEmpty={rows.length === 0}
      emptyLabel="No payouts requested yet."
    >
      <ul>
        {rows.map((payout) => (
          <li
            key={payout.id}
            className="flex items-center justify-between gap-4 border-b border-border/40 px-6 py-4 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="font-medium tabular-nums">
                {formatMoney(payout.amountCents, payout.currency)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Requested {format(new Date(payout.requestedAt), "MMM d, yyyy")}
              </p>
            </div>
            <StatusPill status={payout.status} />
          </li>
        ))}
      </ul>
    </HistoryCard>
  );
}
