import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/dashboard/payouts")({
  head: () => ({
    meta: [{ title: "Payouts | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: CreatorPayoutsRoute,
});

function CreatorPayoutsRoute() {
  return (
    <MvpRouteShell
      contained
      eyebrow="Creator studio"
      title="Payouts"
      description="MVP shell for payout history, payout request flow, KYC gates, available balance checks, and held/declined reasons."
      bullets={["Payout history", "Request payout workflow", "KYC and balance gates"]}
      primaryTo="/dashboard/earnings"
      primaryLabel="Back to earnings"
      secondaryTo="/dashboard/compliance"
      secondaryLabel="Compliance"
    />
  );
}
