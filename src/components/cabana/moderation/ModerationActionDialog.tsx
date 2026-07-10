import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type ReportItem,
  type ReportStatus,
  allowedTransitions,
  reportStatusLabel,
} from "@/lib/cabana-moderation";
import { useAssignReport, useUpdateReportStatus } from "@/lib/use-moderation";

/**
 * Staff triage controls for a single report: assign-to-me and a validated
 * status change with an optional resolution note. Each action is server- and
 * RLS-authorized; the DB trigger writes the audit row.
 */
export function ModerationActionDialog({ report }: { report: ReportItem }) {
  const transitions = allowedTransitions(report.status);
  const [target, setTarget] = useState<ReportStatus | "">("");
  const [resolution, setResolution] = useState("");

  const assign = useAssignReport();
  const update = useUpdateReportStatus();

  async function onAssign() {
    try {
      await assign.mutateAsync(report.id);
      toast.success("Report assigned to you.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not assign the report.");
    }
  }

  async function onApply() {
    if (!target) return;
    try {
      await update.mutateAsync({
        reportId: report.id,
        status: target,
        resolution: resolution.trim() || undefined,
      });
      toast.success(`Report moved to ${reportStatusLabel(target)}.`);
      setTarget("");
      setResolution("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the report.");
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border glass p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Triage</span>
        <Button variant="ghost" size="sm" onClick={onAssign} disabled={assign.isPending}>
          {assign.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserCheck className="h-3.5 w-3.5" />
          )}
          Assign to me
        </Button>
      </div>

      {transitions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No further actions available.</p>
      ) : (
        <div className="space-y-3">
          <Select value={target} onValueChange={(v) => setTarget(v as ReportStatus)}>
            <SelectTrigger>
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              {transitions.map((s) => (
                <SelectItem key={s} value={s}>
                  {reportStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Resolution note (optional)"
            maxLength={2000}
            rows={3}
          />
          <Button
            className="btn-luxury w-full"
            onClick={onApply}
            disabled={!target || update.isPending}
            loading={update.isPending}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
