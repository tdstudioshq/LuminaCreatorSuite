import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

type MvpRouteShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  bullets?: readonly string[];
  primaryTo?: string;
  primaryLabel?: string;
  secondaryTo?: string;
  secondaryLabel?: string;
  contained?: boolean;
};

export function MvpRouteShell({
  eyebrow,
  title,
  description,
  status = "MVP shell / Coming in backend phase",
  bullets = [],
  primaryTo = "/",
  primaryLabel = "Back to home",
  secondaryTo,
  secondaryLabel,
  contained = false,
}: MvpRouteShellProps) {
  const content = (
    <section className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[linear-gradient(145deg,oklch(0.2_0.022_280/0.72),oklch(0.135_0.014_280/0.74))] p-6 shadow-luxury sm:p-8 lg:p-10">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-iridescent opacity-20 blur-[100px]" />
      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.045] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          {status}
        </div>

        <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tighter text-foreground sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          {description}
        </p>

        {bullets.length > 0 && (
          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            {bullets.map((bullet) => (
              <div
                key={bullet}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3 text-sm text-foreground/82"
              >
                {bullet}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={primaryTo} className="btn-luxury !px-5 !py-3 text-xs">
            <ArrowLeft className="h-4 w-4" />
            {primaryLabel}
          </Link>
          {secondaryTo && secondaryLabel && (
            <Link to={secondaryTo} className="btn-ghost !px-5 !py-3 text-xs">
              {secondaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );

  if (contained) return content;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-16 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[520px] w-[520px] rounded-full bg-iridescent opacity-15 blur-[140px]" />
        <div
          className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full opacity-15 blur-[120px]"
          style={{
            background: "radial-gradient(circle, oklch(0.7 0.2 195 / 0.6), transparent 70%)",
          }}
        />
      </div>
      {content}
    </main>
  );
}
