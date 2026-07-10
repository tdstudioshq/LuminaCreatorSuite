import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Check, Copy, ExternalLink, Palette, Pencil, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PUBLIC_SITE_DOMAIN } from "@/lib/site";

/**
 * Post-onboarding continuation banner. Shows once, right after the user
 * finishes onboarding (flagged in sessionStorage), so the dashboard reads as
 * "you're live, here's what's next" rather than a hard stop.
 */
export function WelcomeLive({ handle }: { handle: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const publicUrl = `${PUBLIC_SITE_DOMAIN}/${handle}`;

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
