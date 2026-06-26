import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type ReportItem, reportReasonLabel, reportSubjectLabel } from "@/lib/cabana-moderation";
import { ModerationActionDialog } from "./ModerationActionDialog";
import { ReportStatusBadge } from "./ReportStatusBadge";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}

export function ReportDetail({
  report,
  open,
  onOpenChange,
}: {
  report: ReportItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {report ? (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="font-display text-2xl tracking-tight">
                  {reportReasonLabel(report.reason)}
                </DialogTitle>
                <ReportStatusBadge status={report.status} />
              </div>
              <DialogDescription>
                {reportSubjectLabel(report.subjectType)} report · filed{" "}
                {new Date(report.createdAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-4 py-2">
              <Field label="Subject type" value={reportSubjectLabel(report.subjectType)} />
              <Field label="Subject ID" value={report.subjectId} />
              <Field label="Reporter" value={report.reporterUserId} />
              <Field label="Assigned to" value={report.assignedAdminUserId ?? "Unassigned"} />
            </dl>

            <div className="space-y-1">
              <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Details
              </dt>
              <dd className="text-sm text-muted-foreground">
                {report.details ?? "No additional details provided."}
              </dd>
            </div>

            {report.resolution ? (
              <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-3">
                <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Resolution
                </dt>
                <dd className="text-sm">{report.resolution}</dd>
              </div>
            ) : null}

            <ModerationActionDialog report={report} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
