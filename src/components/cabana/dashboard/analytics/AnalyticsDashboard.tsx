import { useMemo, useState } from "react";
import { AlertTriangle, BadgeDollarSign, BarChart3, RefreshCw } from "lucide-react";
import { buildCreatorAnalytics, type AnalyticsRange } from "@/lib/cabana-creator-analytics";
import { useCreatorAnalytics } from "@/lib/use-analytics";
import { DateRangeFilter } from "./DateRangeFilter";
import { RevenueAnalytics } from "./RevenueAnalytics";
import { SubscriberAnalytics } from "./SubscriberAnalytics";
import { ContentAnalytics } from "./ContentAnalytics";
import { EngagementSummary } from "./EngagementSummary";

/**
 * Creator analytics (Phase 11B) — revenue, subscriber, content, and engagement
 * analytics over existing data (the ledger, the creator's subscriptions, and
 * the `creator_content_analytics` RPC). All series/totals are derived by the
 * pure `cabana-creator-analytics` pipeline; the date range filters one fetched
 * bundle without re-fetching. DEMO-ONLY money.
 */
export function AnalyticsDashboard() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const { data, isLoading, isError, error, refetch, isFetching } = useCreatorAnalytics();

  const view = useMemo(
    () => (data ? buildCreatorAnalytics(data, range, new Date().toISOString()) : null),
    [data, range],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="eyebrow">Dashboard</p>
        <h1 className="font-display text-4xl font-semibold tracking-tighter md:text-5xl">
          Analytics
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Revenue, subscribers, and content performance — derived from your live ledger,
          subscriptions, and post engagement.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-medium text-amber-200/90">
          <BadgeDollarSign className="h-3.5 w-3.5" />
          Demo Mode — figures derive from the mock ledger.
        </div>
      </header>

      {!isLoading && !isError && view && (
        <div className="flex justify-end">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      )}

      {isLoading ? (
        <AnalyticsLoading />
      ) : isError ? (
        <AnalyticsError
          message={(error as Error)?.message}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : !view ? null : view.isEmpty ? (
        <AnalyticsEmpty />
      ) : (
        <>
          <EngagementSummary engagement={view.engagement} />
          <RevenueAnalytics revenue={view.revenue} />
          <div className="grid gap-6 lg:grid-cols-1">
            <SubscriberAnalytics subscribers={view.subscribers} />
          </div>
          <ContentAnalytics content={view.content} />
        </>
      )}
    </div>
  );
}

function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div className="glass-strong h-28 animate-pulse rounded-3xl" />
      <div className="glass-strong h-96 animate-pulse rounded-3xl" />
      <div className="glass-strong h-80 animate-pulse rounded-3xl" />
    </div>
  );
}

function AnalyticsError({
  message,
  onRetry,
  retrying,
}: {
  message?: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="glass-strong flex flex-col items-center gap-4 rounded-3xl p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold">Couldn’t load analytics</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {message || "Something went wrong while fetching your data. Please try again."}
        </p>
      </div>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="btn-ghost inline-flex items-center gap-2 disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
        Retry
      </button>
    </div>
  );
}

function AnalyticsEmpty() {
  return (
    <div className="glass-strong flex flex-col items-center gap-3 rounded-3xl p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-iridescent text-background shadow-glow">
        <BarChart3 className="h-6 w-6" />
      </div>
      <h2 className="font-display text-xl font-semibold">No analytics yet</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Once you publish posts, gain subscribers, or earn from tips and sales, your revenue, growth,
        and engagement trends will appear here.
      </p>
    </div>
  );
}
