// ============================================================================
// CABANA — reusable report reason selector (Phase 8B)
// ----------------------------------------------------------------------------
// A radio list of the member-facing report reasons. Order + labels come from
// the pure `cabana-moderation` module (the single source of truth shared with
// the DB enum + admin queue), so this never drifts from the validated reason
// set or the staff-side labels.
// ============================================================================
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { REPORT_REASONS, type ReportReason, reportReasonLabel } from "@/lib/cabana-moderation";

export function ReportReasonSelect({
  value,
  onChange,
  disabled,
  idPrefix = "report-reason",
}: {
  value: ReportReason | null;
  onChange: (reason: ReportReason) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <RadioGroup
      value={value ?? undefined}
      onValueChange={(v) => onChange(v as ReportReason)}
      disabled={disabled}
      className="gap-2"
      aria-label="Reason for report"
    >
      {REPORT_REASONS.map((reason) => {
        const id = `${idPrefix}-${reason}`;
        return (
          <div
            key={reason}
            className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
          >
            <RadioGroupItem value={reason} id={id} />
            <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal">
              {reportReasonLabel(reason)}
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}
