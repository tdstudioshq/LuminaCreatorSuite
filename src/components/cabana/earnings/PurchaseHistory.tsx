import { format } from "date-fns";
import { formatMoney } from "@/lib/cabana-money";
import { usePurchases } from "@/lib/use-money";
import { StatusPill } from "@/components/cabana/demo/DemoShell";
import { HistoryCard } from "./HistoryCard";

/** Sales: one-time purchases (post unlocks) of the creator's content. */
export function PurchaseHistory() {
  const { data, isLoading } = usePurchases();
  const rows = data ?? [];

  return (
    <HistoryCard
      title="Sales"
      count={rows.length}
      isLoading={isLoading}
      isEmpty={rows.length === 0}
      emptyLabel="No content sales yet. Publish a paid post to start selling unlocks."
    >
      <ul>
        {rows.map((purchase) => (
          <li
            key={purchase.id}
            className="flex items-center justify-between gap-4 border-b border-border/40 px-6 py-4 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="font-medium tabular-nums">
                {formatMoney(purchase.amountCents, purchase.currency)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Post unlock</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill status={purchase.status} />
              <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {format(new Date(purchase.createdAt), "MMM d, yyyy")}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </HistoryCard>
  );
}
