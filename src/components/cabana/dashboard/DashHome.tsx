import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
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
  Plus,
  Pencil,
  Palette,
  ExternalLink,
  Check,
  Copy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCabana } from "@/lib/cabana-store";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
      <WelcomeLive handle={profile.handle} />
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
            Welcome back
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-semibold tracking-tighter">
            {greeting}, <span className="text-iridescent">{profile.name || profile.handle}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-2">
            Live at <span className="text-foreground">/{profile.handle}</span>
          </p>
          {profile.headline ? (
            <p className="mt-1 text-sm text-foreground/70">{profile.headline}</p>
          ) : null}
        </div>
        <Button asChild variant="cta" className="!rounded-full">
          <Link to="/$username" params={{ username: profile.handle }}>
            <Sparkles className="w-4 h-4" />
            View public page
          </Link>
        </Button>
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
            <Row label="Links published" value={links.length} to="/dashboard/links" />
            <Row label="Products listed" value={products.length} to="/dashboard/storefront" />
            <Row label="Plan" value={profile.plan} />
            <Row label="Theme" value={profile.theme} />
          </div>
          <Link
            to="/dashboard/analytics"
            className="mt-5 w-full inline-flex items-center justify-center gap-1.5 text-xs glass-strong rounded-full py-2.5 hover:text-iridescent"
          >
            Full analytics <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Post-onboarding continuation banner. Shows once, right after the user
 * finishes onboarding (flagged in sessionStorage), so the dashboard reads as
 * "you're live, here's what's next" rather than a hard stop.
 */
function WelcomeLive({ handle }: { handle: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const publicUrl = `cabanagrp.com/${handle}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("cabana:justOnboarded") === "1") {
      sessionStorage.removeItem("cabana:justOnboarded");
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${publicUrl}`);
      setCopied(true);
      toast.success("Public link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const actions = [
    { label: "Add link", icon: Plus, to: "/dashboard/links" },
    { label: "Edit profile", icon: Pencil, to: "/dashboard/profile" },
    { label: "Customize theme", icon: Palette, to: "/dashboard/profile" },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong relative overflow-hidden rounded-3xl p-6"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-iridescent opacity-20 blur-3xl" />
      <button
        type="button"
        onClick={() => setShow(false)}
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="relative">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Your CABANA is live
        </div>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
          You're all set — here's what's next.
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm transition-colors hover:bg-white/[0.07]"
          >
            <span className="text-muted-foreground">{publicUrl}</span>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          <Button asChild variant="cta" size="sm" className="!rounded-full">
            <Link to="/$username" params={{ username: handle }}>
              <ExternalLink className="h-3.5 w-3.5" /> View public page
            </Link>
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                to={a.to}
                className="flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5" /> {a.label}
              </Link>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          You don't have to finish everything now — come back anytime.
        </p>
      </div>
    </motion.div>
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
