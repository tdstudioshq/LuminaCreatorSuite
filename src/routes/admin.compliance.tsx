import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/admin/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance Admin | CABANA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminComplianceRoute,
});

function AdminComplianceRoute() {
  return (
    <MvpRouteShell
      eyebrow="Admin"
      title="Compliance dashboard"
      description="MVP shell for age verification, KYC, performer records, consent records, 2257 records, and flagged explicit content summaries."
      bullets={[
        "Age/KYC queue summaries",
        "Performer and consent record review",
        "2257/content record readiness",
      ]}
      primaryTo="/admin"
      primaryLabel="Admin overview"
      secondaryTo="/admin/takedowns"
      secondaryLabel="Takedowns"
    />
  );
}
