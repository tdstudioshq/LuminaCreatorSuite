// ============================================================================
// CABANA — reusable report dialog (Phase 8B)
// ----------------------------------------------------------------------------
// The member-facing reporting form. Reuses the existing moderation backend: the
// `useCreateReport` hook → `createReport` server action → `reports` INSERT under
// the caller's RLS. No new business logic lives here — validation + the reason
// set come from `cabana-moderation`. Surfaces (posts, comments, profiles,
// messages) open this via <ReportButton>; it is polymorphic over subject type.
//
// States: idle (pick a reason + optional details), submitting (spinner, inputs
// disabled), success (confirmation panel), error (toast, form stays open).
// ============================================================================
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  type ReportReason,
  type ReportSubjectType,
  reportSubjectLabel,
} from "@/lib/cabana-moderation";
import { useCreateReport } from "@/lib/use-moderation";
import { ReportReasonSelect } from "./ReportReasonSelect";

// Mirror of the DB / pure-layer details cap so the field guards before submit.
const MAX_DETAILS = 2000;

export function ReportDialog({
  open,
  onOpenChange,
  subjectType,
  subjectId,
  subjectLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectType: ReportSubjectType;
  subjectId: string;
  /** Optional human label for the thing being reported (defaults to the subject type). */
  subjectLabel?: string;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const createReport = useCreateReport();

  const noun = (subjectLabel ?? reportSubjectLabel(subjectType)).toLowerCase();

  // Reset transient form state each time the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setReason(null);
      setDetails("");
      setSubmitted(false);
    }
  }, [open]);

  async function onSubmit() {
    if (!reason || createReport.isPending) return;
    try {
      await createReport.mutateAsync({
        subjectType,
        subjectId,
        reason,
        details: details.trim() || undefined,
      });
      setSubmitted(true);
      toast.success("Report submitted. Our team will review it.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit the report.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong sm:max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" aria-hidden />
            <DialogTitle>Report received</DialogTitle>
            <DialogDescription>
              Thanks for helping keep CABANA safe. Our moderation team will review this {noun}.
            </DialogDescription>
            <Button className="btn-luxury mt-2 w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Flag className="h-4 w-4" aria-hidden /> Report {noun}
              </DialogTitle>
              <DialogDescription>
                Tell us what&apos;s wrong. Reports are confidential and reviewed by our moderation
                team.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <ReportReasonSelect
                value={reason}
                onChange={setReason}
                disabled={createReport.isPending}
              />
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Add any details that will help us review (optional)"
                maxLength={MAX_DETAILS}
                rows={3}
                disabled={createReport.isPending}
                aria-label="Additional details"
              />
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={createReport.isPending}
              >
                Cancel
              </Button>
              <Button
                className="btn-luxury"
                onClick={onSubmit}
                disabled={!reason || createReport.isPending}
              >
                {createReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit report
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
