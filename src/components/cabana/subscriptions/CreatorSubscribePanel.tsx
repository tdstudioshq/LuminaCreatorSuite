import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { SubscriptionTier } from "@/lib/cabana-subscriptions";
import { formatMoney } from "@/lib/cabana-money";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreatorTiers, useSubscribe } from "@/lib/use-subscriptions";
import { SubscriptionTierCard } from "./SubscriptionTierCard";

/** Subscribe section for the public creator page. Demo-only — no real charge. */
export function CreatorSubscribePanel({ username }: { username: string }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: tiers, isLoading } = useCreatorTiers(username);
  const sub = useSubscribe(username);
  const [pendingTier, setPendingTier] = useState<SubscriptionTier | null>(null);

  if (isLoading || !tiers || tiers.length === 0 || sub.isSelf) return null;

  function onSelect(tier: SubscriptionTier) {
    if (!sub.signedIn) {
      navigate({ to: "/login", search: { redirect: path } as never });
      return;
    }
    setPendingTier(tier);
  }

  async function confirm() {
    if (!pendingTier) return;
    try {
      await sub.subscribe(pendingTier.id);
      toast.success("Subscribed (demo) — subscriber posts are unlocked.");
      setPendingTier(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t subscribe.");
    }
  }

  async function cancel() {
    try {
      await sub.cancel();
      toast.success("Subscription canceled (demo).");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t cancel.");
    }
  }

  return (
    <section
      id="membership"
      className="mt-5 rounded-[28px] border border-white/[0.09] bg-[linear-gradient(145deg,oklch(0.21_0.025_280/0.65),oklch(0.15_0.018_280/0.52))] p-4 shadow-[0_24px_60px_-48px_oklch(0.78_0.18_280/0.8),inset_0_1px_0_oklch(1_0_0/0.08)] sm:p-5"
    >
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-primary">
            Membership
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
            Subscribe for more
          </h2>
        </div>
        <p className="hidden max-w-48 text-right text-[11px] leading-relaxed text-muted-foreground sm:block">
          Unlock subscriber posts with an available tier.
        </p>
      </div>

      {sub.subscribed ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
          <p className="text-sm">
            You’re a subscriber{sub.data?.tierName ? ` (${sub.data.tierName})` : ""}.
            Subscriber-only posts are unlocked.
          </p>
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={sub.pending}
            className="btn-ghost !py-2.5 text-xs disabled:opacity-50"
          >
            {sub.pending ? "Updating…" : "Cancel subscription"}
          </button>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Demo — no real charge
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tiers.map((tier) => (
            <SubscriptionTierCard
              key={tier.id}
              tier={tier}
              onSelect={() => onSelect(tier)}
              disabled={sub.pending}
            />
          ))}
        </div>
      )}

      <Dialog open={!!pendingTier} onOpenChange={(o) => !o && setPendingTier(null)}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>Confirm subscription</DialogTitle>
            <DialogDescription>
              {pendingTier
                ? `${pendingTier.name} — ${formatMoney(pendingTier.priceCents, pendingTier.currency)} / month`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-2xl bg-white/5 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/90" />
            <span>
              This is a <strong className="text-foreground">demo</strong>. No payment method is
              collected and no real charge is made. A mock subscription record is created so you can
              preview subscriber-only content.
            </span>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setPendingTier(null)}
              className="btn-ghost !px-4 !py-2.5 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={sub.pending}
              className="btn-luxury !px-5 !py-2.5 text-xs disabled:opacity-50"
            >
              {sub.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm (demo)
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
