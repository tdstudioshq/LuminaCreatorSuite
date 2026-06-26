import { format } from "date-fns";
import { formatMoney } from "@/lib/cabana-money";
import { useTransactions } from "@/lib/use-money";
import { StatusPill } from "@/components/cabana/demo/DemoShell";
import { HistoryCard } from "./HistoryCard";

const TYPE_LABELS: Record<string, string> = {
  creator_subscription: "Subscription",
  product: "Product",
  post_unlock: "Post unlock",
  paid_message: "Paid message",
  tip: "Tip",
  refund: "Refund",
  adjustment: "Adjustment",
};

export function TransactionHistory() {
  const { data, isLoading } = useTransactions();
  const rows = data ?? [];

  return (
    <HistoryCard
      title="Transaction ledger"
      count={rows.length}
      isLoading={isLoading}
      isEmpty={rows.length === 0}
      emptyLabel="No transactions yet. Tips and purchases will appear here."
    >
      <div className="hidden grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr] gap-4 border-b border-border/50 px-6 py-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground md:grid">
        <span>Type</span>
        <span>Gross</span>
        <span>Fees</span>
        <span>Net</span>
        <span>Status</span>
        <span>Date</span>
      </div>
      <ul>
        {rows.map((txn) => (
          <li
            key={txn.id}
            className="grid grid-cols-2 items-center gap-3 border-b border-border/40 px-6 py-4 text-sm last:border-b-0 md:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr] md:gap-4"
          >
            <div className="font-medium">{TYPE_LABELS[txn.type] ?? txn.type}</div>
            <div className="tabular-nums text-foreground/85">
              {formatMoney(txn.grossCents, txn.currency)}
            </div>
            <div className="tabular-nums text-muted-foreground">
              {formatMoney(txn.platformFeeCents + txn.processorFeeCents, txn.currency)}
            </div>
            <div className="tabular-nums text-foreground/85">
              {formatMoney(txn.creatorNetCents, txn.currency)}
            </div>
            <div>
              <StatusPill status={txn.status} />
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {format(new Date(txn.createdAt), "MMM d, yyyy")}
            </div>
          </li>
        ))}
      </ul>
    </HistoryCard>
  );
}
