import { Link } from "@tanstack/react-router";
import { ArrowLeft, Banknote, BookOpen, LayoutDashboard, Sparkles } from "lucide-react";

/**
 * Shared luxury layout for the admin finance subroutes (`/admin/finance`,
 * `/admin/ledger`). Mirrors `ModerationShell`: header + back-to-console link +
 * tab nav. DEMO-ONLY surface — every amount is mock ledger data.
 */
export function FinanceShell({
  active,
  eyebrow,
  title,
  description,
  children,
}: {
  active: "finance" | "ledger" | "payouts";
  eyebrow: string;
  title: string;
  description: string;
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
          <p className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-200/90">
            Demo Mode — mock ledger, no real money moves.
          </p>
        </header>

        <nav className="flex gap-2">
          <ShellTab to="/admin/finance" active={active === "finance"} Icon={LayoutDashboard}>
            Overview
          </ShellTab>
          <ShellTab to="/admin/ledger" active={active === "ledger"} Icon={BookOpen}>
            Ledger
          </ShellTab>
          <ShellTab to="/admin/payouts" active={active === "payouts"} Icon={Banknote}>
            Payouts
          </ShellTab>
        </nav>

        {children}
      </div>
    </div>
  );
}

function ShellTab({
  to,
  active,
  Icon,
  children,
}: {
  to: string;
  active: boolean;
  Icon: typeof BookOpen;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-iridescent text-background shadow-glow-sm"
          : "glass text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}
