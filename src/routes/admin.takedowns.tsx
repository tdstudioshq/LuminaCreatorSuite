import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/admin/takedowns")({
  head: () => ({
    meta: [{ title: "Takedowns | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminTakedownsRoute,
});

function AdminTakedownsRoute() {
  return (
    <MvpRouteShell
      eyebrow="Admin"
      title="Takedown queue"
      description="MVP shell for DMCA, consent, safety, and adult-policy takedown requests with target content links and audit logging."
      bullets={[
        "Takedown request queue",
        "Target content and user links",
        "Resolution reasons and audit entries",
      ]}
      primaryTo="/admin/reports"
      primaryLabel="Reports queue"
      secondaryTo="/takedown"
      secondaryLabel="Public form"
    />
  );
}
