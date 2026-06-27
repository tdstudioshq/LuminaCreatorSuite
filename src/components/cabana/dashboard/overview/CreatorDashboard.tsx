import { AlertTriangle, BadgeDollarSign, RefreshCw, Sparkles } from "lucide-react";
import { useCabana } from "@/lib/cabana-store";
import { useCreatorDashboard } from "@/lib/use-dashboard";
import { KpiCards, KpiCardsSkeleton } from "./KpiCards";
import { RevenueSummary } from "./RevenueSummary";
import { SubscriberSummary } from "./SubscriberSummary";
import { RecentActivity } from "./RecentActivity";
import { QuickActions } from "./QuickActions";

/**
 * Creator dashboard home (Phase 11A) — a real, RLS-scoped business overview
 * over the existing finance, subscription, and notification infrastructure.
 * KPIs, revenue, subscribers, and activity are all derived by the pure
 * `cabana-dashboard` aggregator; nothing is recomputed here. DEMO-ONLY money.
 */
export function CreatorDashboard() {
  const { profile } = useCabana();
  const { data: view, isLoading, isError, error, refetch, isFetching } = useCreatorDashboard();

  const firstName = profile?.name?.trim().split(/\s+/)[0] || profile?.handle || "creator";

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="eyebrow">Dashboard</p>
        <h1 className="font-display text-4xl font-semibold tracking-tighter md:text-5xl">
          Welcome back, <span className="capitalize">{firstName}</span>
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Your revenue, subscribers, and activity at a glance. Every figure is derived from your
          live ledger and subscription data.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-medium text-amber-200/90">
          <BadgeDollarSign className="h-3.5 w-3.5" />
          Demo Mode — No real payment is processed.
        </div>
      </header>

      {isLoading ? (
        <DashboardLoading />
      ) : isError ? (
        <DashboardError
          message={(error as Error)?.message}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : !view ? null : view.isEmpty ? (
        <>
          <KpiCards cards={view.kpiCards} />
          <DashboardEmpty />
          <QuickActions />
        </>
      ) : (
        <>
          <KpiCards cards={view.kpiCards} />
          <div className="grid gap-6 lg:grid-cols-2">
            <RevenueSummary revenue={view.revenue} />
            <SubscriberSummary subscribers={view.subscribers} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <RecentActivity items={view.recentActivity} />
            <QuickActions />
          </div>
        </>
      )}
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="space-y-6">
      <KpiCardsSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-strong h-72 animate-pulse rounded-3xl" />
        <div className="glass-strong h-72 animate-pulse rounded-3xl" />
      </div>
    </div>
  );
}

function DashboardError({
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
        <h2 className="font-display text-lg font-semibold">Couldn’t load your dashboard</h2>
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

function DashboardEmpty() {
  return (
    <div className="glass-strong flex flex-col items-center gap-3 rounded-3xl p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-iridescent text-background shadow-glow">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="font-display text-xl font-semibold">Your studio is ready</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        You don’t have any earnings, subscribers, or activity yet. Publish a post, set up a
        subscription tier, or share your page to start growing — your numbers will appear here.
      </p>
    </div>
  );
}
