import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowUpRight, Sparkles } from "lucide-react";
import { GlobalNav } from "@/components/cabana/GlobalNav";

type FoundationPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  capabilities: readonly string[];
  backTo: string;
  backLabel: string;
  publicShell?: boolean;
};

function FoundationContent({
  eyebrow,
  title,
  description,
  icon: Icon,
  capabilities,
  backTo,
  backLabel,
}: FoundationPageProps) {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="pointer-events-none absolute -top-24 left-1/4 -z-10 h-72 w-72 rounded-full bg-iridescent opacity-25 blur-[100px]" />
      <div
        className="pointer-events-none absolute -bottom-20 right-0 -z-10 h-64 w-64 rounded-full opacity-20 blur-[100px]"
        style={{
          background: "radial-gradient(circle, oklch(0.7 0.2 195 / 0.7), transparent 70%)",
        }}
      />

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong overflow-hidden rounded-[2rem] p-6 shadow-luxury sm:p-10 lg:p-14"
      >
        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-iridescent" />
              Demo foundation
            </div>

            <div className="mt-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-iridescent text-background shadow-glow-sm">
                <Icon className="h-5 w-5" />
              </div>
              <p className="eyebrow">{eyebrow}</p>
            </div>

            <h1
              className="mt-5 font-display font-semibold leading-[0.95] tracking-tighter"
              style={{ fontSize: "clamp(2.5rem, 7vw, 5.25rem)" }}
            >
              {title}
              <span className="mt-2 block text-iridescent italic font-light">Coming soon.</span>
            </h1>

            <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {description}
            </p>

            <Link to={backTo} className="btn-luxury mt-8 !px-5 !py-3 text-xs">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          </div>

          <div className="glass rounded-3xl p-5 sm:p-6">
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Foundation scope
            </p>
            <div className="mt-4 space-y-2.5">
              {capabilities.map((capability, index) => (
                <motion.div
                  key={capability}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.18 + index * 0.06 }}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-foreground/[0.03] px-4 py-3"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-iridescent shadow-glow-sm" />
                  <span className="flex-1 text-sm text-foreground/85">{capability}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </motion.div>
              ))}
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
              This screen intentionally uses demo-only state. No payment, private message,
              entitlement, or payout action is active.
            </p>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

export function FoundationPage(props: FoundationPageProps) {
  if (props.publicShell) {
    return (
      <div className="relative min-h-screen overflow-x-hidden px-4 pb-20 pt-32 sm:px-6">
        <GlobalNav />
        <FoundationContent {...props} />
      </div>
    );
  }

  return <FoundationContent {...props} />;
}
