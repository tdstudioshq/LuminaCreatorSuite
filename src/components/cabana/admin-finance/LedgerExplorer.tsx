import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import { Constants } from "@/integrations/supabase/types";
import {
  type TransactionStatus,
  type TransactionType,
  creatorLabel,
  filterTransactions,
  formatCents,
  transactionStatusLabel,
  transactionsToCsv,
  transactionTypeLabel,
} from "@/lib/cabana-finance";
import { useAdminTransactions } from "@/lib/use-admin-finance";

const TYPES = Constants.public.Enums.transaction_type;
const STATUSES = Constants.public.Enums.transaction_status;

// Fetch window sizes — the server action clamps to MAX_LIMIT (1000).
const INITIAL_LIMIT = 500;
const MAX_LIMIT = 1000;

/** Trigger a client-side CSV download of the given transactions. */
function downloadCsv(rows: Parameters<typeof transactionsToCsv>[0]): void {
  const csv = transactionsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cabana-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LedgerExplorer() {
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const { data, isLoading, isError, refetch } = useAdminTransactions(limit);
  const [type, setType] = useState<TransactionType | "all">("all");
  const [status, setStatus] = useState<TransactionStatus | "all">("all");
  const [search, setSearch] = useState("");

  const filtersActive = type !== "all" || status !== "all" || search.trim() !== "";
  const filtered = useMemo(
    () => filterTransactions(data ?? [], { type, status, search }),
    [data, type, status, search],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (isError) {
    return <QueryErrorState title="Couldn’t load the ledger" onRetry={() => refetch()} />;
  }

  const atWindowCap = (data?.length ?? 0) >= limit;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search id, creator, reference…"
            className="pl-9"
          />
        </div>
        <Select value={type} onValueChange={(v) => setType(v as TransactionType | "all")}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {transactionTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as TransactionStatus | "all")}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {transactionStatusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          onClick={() => downloadCsv(filtered)}
          disabled={filtered.length === 0}
          title={
            atWindowCap ? "Exports the currently loaded window only" : "Export filtered rows as CSV"
          }
        >
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {filtered.length} of {data?.length ?? 0} transactions
      </p>

      {atWindowCap && (
        <p className="text-[11px] text-muted-foreground/70">
          Showing the most recent {data?.length ?? 0} transactions — filters, totals and CSV export
          cover only this window.
          {limit < MAX_LIMIT && (
            <button
              onClick={() => setLimit(MAX_LIMIT)}
              className="ml-1.5 underline underline-offset-2 hover:text-foreground"
            >
              Load more
            </button>
          )}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {filtersActive
            ? "No transactions match these filters."
            : "No transactions in the ledger yet."}
        </div>
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Creator</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Gross</th>
                <th className="px-4 py-3 text-right font-medium">Platform</th>
                <th className="px-4 py-3 text-right font-medium">Creator net</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-border/30 last:border-0 hover:bg-white/5">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-medium">{creatorLabel(t)}</td>
                  <td className="px-4 py-3">{transactionTypeLabel(t.type)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {transactionStatusLabel(t.status)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCents(t.grossCents, t.currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatCents(t.platformFeeCents, t.currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCents(t.creatorNetCents, t.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/admin/ledger/$transactionId"
                      params={{ transactionId: t.id }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
