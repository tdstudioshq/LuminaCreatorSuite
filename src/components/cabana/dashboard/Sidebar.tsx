import { motion } from "framer-motion";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BellRing,
  Eye,
  FileText,
  LayoutDashboard,
  Link2,
  LogOut,
  MessagesSquare,
  Newspaper,
  Settings as SettingsIcon,
  Sparkles,
  Store,
  User,
  UsersRound,
  WalletCards,
  Wand2,
} from "lucide-react";
import { useCabana } from "@/lib/cabana-store";
import { cabanaAuth, useCabanaUser } from "@/lib/cabana-auth";

const items = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/profile", label: "Profile", icon: User },
  { to: "/dashboard/posts", label: "Posts", icon: Newspaper },
  { to: "/dashboard/subscribers", label: "Subscribers", icon: UsersRound },
  { to: "/dashboard/messages", label: "Messages", icon: MessagesSquare },
  { to: "/dashboard/earnings", label: "Earnings", icon: WalletCards },
  { to: "/dashboard/notifications", label: "Notifications", icon: BellRing },
  { to: "/dashboard/links", label: "Links", icon: Link2 },
  { to: "/dashboard/storefront", label: "Storefront", icon: Store },
  { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/dashboard/media-kit", label: "Media Kit", icon: FileText },
  { to: "/dashboard/ai", label: "AI Studio", icon: Wand2 },
  { to: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
] as const;

function useActive(path: string, exact = false) {
  const current = useRouterState({ select: (s) => s.location.pathname });
  return exact ? current === path : current === path || current.startsWith(path + "/");
}

export function DashSidebar() {
  const { profile } = useCabana();
  const plan = profile?.plan?.trim() || "Free";
  return (
    <aside className="fixed left-4 top-4 bottom-4 w-64 z-30 hidden lg:flex flex-col glass-strong rounded-3xl p-5 shadow-luxury">
      <Link to="/" className="flex items-center gap-2 px-2 mb-8">
        <div className="w-9 h-9 rounded-xl bg-iridescent flex items-center justify-center shadow-glow">
          <Sparkles className="w-5 h-5 text-background" />
        </div>
        <div>
          <div className="font-display font-semibold tracking-tight">CABANA</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Studio</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {items.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      <PreviewLink />

      <div className="mt-3 p-4 rounded-2xl glass border border-border">
        <div className="text-xs text-muted-foreground mb-1">Plan</div>
        <div className="font-display font-semibold mb-2 capitalize">{plan}</div>
        <Link
          to="/pricing"
          className="block w-full text-center text-xs py-2 rounded-lg bg-foreground/10 hover:bg-foreground/15 transition-colors"
        >
          Upgrade
        </Link>
      </div>

      <AccountCard />
    </aside>
  );
}

function AccountCard() {
  const user = useCabanaUser();
  const navigate = useNavigate();
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="mt-3 flex items-center gap-3 p-2.5 rounded-2xl glass border border-border/60">
      <div className="w-9 h-9 rounded-xl bg-iridescent flex items-center justify-center text-background text-xs font-semibold shrink-0">
        {initials || "✦"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{user.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
      </div>
      <button
        onClick={async () => {
          await cabanaAuth.logout();
          navigate({ to: "/login" });
        }}
        className="w-8 h-8 rounded-lg hover:bg-foreground/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}

function PreviewLink() {
  const { profile } = useCabana();
  const handle = profile?.handle || "aurora";
  return (
    <Link
      to="/$username"
      params={{ username: handle }}
      target="_blank"
      className="mt-6 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium glass-strong hover:border-primary/30 transition-colors"
    >
      <Eye className="w-4 h-4" /> Preview public page
    </Link>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  exact,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}) {
  const isActive = useActive(to, exact);
  return (
    <Link to={to} className="relative px-3 py-2.5 rounded-xl text-sm flex items-center gap-3 group">
      {isActive && (
        <motion.div
          layoutId="dashActiveTab"
          className="absolute inset-0 rounded-xl bg-iridescent opacity-90 shadow-glow"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon
        className={`w-4 h-4 relative z-10 ${isActive ? "text-background" : "text-muted-foreground group-hover:text-foreground"}`}
      />
      <span
        className={`relative z-10 font-medium ${isActive ? "text-background" : "text-muted-foreground group-hover:text-foreground"}`}
      >
        {label}
      </span>
    </Link>
  );
}

export function MobileTabs() {
  return (
    <div className="lg:hidden sticky top-0 z-30 -mx-4 px-4 py-3 glass-strong overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        {items.map((item) => (
          <MobileTab key={item.to} {...item} />
        ))}
      </div>
    </div>
  );
}

function MobileTab({ to, label, exact }: { to: string; label: string; exact?: boolean }) {
  const isActive = useActive(to, exact);
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
        isActive
          ? "bg-iridescent text-background shadow-glow"
          : "bg-foreground/5 text-muted-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
