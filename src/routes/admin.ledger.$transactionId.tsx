import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";
import { FinanceShell } from "@/components/cabana/admin-finance/FinanceShell";
import { TransactionDetail } from "@/components/cabana/admin-finance/TransactionDetail";

export const Route = createFileRoute("/admin/ledger/$transactionId")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "CABANA admin transaction detail." },
    ],
  }),
  component: TransactionDetailRoute,
});

function TransactionDetailRoute() {
  const { transactionId } = Route.useParams();
  return (
    <AdminGate redirect="/admin/ledger">
      <FinanceShell
        active="ledger"
        eyebrow="Finance & operations"
        title="Transaction detail"
        description="A single ledger entry with its full fee breakdown and references."
      >
        <TransactionDetail transactionId={transactionId} />
      </FinanceShell>
    </AdminGate>
  );
}
