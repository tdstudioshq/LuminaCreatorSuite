import { Badge } from "@/components/ui/badge";
import { type ReportStatus, reportStatusLabel } from "@/lib/cabana-moderation";

const STATUS_STYLES: Record<ReportStatus, string> = {
  open: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  reviewing: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  resolved: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  dismissed: "border-border bg-muted/40 text-muted-foreground",
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {reportStatusLabel(status)}
    </Badge>
  );
}
