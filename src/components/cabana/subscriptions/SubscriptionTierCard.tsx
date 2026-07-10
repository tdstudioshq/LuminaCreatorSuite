import { Check, Crown } from "lucide-react";
import type { SubscriptionTier } from "@/lib/cabana-subscriptions";
import { formatMoney } from "@/lib/cabana-money";

export function SubscriptionTierCard({
  tier,
  current = false,
  onSelect,
  disabled = false,
}: {
  tier: SubscriptionTier;
  current?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="glass-strong flex h-full flex-col gap-3 rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-iridescent" />
        <span className="text-sm font-medium">{tier.name}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-2xl font-semibold">
          {formatMoney(tier.priceCents, tier.currency)}
        </span>
        <span className="text-xs text-muted-foreground">/ month</span>
      </div>
      {current ? (
        <span className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-white/5 px-4 py-2.5 text-xs text-emerald-300/90">
          <Check className="h-3.5 w-3.5" /> Current plan
        </span>
      ) : (
        <button
          onClick={onSelect}
          disabled={disabled}
          className="btn-luxury mt-auto !py-2.5 text-xs disabled:opacity-60"
        >
          Subscribe
        </button>
      )}
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
        Demo — no real charge
      </p>
    </div>
  );
}
