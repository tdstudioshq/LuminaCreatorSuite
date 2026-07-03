import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [{ title: "Privacy | CABANA" }, { name: "description", content: "CABANA privacy." }],
  }),
  component: PrivacyRoute,
});

function PrivacyRoute() {
  return (
    <MvpRouteShell
      eyebrow="Legal"
      title="Privacy policy"
      description="MVP shell for account, payment, verification, messaging, analytics, and compliance data handling."
      bullets={[
        "Account and profile data coverage",
        "Payment and subscription data coverage",
        "Verification and compliance data coverage",
      ]}
      primaryTo="/support"
      primaryLabel="Go to support"
      secondaryTo="/legal/terms"
      secondaryLabel="View terms"
    />
  );
}
