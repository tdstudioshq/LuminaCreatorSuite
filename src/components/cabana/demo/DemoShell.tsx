/**
 * Shared presentation primitives (badge + shell) for demo-labeled dashboard
 * surfaces. Money in CABANA is demo-only (no processor), so the earnings pages
 * that use this render REAL, RLS-scoped ledger data but carry a visible "Demo"
 * label via DemoBadge. These primitives never touch Supabase or move money.
 */
import { Sparkles } from "lucide-react";

export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full glass px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
      <Sparkles className="h-3 w-3 text-iridescent" />
      Demo data
    </span>
  );
}

export function DemoPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="eyebrow">{eyebrow}</p>
        <DemoBadge />
      </div>
      <h1 className="font-display text-4xl font-semibold tracking-tighter md:text-5xl">{title}</h1>
      {description ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}

export function DemoNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-border/60 bg-foreground/[0.03] px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: "text-emerald-300/90 bg-emerald-400/10",
  trialing: "text-sky-300/90 bg-sky-400/10",
  past_due: "text-amber-300/90 bg-amber-400/10",
  canceled: "text-muted-foreground bg-foreground/[0.06]",
  expired: "text-muted-foreground bg-foreground/[0.06]",
  published: "text-emerald-300/90 bg-emerald-400/10",
  succeeded: "text-emerald-300/90 bg-emerald-400/10",
  pending: "text-amber-300/90 bg-amber-400/10",
};

export function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "text-muted-foreground bg-foreground/[0.06]";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${style}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
