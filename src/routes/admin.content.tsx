import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/admin/content")({
  head: () => ({
    meta: [{ title: "Content Review | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminContentRoute,
});

function AdminContentRoute() {
  return (
    <MvpRouteShell
      eyebrow="Admin"
      title="Content review"
      description="MVP shell for flagged post, media, and comment review with remove/restore actions and audit logging."
      bullets={[
        "Post, media, and comment queue",
        "Explicit/flagged content status",
        "Remove and restore audit trail",
      ]}
      primaryTo="/admin/reports"
      primaryLabel="Reports queue"
      secondaryTo="/admin/audit"
      secondaryLabel="Audit log"
    />
  );
}
