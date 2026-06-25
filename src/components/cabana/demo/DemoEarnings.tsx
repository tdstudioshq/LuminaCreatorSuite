import { motion } from "framer-motion";
import { format } from "date-fns";
import { CABANA_DEMO_DATA } from "@/lib/cabana-demo-data";
import { deriveCreatorBalance, formatMoney, type LedgerTransaction } from "@/lib/cabana-money";
import { DemoNotice, DemoPageHeader, StatusPill } from "@/components/cabana/demo/DemoShell";

const TYPE_LABELS: Record<string, string> = {
  creator_subscription: "Subscription",
  product: "Product",
  post_unlock: "Post unlock",
  paid_message: "Paid message",
  tip: "Tip",
  refund: "Refund",
  adjustment: "Adjustment",
};

export function DemoEarnings() {
  const { transactions } = CABANA_DEMO_DATA;
  // The balance is *derived* from the ledger — never stored as truth.
  const balance = deriveCreatorBalance(transactions as LedgerTransaction[]);

  const summary = [
    { label: "Available", value: formatMoney(balance.availableCents), emphasis: true },
    { label: "Pending", value: formatMoney(balance.pendingCents) },
    { label: "Lifetime net", value: formatMoney(balance.lifetimeNetCents) },
    { label: "Lifetime gross", value: formatMoney(balance.lifetimeGrossCents) },
    { label: "Fees", value: formatMoney(balance.lifetimeFeesCents) },
    { label: "Paid out", value: formatMoney(balance.lifetimePaidOutCents) },
  ];

  return (
    <div className="space-y-8">
      <DemoPageHeader
        eyebrow="Monetization"
        title="Earnings"
        description="A ledger-first view of subscriptions, tips, and purchases. All values are demo data derived from the mock transaction ledger and cannot move money."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {summary.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`rounded-2xl p-5 ${s.emphasis ? "glass-strong" : "glass"}`}
          >
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div
              className={`mt-2 font-display font-semibold tabular-nums ${
                s.emphasis ? "text-3xl text-iridescent" : "text-2xl"
              }`}
            >
              {s.value}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <h3 className="font-display text-lg font-semibold">Transaction ledger</h3>
          <span className="text-xs text-muted-foreground">{transactions.length} records</span>
        </div>
        <div className="hidden grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr] gap-4 border-b border-border/50 px-6 py-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground md:grid">
          <span>Type</span>
          <span>Gross</span>
          <span>Fees</span>
          <span>Net</span>
          <span>Status</span>
          <span>Date</span>
        </div>
        <ul>
          {transactions.map((txn, index) => (
            <motion.li
              key={txn.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
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
              <div className="text-xs text-muted-foreground tabular-nums">
                {format(new Date(txn.createdAt), "MMM d, yyyy")}
              </div>
            </motion.li>
          ))}
        </ul>
      </div>

      <DemoNotice>
        Demo ledger from the mock data layer. The balance is derived from succeeded transactions
        minus fees and payouts. No real payment, payout, or refund is processed in this phase.
      </DemoNotice>
    </div>
  );
}
