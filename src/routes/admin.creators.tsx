import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/admin/creators")({
  head: () => ({
    meta: [{ title: "Creators | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminCreatorsRoute,
});

function AdminCreatorsRoute() {
  return (
    <MvpRouteShell
      eyebrow="Admin"
      title="Creator management"
      description="MVP shell for creator search, verification review, suspension, profile detail, and audit logging."
      bullets={[
        "Creator table and detail",
        "Verification approve/reject workflow",
        "Suspension and visibility controls",
      ]}
      primaryTo="/admin"
      primaryLabel="Admin overview"
      secondaryTo="/admin/compliance"
      secondaryLabel="Compliance"
    />
  );
}
