import { Link } from "@tanstack/react-router";
import {
  LineChart,
  PenSquare,
  Settings as SettingsIcon,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

type QuickAction = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
};

const ACTIONS: QuickAction[] = [
  {
    to: "/dashboard/posts",
    label: "Posts",
    description: "Publish to your feed",
    icon: PenSquare,
  },
  {
    to: "/dashboard/subscribers",
    label: "Subscribers",
    description: "Tiers & subscribers",
    icon: UsersRound,
  },
  {
    to: "/dashboard/earnings",
    label: "Earnings",
    description: "Request & track payouts",
    icon: WalletCards,
  },
  {
    to: "/dashboard/performance",
    label: "Analytics",
    description: "Revenue & engagement",
    icon: LineChart,
  },
  {
    to: "/dashboard/settings",
    label: "Settings",
    description: "Profile & preferences",
    icon: SettingsIcon,
  },
];

/** Shortcut grid for the most common creator actions. */
export function QuickActions() {
  return (
    <section className="glass-strong rounded-3xl p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Quick actions</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ACTIONS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="group glass relative flex flex-col gap-2 rounded-2xl p-4 transition-colors hover:border-primary/30"
          >
            {a.badge && (
              <span className="absolute right-3 top-3 rounded-full bg-foreground/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                {a.badge}
              </span>
            )}
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iridescent/90 text-background shadow-glow">
              <a.icon className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-medium">{a.label}</div>
              <div className="text-[11px] text-muted-foreground">{a.description}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
