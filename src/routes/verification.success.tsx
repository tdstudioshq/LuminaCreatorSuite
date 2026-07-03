import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/verification/success")({
  head: () => ({ meta: [{ title: "Verification Success | CABANA" }] }),
  component: VerificationSuccessRoute,
});

function VerificationSuccessRoute() {
  return (
    <MvpRouteShell
      eyebrow="Verification"
      title="Verification complete"
      description="MVP shell for successful fan or creator verification and next-step routing."
      status="MVP shell / Verification provider pending"
      primaryTo="/dashboard/compliance"
      primaryLabel="Compliance"
      secondaryTo="/feed"
      secondaryLabel="Feed"
    />
  );
}
