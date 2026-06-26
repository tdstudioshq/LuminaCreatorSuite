import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { formatCents, creatorLabel } from "@/lib/cabana-finance";
import {
  type AdminPayoutRequest,
  type PayoutAction,
  payoutActionLabel,
  payoutActionTarget,
  payoutRequestStatusLabel,
} from "@/lib/cabana-payouts";
import { useReviewPayout } from "@/lib/use-admin-payouts";

/**
 * Confirm a single admin payout decision with an optional note. The transition,
 * the linked disbursement, the balance recompute, and the audit entry are all
 * enforced server-side by `admin_review_payout`.
 */
export function PayoutActionDialog({
  request,
  action,
  open,
  onOpenChange,
}: {
  request: AdminPayoutRequest | null;
  action: PayoutAction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const review = useReviewPayout();

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  if (!request || !action) return null;

  const target = payoutActionTarget(action);
  const destructive = action === "reject";

  async function onConfirm() {
    if (!request || !action || review.isPending) return;
    try {
      await review.mutateAsync({
        payoutRequestId: request.id,
        action,
        note: note.trim() || undefined,
      });
      toast.success(`Payout ${payoutRequestStatusLabel(target).toLowerCase()}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the payout.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{payoutActionLabel(action)}</DialogTitle>
          <DialogDescription>
            {formatCents(request.amountCents, request.currency)} payout to {creatorLabel(request)} —
            moves to{" "}
            <span className="font-medium text-foreground">{payoutRequestStatusLabel(target)}</span>.
            Demo only; no real funds move.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            destructive ? "Reason (recorded on the payout + audit log)" : "Note (optional)"
          }
          maxLength={500}
          rows={3}
          disabled={review.isPending}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={review.isPending}>
            Cancel
          </Button>
          <Button
            className={destructive ? "" : "btn-luxury"}
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={review.isPending}
          >
            {review.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {payoutActionLabel(action)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
