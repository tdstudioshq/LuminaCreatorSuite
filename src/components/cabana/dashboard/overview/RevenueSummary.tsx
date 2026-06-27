import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, WalletCards } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatMoney } from "@/lib/cabana-money";
import type { RevenueSummaryView } from "@/lib/cabana-dashboard";

/**
 * Revenue overview: lifetime + this-month totals, available balance, reserved
 * payouts, lifetime withdrawn, and the most recent settled earnings. Every
 * figure is pre-derived by the pure aggregator from the immutable ledger.
 */
export function RevenueSummary({ revenue }: { revenue: RevenueSummaryView }) {
  const { currency } = revenue;
  const stats = [
    { label: "Total revenue", value: revenue.totalRevenueCents, emphasis: true },
    { label: "This month", value: revenue.monthlyRevenueCents },
    { label: "Available", value: revenue.availableCents },
    { label: "Pending", value: revenue.pendingCents },
    { label: "Reserved payouts", value: revenue.pendingPayoutsCents },
    { label: "Withdrawn", value: revenue.lifetimePaidOutCents },
  ];

  return (
    <section className="glass-strong flex h-full flex-col rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Revenue</h2>
          <p className="text-xs text-muted-foreground">Computed from your demo ledger.</p>
        </div>
        <Link
          to="/dashboard/earnings"
          className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <WalletCards className="h-3.5 w-3.5" /> Earnings
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-2xl p-4 ${s.emphasis ? "bg-foreground/[0.06]" : "glass"}`}
          >
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
            <div
              className={`mt-1.5 font-display font-semibold tabular-nums ${s.emphasis ? "text-2xl text-iridescent" : "text-xl"}`}
            >
              {formatMoney(s.value, currency)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Recent earnings</div>
        {revenue.recentEarnings.length === 0 ? (
          <p className="rounded-2xl border border-border/50 bg-foreground/[0.02] px-4 py-3 text-xs text-muted-foreground">
            No earnings yet. Sell a post, add a subscription tier, or receive a tip to get started.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {revenue.recentEarnings.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400/80" />
                  <span>{e.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                  </span>
                </div>
                <span className="font-medium tabular-nums">
                  +{formatMoney(e.amountCents, e.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
