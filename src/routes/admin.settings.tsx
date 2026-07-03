import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "Admin Settings | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminSettingsRoute,
});

function AdminSettingsRoute() {
  return (
    <MvpRouteShell
      eyebrow="Admin"
      title="Platform settings"
      description="MVP shell for role permissions, policy settings, payment settings, compliance settings, notification templates, and feature flags."
      bullets={[
        "Role and permission settings",
        "Policy and compliance controls",
        "Feature flags and notification templates",
      ]}
      primaryTo="/admin"
      primaryLabel="Admin overview"
      secondaryTo="/admin/audit"
      secondaryLabel="Audit log"
    />
  );
}
