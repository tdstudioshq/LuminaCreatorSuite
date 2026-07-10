import { motion } from "framer-motion";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Eye, MousePointerClick, ShoppingBag, BarChart3, Loader2 } from "lucide-react";
import { useCabana } from "@/lib/cabana-store";
import { supabase } from "@/integrations/supabase/client";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";

type EventRow = {
  id: string;
  event_type: string;
  target_id: string | null;
  created_at: string;
};

function useAnalyticsEvents(profileId: string | undefined) {
  return useQuery({
    queryKey: ["analytics-events", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("id,event_type,target_id,created_at")
        .eq("profile_id", profileId!)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });
}

function buildSeries(events: EventRow[], days: number) {
  const buckets: number[] = Array(days).fill(0);
  const now = Date.now();
  for (const e of events) {
    if (e.event_type !== "page_view") continue;
    const age = Math.floor((now - new Date(e.created_at).getTime()) / (24 * 60 * 60 * 1000));
    const idx = days - 1 - age;
    if (idx >= 0 && idx < days) buckets[idx]++;
  }
  return buckets;
}

export function AnalyticsPage() {
  const { profile, links, products, loading } = useCabana();
  const {
    data: events = [],
    isLoading: eventsLoading,
    isError: eventsError,
    refetch: refetchEvents,
  } = useAnalyticsEvents(profile?.id);

  const counts = useMemo(() => {
    let pageViews = 0;
    let linkClicks = 0;
    let productClicks = 0;
    const linkClickById: Record<string, number> = {};
    for (const e of events) {
      if (e.event_type === "page_view") pageViews++;
      else if (e.event_type === "link_click") {
        linkClicks++;
        if (e.target_id) linkClickById[e.target_id] = (linkClickById[e.target_id] ?? 0) + 1;
      } else if (e.event_type === "product_click") productClicks++;
    }
    return { pageViews, linkClicks, productClicks, linkClickById };
  }, [events]);

  const series = useMemo(() => buildSeries(events, 14), [events]);
  const seriesMax = Math.max(1, ...series);
  const ctr =
    counts.pageViews > 0 ? ((counts.linkClicks / counts.pageViews) * 100).toFixed(1) + "%" : "0%";

  const stats = [
    { label: "Page views (30d)", value: counts.pageViews.toLocaleString(), icon: Eye },
    {
      label: "Link clicks (30d)",
      value: counts.linkClicks.toLocaleString(),
      icon: MousePointerClick,
    },
    {
      label: "Product clicks (30d)",
      value: counts.productClicks.toLocaleString(),
      icon: ShoppingBag,
    },
    { label: "Click-through rate", value: ctr, icon: TrendingUp },
  ];

  const topLinks = useMemo(
    () =>
      [...links]
        .map((l) => ({ ...l, recent: counts.linkClickById[l.id] ?? 0 }))
        .sort((a, b) => b.recent - a.recent)
        .slice(0, 6),
    [links, counts.linkClickById],
  );

  if (loading || eventsLoading) {
    return (
      <div className="glass rounded-3xl p-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading analytics…
      </div>
    );
  }

  if (eventsError) {
    return <QueryErrorState title="Couldn’t load your analytics" onRetry={refetchEvents} />;
  }

  return (
    <div className="space-y-8">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Link-in-bio
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-semibold tracking-tighter">
          Link <span className="text-iridescent italic font-light">analytics</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Real events from your link-in-bio page — page views, link and product clicks across the
          last 30 days.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass rounded-2xl p-5 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-9 h-9 rounded-xl glass-strong flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl md:text-3xl font-display font-semibold tracking-tight">
                {s.value}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-lg font-semibold">Traffic over time</h3>
              <p className="text-xs text-muted-foreground">Page views, last 14 days</p>
            </div>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </div>
          {counts.pageViews === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">
              No traffic yet — share your CABANA to see live data.
            </div>
          ) : (
            <div className="flex items-end gap-1.5 h-56">
              {series.map((v, i) => (
                <motion.div
                  key={i}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: i * 0.04, type: "spring" }}
                  style={{ height: `${(v / seriesMax) * 100}%`, transformOrigin: "bottom" }}
                  className="flex-1 rounded-md bg-iridescent opacity-80 hover:opacity-100 transition-opacity min-h-[2px]"
                />
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-3xl p-6">
          <h3 className="font-display text-lg font-semibold mb-1">Storefront</h3>
          <p className="text-xs text-muted-foreground mb-5">Product activity</p>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Products listed</span>
              <span className="font-display text-base font-semibold tabular-nums">
                {products.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Product clicks (30d)</span>
              <span className="font-display text-base font-semibold tabular-nums">
                {counts.productClicks.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total sales tracked</span>
              <span className="font-display text-base font-semibold tabular-nums">
                {products.reduce((a, p) => a + p.sales, 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-3xl p-6">
        <h3 className="font-display text-lg font-semibold mb-1">Top links</h3>
        <p className="text-xs text-muted-foreground mb-5">Clicks in the last 30 days</p>
        {topLinks.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No links yet — add some in the Link Manager.
          </div>
        ) : (
          <div className="space-y-2">
            {topLinks.map((l) => (
              <div key={l.id} className="flex items-center justify-between p-3 rounded-xl glass">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{l.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{l.url}</div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-sm font-display font-semibold tabular-nums">
                    {l.recent.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground">recent clicks</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
