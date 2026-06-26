import { Link } from "@tanstack/react-router";
import {
  Banknote,
  CircleDollarSign,
  Clock,
  Loader2,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import {
  creatorLabel,
  formatCents,
  rollupPayouts,
  sortCreatorEarnings,
  summarizeRevenue,
  totalCreatorAvailable,
} from "@/lib/cabana-finance";
import {
  useAdminCreatorEarnings,
  useAdminPayouts,
  useAdminTransactions,
} from "@/lib/use-admin-finance";

export function FinanceOverview() {
  const txns = useAdminTransactions();
  const payouts = useAdminPayouts();
  const earnings = useAdminCreatorEarnings();

  if (txns.isLoading || payouts.isLoading || earnings.isLoading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (txns.isError || payouts.isError || earnings.isError) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
        Couldn’t load finance data.
      </div>
    );
  }

  const revenue = summarizeRevenue(txns.data ?? []);
  const payoutRollup = rollupPayouts(payouts.data ?? []);
  const topCreators = sortCreatorEarnings(earnings.data ?? []).slice(0, 10);
  const owedToCreators = totalCreatorAvailable(earnings.data ?? []);

  return (
    <div className="space-y-8">
      {/* Revenue overview */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Revenue overview</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            Icon={TrendingUp}
            label="Platform revenue"
            value={formatCents(revenue.platformFeeCents)}
            hint={`${revenue.settledCount} settled · ${revenue.refundCount} refunds`}
            accent
          />
          <Stat
            Icon={CircleDollarSign}
            label="Gross processed"
            value={formatCents(revenue.grossCents)}
            hint={`Processor fees ${formatCents(revenue.processorFeeCents)}`}
          />
          <Stat
            Icon={Banknote}
            label="Creator net"
            value={formatCents(revenue.creatorNetCents)}
            hint={`${formatCents(owedToCreators)} currently available`}
          />
          <Stat
            Icon={Clock}
            label="Pending transactions"
            value={String(revenue.pendingCount)}
            hint="Not yet settled"
          />
        </div>
      </section>

      {/* Payout status */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Payouts</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            Icon={Clock}
            label="Pending payouts"
            value={formatCents(payoutRollup.pending.amountCents)}
            hint={`${payoutRollup.pending.count} queued / processing`}
          />
          <Stat
            Icon={Banknote}
            label="Completed payouts"
            value={formatCents(payoutRollup.completed.amountCents)}
            hint={`${payoutRollup.completed.count} paid`}
          />
          <Stat
            Icon={XCircle}
            label="Failed payouts"
            value={formatCents(payoutRollup.failed.amountCents)}
            hint={`${payoutRollup.failed.count} failed / canceled`}
          />
        </div>
      </section>

      {/* Creator earnings */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Top creator earnings</h2>
          <Link to="/admin/ledger" className="text-xs text-muted-foreground hover:text-foreground">
            View ledger →
          </Link>
        </div>
        {topCreators.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 h-5 w-5" />
            No creator balances yet.
          </div>
        ) : (
          <div className="glass overflow-hidden rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Creator</th>
                  <th className="px-4 py-3 text-right font-medium">Lifetime net</th>
                  <th className="px-4 py-3 text-right font-medium">Available</th>
                  <th className="px-4 py-3 text-right font-medium">Paid out</th>
                </tr>
              </thead>
              <tbody>
                {topCreators.map((c) => (
                  <tr key={c.creatorProfileId} className="border-b border-border/30 last:border-0">
                    <td className="px-4 py-3 font-medium">{creatorLabel(c)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCents(c.lifetimeNetCents, c.currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCents(c.availableCents, c.currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatCents(c.lifetimePaidOutCents, c.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  Icon,
  label,
  value,
  hint,
  accent = false,
}: {
  Icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`glass rounded-2xl p-4 ${accent ? "ring-1 ring-iridescent/30" : ""}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
