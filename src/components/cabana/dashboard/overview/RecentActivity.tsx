import { formatDistanceToNow } from "date-fns";
import { Activity, ArrowUpRight, BellRing } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { RecentActivityItem } from "@/lib/cabana-dashboard";

function Row({ item }: { item: RecentActivityItem }) {
  const body = (
    <>
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.isRead ? "bg-muted-foreground/30" : "bg-iridescent"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{item.title}</div>
        {item.body && <div className="truncate text-[11px] text-muted-foreground">{item.body}</div>}
        <div className="text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
        </div>
      </div>
      {item.href && <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    </>
  );

  if (item.href) {
    return (
      <Link
        to={item.href}
        className="flex items-start gap-2.5 rounded-2xl px-2 py-2 transition-colors hover:bg-foreground/[0.04]"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex items-start gap-2.5 px-2 py-2">{body}</div>;
}

/**
 * Recent activity — new subscribers, sales, tips, payouts, and system events —
 * sourced from the creator's notifications and shaped by the pure aggregator.
 */
export function RecentActivity({ items }: { items: RecentActivityItem[] }) {
  return (
    <section className="glass-strong flex h-full flex-col rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold">Recent activity</h2>
        </div>
        <Link
          to="/dashboard/notifications"
          className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <BellRing className="h-3.5 w-3.5" /> All
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-border/50 bg-foreground/[0.02] px-4 py-3 text-xs text-muted-foreground">
          No activity yet. New followers, subscribers, sales, and payouts will appear here.
        </p>
      ) : (
        <div className="-mx-2 divide-y divide-border/30">
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
