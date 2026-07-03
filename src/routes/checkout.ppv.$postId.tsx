import { createFileRoute } from "@tanstack/react-router";
import { RequireSignedIn } from "@/components/cabana/auth/RequireSignedIn";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/checkout/ppv/$postId")({
  head: () => ({ meta: [{ title: "PPV Checkout | CABANA" }] }),
  component: PpvCheckoutRoute,
});

function PpvCheckoutRoute() {
  const { postId } = Route.useParams();
  return (
    <RequireSignedIn>
      <MvpRouteShell
        eyebrow="Checkout"
        title="PPV unlock checkout"
        description={`MVP shell for unlocking post ${postId}: post summary, creator summary, price, payment method, entitlement update, and failure state.`}
        primaryTo="/feed"
        primaryLabel="Back to feed"
        secondaryTo="/billing"
        secondaryLabel="Billing"
      />
    </RequireSignedIn>
  );
}
