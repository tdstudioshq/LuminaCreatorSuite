import { useMemo, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type ReportItem,
  type ReportStatus,
  countReportsByStatus,
  reportStatusLabel,
  sortReportsForQueue,
} from "@/lib/cabana-moderation";
import { useReports } from "@/lib/use-moderation";
import { ReportDetail } from "./ReportDetail";
import { ReportRow } from "./ReportRow";

type Filter = "all" | ReportStatus;
const FILTERS: Filter[] = ["all", "open", "reviewing", "resolved", "dismissed"];

/**
 * Staff moderation queue: status-filtered list of reports with a detail +
 * triage drawer. Fetches the RLS-scoped report set once and filters/sorts in
 * the pure layer so the tab counts and ordering stay deterministic.
 */
export function ReportQueue() {
  const { data: reports, isLoading, isError, error } = useReports();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const counts = useMemo(() => countReportsByStatus(reports ?? []), [reports]);
  const visible = useMemo(() => {
    const list = reports ?? [];
    const filtered = filter === "all" ? list : list.filter((r) => r.status === filter);
    return sortReportsForQueue(filtered);
  }, [reports, filter]);

  // Keep the open drawer in sync with refreshed data after a triage action.
  const current = selected ? ((reports ?? []).find((r) => r.id === selected.id) ?? selected) : null;

  function openReport(report: ReportItem) {
    setSelected(report);
    setDetailOpen(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (isError) {
    return (
      <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load reports."}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="glass">
          {FILTERS.map((f) => (
            <TabsTrigger key={f} value={f} className="capitalize">
              {f === "all" ? "All" : reportStatusLabel(f)}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {f === "all" ? (reports ?? []).length : counts[f]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border glass py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No reports in this view.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((report) => (
            <ReportRow key={report.id} report={report} onSelect={() => openReport(report)} />
          ))}
        </div>
      )}

      <ReportDetail report={current} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
