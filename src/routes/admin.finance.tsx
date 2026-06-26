import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";
import { FinanceOverview } from "@/components/cabana/admin-finance/FinanceOverview";
import { FinanceShell } from "@/components/cabana/admin-finance/FinanceShell";

export const Route = createFileRoute("/admin/finance")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "CABANA admin finance overview." },
    ],
  }),
  component: FinanceRoute,
});

function FinanceRoute() {
  return (
    <AdminGate redirect="/admin/finance">
      <FinanceShell
        active="finance"
        eyebrow="Finance & operations"
        title="Finance overview"
        description="Platform revenue, creator earnings, and payout status across the mock ledger. Read-only — all figures are demo data drawn from the immutable Phase 6 ledger."
      >
        <FinanceOverview />
      </FinanceShell>
    </AdminGate>
  );
}
