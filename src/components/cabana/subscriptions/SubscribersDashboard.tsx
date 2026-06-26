import { useState } from "react";
import { Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/cabana-money";
import {
  useCreatorSubscribers,
  useMyTiers,
  useSetTierActive,
  useUpsertTier,
} from "@/lib/use-subscriptions";

export function SubscribersDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow mb-1.5 text-muted-foreground">Membership</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Subscribers</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Define subscription tiers and see who supports you. Subscriptions are{" "}
          <strong className="text-foreground">demo-only</strong> — no real charges or payouts.
        </p>
      </div>
      <TierManager />
      <SubscriberList />
    </div>
  );
}

function TierManager() {
  const { data: tiers, isLoading } = useMyTiers();
  const upsert = useUpsertTier();
  const setActive = useSetTierActive();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  async function addTier() {
    const priceCents = Math.round(Number.parseFloat(price) * 100);
    if (!name.trim()) return toast.error("Tier name is required.");
    if (!Number.isFinite(priceCents) || priceCents < 0) return toast.error("Enter a valid price.");
    try {
      await upsert.mutateAsync({ name: name.trim(), priceCents });
      setName("");
      setPrice("");
      toast.success("Tier saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t save the tier.");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Tiers</h2>

      <div className="glass-strong flex flex-wrap items-end gap-2 rounded-2xl p-3">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] text-muted-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Supporter"
            className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
          />
        </label>
        <label className="w-28">
          <span className="mb-1 block text-[11px] text-muted-foreground">USD / mo</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="5.00"
            className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
          />
        </label>
        <button
          onClick={() => void addTier()}
          disabled={upsert.isPending}
          className="btn-luxury !px-4 !py-2.5 text-xs disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add tier
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !tiers || tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tiers yet. Add one to let fans subscribe.
        </p>
      ) : (
        <ul className="space-y-2">
          {tiers.map((tier) => (
            <li key={tier.id} className="glass flex items-center gap-3 rounded-2xl p-3 text-sm">
              <span className="font-medium">{tier.name}</span>
              <span className="text-chrome">{formatMoney(tier.priceCents, tier.currency)}/mo</span>
              {!tier.isActive && (
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  inactive
                </span>
              )}
              <button
                onClick={() =>
                  void setActive
                    .mutateAsync({ tierId: tier.id, isActive: !tier.isActive })
                    .catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Couldn’t update tier."),
                    )
                }
                disabled={setActive.isPending}
                className="btn-ghost ml-auto !px-3 !py-1.5 text-[11px] disabled:opacity-50"
              >
                {tier.isActive ? "Deactivate" : "Activate"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SubscriberList() {
  const { data: subscribers, isLoading } = useCreatorSubscribers();
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Your subscribers</h2>
      {isLoading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !subscribers || subscribers.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-2xl p-8 text-center text-sm text-muted-foreground">
          <Users className="h-5 w-5" />
          No subscribers yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {subscribers.map((s, i) => (
            <li
              key={`${s.username}-${i}`}
              className="glass flex items-center gap-3 rounded-2xl p-3"
            >
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/5 text-xs font-medium">
                {s.avatarUrl ? (
                  <img src={s.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  s.displayName.charAt(0).toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.displayName}</p>
                {s.username && (
                  <p className="truncate text-[11px] text-muted-foreground">@{s.username}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {s.tierName ?? "—"} · {formatMoney(s.priceCents, s.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
