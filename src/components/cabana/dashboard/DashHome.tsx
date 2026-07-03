import { motion } from "framer-motion";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  Eye,
  MousePointerClick,
  ShoppingBag,
  Sparkles,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { useCabana } from "@/lib/cabana-store";
import { supabase } from "@/integrations/supabase/client";

type EventRow = { id: string; event_type: string; target_id: string | null; created_at: string };

function useEvents(profileId: string | undefined) {
  return useQuery({
    queryKey: ["dash-events", profileId],
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

export function DashHome() {
  const { profile, links, products, loading } = useCabana();
  const { data: events = [], isLoading: eventsLoading } = useEvents(profile?.id);

  const counts = useMemo(() => {
    let pageViews = 0,
      linkClicks = 0,
      productClicks = 0;
    for (const e of events) {
      if (e.event_type === "page_view") pageViews++;
      else if (e.event_type === "link_click") linkClicks++;
      else if (e.event_type === "product_click") productClicks++;
    }
    return { pageViews, linkClicks, productClicks };
  }, [events]);

  const series = useMemo(() => {
    const days = 14;
    const buckets = Array(days).fill(0) as number[];
    const now = Date.now();
    for (const e of events) {
      if (e.event_type !== "page_view") continue;
      const age = Math.floor((now - new Date(e.created_at).getTime()) / 86_400_000);
      const idx = days - 1 - age;
      if (idx >= 0 && idx < days) buckets[idx]++;
    }
    return buckets;
  }, [events]);
  const seriesMax = Math.max(1, ...series);

  if (loading) {
    return (
      <div className="glass rounded-3xl p-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your studio…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="glass rounded-3xl p-10 text-center text-sm text-muted-foreground">
        Your creator profile is being set up. Refresh in a moment.
      </div>
    );
  }

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

  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "Good night"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
            Welcome back
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-semibold tracking-tighter">
            {greeting}, <span className="text-iridescent">{profile.name || profile.handle}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-2">
            Live at <span className="text-foreground">/creator/{profile.handle}</span>
          </p>
        </div>
        <Link
          to="/creator/$username"
          params={{ username: profile.handle }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-iridescent text-background text-sm font-medium shadow-glow"
        >
          <Sparkles className="w-4 h-4" />
          View public page
        </Link>
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
              className="glass rounded-2xl p-5 relative overflow-hidden group"
            >
              <div className="flex items-center justify-between mb-4 relative">
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
              <h3 className="font-display text-lg font-semibold">Traffic</h3>
              <p className="text-xs text-muted-foreground">Page views, last 14 days</p>
            </div>
          </div>
          {eventsLoading ? (
            <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : counts.pageViews === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
              No traffic yet — share your CABANA to see live data.
            </div>
          ) : (
            <div className="flex items-end gap-1.5 h-48">
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
          <h3 className="font-display text-lg font-semibold mb-1">Your CABANA</h3>
          <p className="text-xs text-muted-foreground mb-5">At a glance</p>
          <div className="space-y-3 text-xs">
            <Row label="Links published" value={links.length} to="/dashboard/profile" />
            <Row label="Products listed" value={products.length} to="/dashboard/profile" />
            <Row label="Plan" value={profile.plan} />
            <Row label="Theme" value={profile.theme} />
          </div>
          <Link
            to="/dashboard/earnings"
            className="mt-5 w-full inline-flex items-center justify-center gap-1.5 text-xs glass-strong rounded-full py-2.5 hover:text-iridescent"
          >
            View earnings <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, to }: { label: string; value: string | number; to?: string }) {
  const inner = (
    <>
      <span className="text-muted-foreground capitalize">{label}</span>
      <span className="font-display text-base font-semibold tabular-nums">{value}</span>
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className="flex items-center justify-between hover:text-iridescent transition-colors"
      >
        {inner}
      </Link>
    );
  }
  return <div className="flex items-center justify-between">{inner}</div>;
}
