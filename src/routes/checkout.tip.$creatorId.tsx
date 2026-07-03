import { createFileRoute } from "@tanstack/react-router";
import { RequireSignedIn } from "@/components/cabana/auth/RequireSignedIn";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/checkout/tip/$creatorId")({
  head: () => ({ meta: [{ title: "Tip Checkout | CABANA" }] }),
  component: TipCheckoutRoute,
});

function TipCheckoutRoute() {
  const { creatorId } = Route.useParams();
  return (
    <RequireSignedIn>
      <MvpRouteShell
        eyebrow="Checkout"
        title="Tip checkout"
        description={`MVP shell for tipping creator ${creatorId}: tip amount, optional message, validation, payment method, and success/failure states.`}
        primaryTo="/explore"
        primaryLabel="Explore creators"
        secondaryTo="/billing"
        secondaryLabel="Billing"
      />
    </RequireSignedIn>
  );
}
