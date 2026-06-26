import { BadgeDollarSign } from "lucide-react";
import { BalanceCard } from "./BalanceCard";
import { TransactionHistory } from "./TransactionHistory";
import { TipHistory } from "./TipHistory";
import { PurchaseHistory } from "./PurchaseHistory";
import { PayoutHistory } from "./PayoutHistory";

/**
 * Creator earnings dashboard (Phase 6) — a real, RLS-scoped view over the
 * internal financial ledger. Every value derives from the immutable
 * `transactions` ledger; the balance is a cached projection, never the source
 * of truth. DEMO ONLY: there is no payment processor and no real money moves.
 */
export function EarningsDashboard() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">Monetization</p>
        <h1 className="font-display text-4xl font-semibold tracking-tighter md:text-5xl">
          Earnings
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Your balance, transaction ledger, tips, sales, and payouts. Balance is computed from the
          immutable ledger — money is never stored as a standalone total.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-medium text-amber-200/90">
          <BadgeDollarSign className="h-3.5 w-3.5" />
          Demo Mode — No real payment is processed.
        </div>
      </header>

      <BalanceCard />
      <TransactionHistory />

      <div className="grid gap-6 lg:grid-cols-2">
        <TipHistory />
        <PurchaseHistory />
      </div>

      <PayoutHistory />

      <p className="rounded-2xl border border-border/60 bg-foreground/[0.03] px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        All monetization in CABANA is demo-only. Purchases, tips, and payouts write integer-cent
        records to a mock ledger with <code>mock_*</code> references; no card, processor, webhook,
        or real disbursement is involved. Historical ledger rows are immutable.
      </p>
    </div>
  );
}
