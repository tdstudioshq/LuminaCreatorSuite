import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [{ title: "Users | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminUsersRoute,
});

function AdminUsersRoute() {
  return (
    <MvpRouteShell
      eyebrow="Admin"
      title="User management"
      description="MVP shell for user search, role/status filters, user detail, suspend/reinstate actions, and audit logging."
      bullets={[
        "Searchable user table",
        "Role and status filters",
        "Suspension actions with audit trail",
      ]}
      primaryTo="/admin"
      primaryLabel="Admin overview"
      secondaryTo="/admin/audit"
      secondaryLabel="Audit log"
    />
  );
}
