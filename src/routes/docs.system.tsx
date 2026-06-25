import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Sparkles,
  ArrowUpRight,
  Heart,
  Eye,
  DollarSign,
  Users,
  TrendingUp,
  ShoppingBag,
  X,
  Search,
  Bell,
  Home,
  BarChart3,
  Settings,
  Plus,
} from "lucide-react";
import { GlobalNav } from "@/components/cabana/GlobalNav";

export const Route = createFileRoute("/docs/system")({
  component: System,
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Internal CABANA design system reference." },
    ],
  }),
});

function System() {
  return (
    <div className="relative min-h-screen pb-32">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-20 w-[480px] h-[480px] rounded-full bg-iridescent opacity-25 blur-[120px] animate-float" />
        <div
          className="absolute top-1/2 -right-32 w-[520px] h-[520px] rounded-full bg-iridescent opacity-20 blur-[140px] animate-float"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <GlobalNav />

      <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-32">
        <p className="eyebrow text-muted-foreground">Internal — Docs</p>
        <h1 className="font-display text-5xl sm:text-6xl font-semibold tracking-tighter mt-3">
          CABANA <span className="text-iridescent italic font-light">Design System</span>
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl">
          Tokens, glass surfaces, typography, motion and components. This page is internal and
          excluded from search engines.
        </p>
        <div className="mt-8 flex gap-2">
          <Link to="/docs/data-model" className="btn-ghost !px-4 !py-2 text-xs">
            Data model →
          </Link>
          <Link to="/" className="btn-ghost !px-4 !py-2 text-xs">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
