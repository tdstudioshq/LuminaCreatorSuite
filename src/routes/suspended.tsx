import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/suspended")({
  head: () => ({ meta: [{ title: "Suspended | CABANA" }] }),
  component: SuspendedRoute,
});

function SuspendedRoute() {
  return (
    <MvpRouteShell
      eyebrow="Account status"
      title="Account suspended"
      description="This account is suspended. The MVP shell preserves the appeal/support path while protected-route bypass prevention is handled in the auth phase."
      status="Access guard"
      primaryTo="/support"
      primaryLabel="Contact support"
      secondaryTo="/legal/terms"
      secondaryLabel="View terms"
    />
  );
}
