import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";
import { FinanceShell } from "@/components/cabana/admin-finance/FinanceShell";
import { PayoutQueue } from "@/components/cabana/admin-finance/PayoutQueue";

export const Route = createFileRoute("/admin/payouts")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "CABANA admin payout management." },
    ],
  }),
  component: PayoutsRoute,
});

function PayoutsRoute() {
  return (
    <AdminGate redirect="/admin/payouts">
      <FinanceShell
        active="payouts"
        eyebrow="Finance & operations"
        title="Payout management"
        description="Review creator payout requests: approve, place on hold, release, reject, or mark paid. Every decision is transition-validated, settles the mock disbursement, and writes an immutable audit entry."
      >
        <PayoutQueue />
      </FinanceShell>
    </AdminGate>
  );
}
