import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/cabana-money";
import { useBalance } from "@/lib/use-money";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import { PayoutRequestDialog } from "./PayoutRequestDialog";

/**
 * The creator's balance summary, derived server-side from the immutable ledger
 * (never stored as truth). Hosts the mock payout-request dialog.
 */
export function BalanceCard() {
  const { data: balance, isLoading, isError, refetch } = useBalance();

  const available = balance?.availableCents ?? 0;
  const stats = [
    { label: "Available", value: available, emphasis: true },
    { label: "Pending", value: balance?.pendingCents ?? 0 },
    { label: "Lifetime net", value: balance?.lifetimeNetCents ?? 0 },
    { label: "Lifetime gross", value: balance?.lifetimeGrossCents ?? 0 },
    { label: "Fees", value: balance?.lifetimeFeesCents ?? 0 },
    { label: "Withdrawn", value: balance?.lifetimePaidOutCents ?? 0 },
  ];

  return (
    <section className="glass-strong rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Balance</h2>
          <p className="text-xs text-muted-foreground">
            Computed from your demo ledger. No real money is held.
          </p>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : isError ? null : (
          <PayoutRequestDialog availableCents={available} />
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`animate-pulse rounded-2xl p-5 ${s.emphasis ? "bg-foreground/[0.06]" : "glass"}`}
            >
              <div className="h-3 w-16 rounded bg-foreground/10" />
              <div className="mt-3 h-7 w-24 rounded bg-foreground/10" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState title="Couldn’t load your balance" onRetry={refetch} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`rounded-2xl p-5 ${s.emphasis ? "bg-foreground/[0.06]" : "glass"}`}
            >
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div
                className={`mt-2 font-display font-semibold tabular-nums ${
                  s.emphasis ? "text-3xl text-iridescent" : "text-2xl"
                }`}
              >
                {formatMoney(s.value)}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
