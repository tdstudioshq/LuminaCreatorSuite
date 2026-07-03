import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/verification/failed")({
  head: () => ({ meta: [{ title: "Verification Failed | CABANA" }] }),
  component: VerificationFailedRoute,
});

function VerificationFailedRoute() {
  return (
    <MvpRouteShell
      eyebrow="Verification"
      title="Verification failed"
      description="MVP shell for failed verification, retry guidance, reason display, and support escalation."
      status="MVP shell / Verification provider pending"
      primaryTo="/support"
      primaryLabel="Contact support"
      secondaryTo="/dashboard/compliance"
      secondaryLabel="Compliance"
    />
  );
}
