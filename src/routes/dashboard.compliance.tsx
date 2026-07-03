import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/dashboard/compliance")({
  head: () => ({
    meta: [{ title: "Compliance | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: CreatorComplianceRoute,
});

function CreatorComplianceRoute() {
  return (
    <MvpRouteShell
      contained
      eyebrow="Creator studio"
      title="Compliance"
      description="MVP shell for age verification, KYC, performer records, consent/release records, and 2257 content record status."
      bullets={[
        "Age verification and KYC status",
        "Performer and consent records",
        "2257/content record readiness",
      ]}
      primaryTo="/dashboard/home"
      primaryLabel="Dashboard home"
      secondaryTo="/legal/2257"
      secondaryLabel="2257 statement"
    />
  );
}
