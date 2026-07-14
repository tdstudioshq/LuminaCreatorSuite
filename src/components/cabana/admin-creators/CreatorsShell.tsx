import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";

/**
 * Shared layout for the admin creator-management subroutes. Mirrors
 * `FinanceShell` / `ModerationShell` (header + back-to-console link), minus the
 * tab nav — there is only one creator surface in this slice.
 *
 * No demo pill: unlike the finance shells, every row here is REAL
 * `creator_profiles` data. It carries a read-only notice instead, because
 * management (edit / invite / publish) genuinely does not exist yet.
 */
export function CreatorsShell({
  eyebrow,
  title,
  description,
  notice,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  notice?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden px-4 pb-24 pt-10 sm:px-6 lg:px-10">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[520px] w-[520px] rounded-full bg-iridescent opacity-15 blur-[140px]" />
      </div>
      <div className="mx-auto max-w-[1100px] space-y-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Admin console
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-iridescent shadow-glow-sm">
              <Sparkles className="h-4 w-4 text-background" />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight">CABANA Admin</span>
          </div>
        </div>

        <header className="space-y-3">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="font-display text-4xl font-semibold tracking-tighter md:text-5xl">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          {notice ? (
            <p className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-muted-foreground">
              {notice}
            </p>
          ) : null}
        </header>

        {children}
      </div>
    </div>
  );
}
