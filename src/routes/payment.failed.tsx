import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/payment/failed")({
  head: () => ({ meta: [{ title: "Payment Failed | CABANA" }] }),
  component: PaymentFailedRoute,
});

function PaymentFailedRoute() {
  return (
    <MvpRouteShell
      eyebrow="Payment"
      title="Payment failed"
      description="MVP shell for failed payment recovery with retry, billing, and support paths."
      status="MVP shell / Payment provider pending"
      primaryTo="/billing"
      primaryLabel="Go to billing"
      secondaryTo="/support"
      secondaryLabel="Contact support"
    />
  );
}
