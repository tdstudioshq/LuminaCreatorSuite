import { motion } from "framer-motion";
import { format } from "date-fns";
import type { MemberProfile } from "@/lib/cabana-types";
import { CABANA_DEMO_DATA } from "@/lib/cabana-demo-data";
import { formatMoney } from "@/lib/cabana-money";
import { DemoNotice, DemoPageHeader, StatusPill } from "@/components/cabana/demo/DemoShell";

export function DemoSubscribers() {
  const { subscriptions, members } = CABANA_DEMO_DATA;
  const memberByUserId = new Map<string, MemberProfile>(members.map((m) => [m.userId, m]));

  const active = subscriptions.filter((s) => s.status === "active");
  const trialing = subscriptions.filter((s) => s.status === "trialing");
  // Demo monthly recurring revenue: gross of currently-active subscriptions.
  const mrrCents = active.reduce((sum, s) => sum + s.priceCents, 0);

  return (
    <div className="space-y-8">
      <DemoPageHeader
        eyebrow="Audience"
        title="Subscribers"
        description="Members subscribed to your creator tiers. These are demo subscriptions — no billing or entitlement is active."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Subscribers" value={String(subscriptions.length)} />
        <Stat label="Active" value={String(active.length)} />
        <Stat label="Trialing" value={String(trialing.length)} />
        <Stat label="Demo MRR" value={formatMoney(mrrCents)} />
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        <div className="hidden grid-cols-[1.6fr_1fr_0.9fr_0.9fr_0.9fr] gap-4 border-b border-border/50 px-6 py-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground md:grid">
          <span>Member</span>
          <span>Tier</span>
          <span>Status</span>
          <span>Price</span>
          <span>Since</span>
        </div>
        <ul>
          {subscriptions.map((sub, index) => {
            const member = memberByUserId.get(sub.memberUserId);
            return (
              <motion.li
                key={sub.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="grid grid-cols-2 items-center gap-3 border-b border-border/40 px-6 py-4 text-sm last:border-b-0 md:grid-cols-[1.6fr_1fr_0.9fr_0.9fr_0.9fr] md:gap-4"
              >
                <div className="col-span-2 flex items-center gap-3 md:col-span-1">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-iridescent text-xs font-semibold text-background">
                    {(member?.displayName ?? "?").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{member?.displayName ?? "Member"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      @{member?.username ?? "member"}
                    </div>
                  </div>
                </div>
                <div className="text-foreground/85">{sub.tierName}</div>
                <div>
                  <StatusPill status={sub.status} />
                </div>
                <div className="tabular-nums">{formatMoney(sub.priceCents, sub.currency)}/mo</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {format(new Date(sub.startedAt), "MMM d, yyyy")}
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <DemoNotice>
        Demo subscribers from the mock data layer. Subscription billing, tier management, and
        content entitlements are not active in this phase.
      </DemoNotice>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
