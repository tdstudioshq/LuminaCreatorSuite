import { useState } from "react";
import { toast } from "sonner";
import { WalletCards } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MIN_PAYOUT_CENTS,
  dollarsToCents,
  evaluatePayoutEligibility,
  formatMoney,
} from "@/lib/cabana-money";
import { useRequestPayout } from "@/lib/use-money";

const ELIGIBILITY_MESSAGE: Record<string, string> = {
  invalid_amount: "Enter a valid amount.",
  below_minimum: `The minimum payout is ${formatMoney(MIN_PAYOUT_CENTS)}.`,
  exceeds_available: "That exceeds your available balance.",
  eligible: "",
};

/**
 * Mock payout-request dialog. Validates the requested amount against available
 * balance with the pure `evaluatePayoutEligibility` helper before calling the
 * server. No real payout is ever issued.
 */
export function PayoutRequestDialog({ availableCents }: { availableCents: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const requestPayout = useRequestPayout();

  const parsed = Number.parseFloat(amount);
  const amountCents = Number.isFinite(parsed) ? dollarsToCents(parsed) : 0;
  const eligibility = evaluatePayoutEligibility(availableCents, amountCents);

  function submit() {
    if (!eligibility.eligible) return;
    requestPayout.mutate(
      { amountCents, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Payout requested (demo) — no real money was moved.");
          setOpen(false);
          setAmount("");
          setNote("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not request payout."),
      },
    );
  }

  const showError = amount !== "" && !eligibility.eligible;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="btn-luxury !px-4 !py-2 text-xs disabled:opacity-50"
          disabled={availableCents < MIN_PAYOUT_CENTS}
        >
          <WalletCards className="h-3.5 w-3.5" /> Request payout
        </button>
      </DialogTrigger>
      <DialogContent className="glass-strong border-border/60">
        <DialogHeader>
          <DialogTitle>Request a payout</DialogTitle>
          <DialogDescription>
            Available to withdraw:{" "}
            <span className="text-foreground">{formatMoney(availableCents)}</span>. Minimum{" "}
            {formatMoney(MIN_PAYOUT_CENTS)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Amount (USD)</label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Note (optional)</label>
            <Input
              type="text"
              maxLength={500}
              placeholder="What's this payout for?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {showError && (
            <p className="text-xs text-amber-300/90">
              {ELIGIBILITY_MESSAGE[eligibility.reason] ?? "That amount can't be requested."}
            </p>
          )}
          <p className="rounded-xl border border-border/60 bg-foreground/[0.03] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Demo Mode — No real payment is processed. This records a mock payout request against
            your demo ledger and reserves the amount from your available balance.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <button className="btn-ghost !px-4 !py-2 text-xs">Cancel</button>
          </DialogClose>
          <button
            onClick={submit}
            disabled={!eligibility.eligible || requestPayout.isPending}
            className="btn-luxury !px-4 !py-2 text-xs disabled:opacity-50"
          >
            {requestPayout.isPending ? "Requesting…" : "Request payout"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
