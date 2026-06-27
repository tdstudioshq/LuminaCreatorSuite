import { formatDistanceToNow } from "date-fns";
import { TrendingUp, UsersRound } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatMoney } from "@/lib/cabana-money";
import type { SubscriberSummaryView } from "@/lib/cabana-dashboard";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "✦"
  );
}

/**
 * Subscriber overview: active / total counts, month-over-month growth, and the
 * most recent joins. Counts are pre-computed from the creator's own
 * `creator_subscriptions` rows.
 */
export function SubscriberSummary({ subscribers }: { subscribers: SubscriberSummaryView }) {
  return (
    <section className="glass-strong flex h-full flex-col rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Subscribers</h2>
          <p className="text-xs text-muted-foreground">Your fan subscription base.</p>
        </div>
        <Link
          to="/dashboard/subscribers"
          className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <UsersRound className="h-3.5 w-3.5" /> Manage
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-foreground/[0.06] p-4">
          <div className="text-[11px] text-muted-foreground">Active</div>
          <div className="mt-1.5 font-display text-2xl font-semibold tabular-nums text-iridescent">
            {subscribers.active}
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-[11px] text-muted-foreground">Total</div>
          <div className="mt-1.5 font-display text-2xl font-semibold tabular-nums">
            {subscribers.total}
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-[11px] text-muted-foreground">New</div>
          <div className="mt-1.5 flex items-baseline gap-1 font-display text-2xl font-semibold tabular-nums">
            {subscribers.newThisMonth}
            {subscribers.newThisMonth > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-400">
                <TrendingUp className="h-3 w-3" />
                {subscribers.growthPct}%
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Recent joins</div>
        {subscribers.recentJoins.length === 0 ? (
          <p className="rounded-2xl border border-border/50 bg-foreground/[0.02] px-4 py-3 text-xs text-muted-foreground">
            No subscribers yet. Share your page and add a subscription tier to grow your base.
          </p>
        ) : (
          <ul className="space-y-2">
            {subscribers.recentJoins.map((s, i) => (
              <li key={`${s.displayName}-${i}`} className="flex items-center gap-3">
                {s.avatarUrl ? (
                  <img
                    src={s.avatarUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-iridescent text-[10px] font-semibold text-background">
                    {initials(s.displayName)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.displayName}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {s.tierName ? `${s.tierName} · ` : ""}
                    {formatMoney(s.priceCents, s.currency)}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(s.since), { addSuffix: true })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
