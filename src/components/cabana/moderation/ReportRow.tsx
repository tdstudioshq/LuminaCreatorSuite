import { ChevronRight, Flag } from "lucide-react";
import { type ReportItem, reportReasonLabel, reportSubjectLabel } from "@/lib/cabana-moderation";
import { ReportStatusBadge } from "./ReportStatusBadge";

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportRow({ report, onSelect }: { report: ReportItem; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="group flex w-full items-center gap-4 rounded-2xl border border-border glass px-4 py-3 text-left transition hover:border-foreground/20"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/40">
        <Flag className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{reportReasonLabel(report.reason)}</span>
          <span className="text-xs text-muted-foreground">
            {reportSubjectLabel(report.subjectType)} · {shortId(report.subjectId)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {report.details ?? "No additional details provided."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {formatDate(report.createdAt)}
        </span>
        <ReportStatusBadge status={report.status} />
        <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
