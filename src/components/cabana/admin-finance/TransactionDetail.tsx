import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  creatorLabel,
  formatCents,
  transactionStatusLabel,
  transactionTypeLabel,
} from "@/lib/cabana-finance";
import { useAdminTransactionDetail } from "@/lib/use-admin-finance";

export function TransactionDetail({ transactionId }: { transactionId: string }) {
  const { data: txn, isLoading, isError } = useAdminTransactionDetail(transactionId);

  return (
    <div className="space-y-5">
      <Link
        to="/admin/ledger"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to ledger
      </Link>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : isError || !txn ? (
        <div className="glass-strong rounded-3xl p-8 text-center">
          <p className="text-sm font-medium">Transaction not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            It may not exist, or you don’t have access to it.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="glass-strong rounded-3xl p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {transactionTypeLabel(txn.type)} · {transactionStatusLabel(txn.status)}
                </p>
                <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
                  {formatCents(txn.grossCents, txn.currency)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(txn.createdAt).toLocaleString()}
              </p>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <Row label="Creator" value={creatorLabel(txn)} />
              <Row label="Platform fee" value={formatCents(txn.platformFeeCents, txn.currency)} />
              <Row label="Currency" value={txn.currency} />
              <Row label="Processor fee" value={formatCents(txn.processorFeeCents, txn.currency)} />
              <Row label="Reference type" value={txn.referenceType ?? "—"} />
              <Row label="Creator net" value={formatCents(txn.creatorNetCents, txn.currency)} />
              <Row label="Reference id" value={txn.referenceId ?? "—"} mono />
              <Row label="Payer" value={txn.payerUserId ?? "—"} mono />
              <Row label="Transaction id" value={txn.id} mono />
              <Row label="Provider ref" value={txn.mockProviderReference ?? "—"} mono />
            </dl>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Demo Mode — this is a mock ledger entry. The ledger is append-only; reversals are
            recorded as separate refund transactions.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/20 pb-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-right text-sm ${mono ? "break-all font-mono text-xs" : "tabular-nums"}`}>
        {value}
      </dd>
    </div>
  );
}
