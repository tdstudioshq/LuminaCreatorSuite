import { createFileRoute } from "@tanstack/react-router";
import { RequireSignedIn } from "@/components/cabana/auth/RequireSignedIn";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/checkout/subscribe/$creatorId")({
  head: () => ({ meta: [{ title: "Subscribe Checkout | CABANA" }] }),
  component: SubscribeCheckoutRoute,
});

function SubscribeCheckoutRoute() {
  const { creatorId } = Route.useParams();
  return (
    <RequireSignedIn>
      <MvpRouteShell
        eyebrow="Checkout"
        title="Subscribe checkout"
        description={`MVP shell for subscribing to creator ${creatorId}: creator summary, price, benefits, payment method, confirmation, and success/failure states.`}
        primaryTo="/explore"
        primaryLabel="Explore creators"
        secondaryTo="/billing"
        secondaryLabel="Billing"
      />
    </RequireSignedIn>
  );
}
