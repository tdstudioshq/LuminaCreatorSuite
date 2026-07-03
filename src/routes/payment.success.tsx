import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/payment/success")({
  head: () => ({ meta: [{ title: "Payment Success | CABANA" }] }),
  component: PaymentSuccessRoute,
});

function PaymentSuccessRoute() {
  return (
    <MvpRouteShell
      eyebrow="Payment"
      title="Payment successful"
      description="MVP shell for successful subscription, unlock, or tip confirmation with clear next actions and receipt context."
      status="MVP shell / Payment provider pending"
      primaryTo="/feed"
      primaryLabel="Back to feed"
      secondaryTo="/billing"
      secondaryLabel="View billing"
    />
  );
}
