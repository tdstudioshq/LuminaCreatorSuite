import { createFileRoute, Outlet, useChildMatches } from "@tanstack/react-router";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";
import { FinanceShell } from "@/components/cabana/admin-finance/FinanceShell";
import { LedgerExplorer } from "@/components/cabana/admin-finance/LedgerExplorer";

export const Route = createFileRoute("/admin/ledger")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "CABANA admin ledger explorer." },
    ],
  }),
  component: LedgerRoute,
});

function LedgerRoute() {
  // /admin/ledger/$transactionId is a child of this route; the detail page
  // brings its own AdminGate + FinanceShell, so defer to it when matched.
  const hasDetail = useChildMatches().length > 0;
  if (hasDetail) return <Outlet />;
  return (
    <AdminGate redirect="/admin/ledger">
      <FinanceShell
        active="ledger"
        eyebrow="Finance & operations"
        title="Ledger explorer"
        description="Read-only explorer over every ledger transaction. Filter by type and status, search, open a transaction for detail, or export the current view to CSV."
      >
        <LedgerExplorer />
      </FinanceShell>
    </AdminGate>
  );
}
