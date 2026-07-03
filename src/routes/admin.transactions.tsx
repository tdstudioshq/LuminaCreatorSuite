import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";
import { FinanceShell } from "@/components/cabana/admin-finance/FinanceShell";
import { LedgerExplorer } from "@/components/cabana/admin-finance/LedgerExplorer";

export const Route = createFileRoute("/admin/transactions")({
  head: () => ({
    meta: [{ title: "Transactions | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminTransactionsRoute,
});

function AdminTransactionsRoute() {
  return (
    <AdminGate redirect="/admin/transactions">
      <FinanceShell
        active="transactions"
        eyebrow="Finance and operations"
        title="Transactions"
        description="Admin transaction table for ledger search, type filters, status filters, gross/fee/net values, and CSV export."
      >
        <LedgerExplorer />
      </FinanceShell>
    </AdminGate>
  );
}
