import { createFileRoute } from "@tanstack/react-router";
import { ModerationShell } from "@/components/cabana/moderation/ModerationShell";
import { ReportQueue } from "@/components/cabana/moderation/ReportQueue";
import { StaffGate } from "@/components/cabana/moderation/StaffGate";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "CABANA admin moderation queue." },
    ],
  }),
  component: ReportsRoute,
});

function ReportsRoute() {
  return (
    <StaffGate redirect="/admin/reports">
      <ModerationShell
        active="reports"
        eyebrow="Trust & safety"
        title="Reports"
        description="Triage member-submitted reports. Assigning or changing a report's status is server-authorized (admin/moderator) and writes an immutable entry to the audit log."
      >
        <ReportQueue />
      </ModerationShell>
    </StaffGate>
  );
}
