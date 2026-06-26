import { createFileRoute } from "@tanstack/react-router";
import { AuditLogTable } from "@/components/cabana/moderation/AuditLogTable";
import { ModerationShell } from "@/components/cabana/moderation/ModerationShell";
import { StaffGate } from "@/components/cabana/moderation/StaffGate";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "CABANA admin audit log." },
    ],
  }),
  component: AuditRoute,
});

function AuditRoute() {
  return (
    <StaffGate redirect="/admin/audit">
      <ModerationShell
        active="audit"
        eyebrow="Trust & safety"
        title="Audit log"
        description="An append-only trail of privileged moderation actions. Entries are written at the database layer and can never be edited or deleted."
      >
        <AuditLogTable />
      </ModerationShell>
    </StaffGate>
  );
}
