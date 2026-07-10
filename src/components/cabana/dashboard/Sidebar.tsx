import { Fragment } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BellRing,
  Eye,
  FileText,
  Gauge,
  LayoutDashboard,
  LineChart,
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
} from "lucide-react";
import { useCabana } from "@/lib/cabana-store";
import { cabanaAuth, useCabanaUser } from "@/lib/cabana-auth";
import { useUnreadMessages } from "@/lib/use-messaging";
import { NotificationBadge } from "@/components/cabana/notifications/NotificationBadge";
import { UnreadBadge } from "@/components/cabana/notifications/UnreadBadge";
import { ScrollFadeRow } from "@/components/cabana/ScrollFadeRow";

type NavEntry = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const sections: { label: string | null; items: NavEntry[] }[] = [
  {
    label: null,
    items: [{ to: "/dashboard", label: "Home", icon: Gauge, exact: true }],
  },
  {
    label: "Creator studio",
    items: [
      { to: "/dashboard/posts", label: "Posts", icon: Newspaper },
      { to: "/dashboard/subscribers", label: "Subscribers", icon: UsersRound },
      { to: "/messages", label: "Messages", icon: MessagesSquare },
      { to: "/dashboard/earnings", label: "Earnings", icon: WalletCards },
      { to: "/dashboard/performance", label: "Analytics", icon: LineChart },
      { to: "/dashboard/notifications", label: "Notifications", icon: BellRing },
    ],
  },
  {
    label: "Link-in-bio",
    items: [
      { to: "/dashboard/link-in-bio", label: "My Page", icon: LayoutDashboard },
      { to: "/dashboard/links", label: "Links", icon: Link2 },
      { to: "/dashboard/storefront", label: "Storefront", icon: Store },
      { to: "/dashboard/analytics", label: "Link Analytics", icon: BarChart3 },
      { to: "/dashboard/media-kit", label: "Media Kit", icon: FileText },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/dashboard/profile", label: "Profile", icon: User },
      { to: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

const items = sections.flatMap((s) => s.items);

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
        {sections.map((section, i) => (
          <Fragment key={section.label ?? i}>
            {section.label ? (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 pt-4 pb-1">
                {section.label}
              </div>
            ) : null}
            {section.items.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </Fragment>
        ))}
      </nav>

      <PreviewLink />

      <div className="mt-3 p-4 rounded-2xl glass border border-border">
        <div className="text-xs text-muted-foreground mb-1">Plan</div>
        <div className="font-display font-semibold capitalize">{plan}</div>
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
    <div className="mt-3 flex items-center gap-3 p-2.5 rounded-2xl glass border border-border">
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
        className="tap-target w-8 h-8 rounded-lg hover:bg-foreground/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
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
  const handle = profile?.handle;
  if (!handle) {
    return (
      <span
        title="Set your handle first — add it in Profile"
        className="mt-6 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium glass-strong opacity-50 cursor-not-allowed"
      >
        <Eye className="w-4 h-4" /> Preview public page
      </span>
    );
  }
  return (
    <Link
      to="/$username"
      params={{ username: handle }}
      target="_blank"
      rel="noopener noreferrer"
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
    <Link
      to={to}
      aria-current={isActive ? "page" : undefined}
      className="relative px-3 py-2.5 rounded-xl text-sm flex items-center gap-3 group"
    >
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
      {to === "/dashboard/notifications" && <NotificationBadge className="relative z-10 ml-auto" />}
      {to === "/messages" && <MessagesBadge className="relative z-10 ml-auto" />}
    </Link>
  );
}

/**
 * Unread direct-message badge — mirrors NotificationBadge (live via the
 * Realtime subscription inside useUnreadMessages; renders nothing at zero).
 */
function MessagesBadge({ className = "" }: { className?: string }) {
  const { data: count = 0 } = useUnreadMessages();
  return <UnreadBadge count={count} label={`${count} unread messages`} className={className} />;
}

export function MobileTabs() {
  return (
    <ScrollFadeRow className="lg:hidden sticky top-0 z-30 -mx-4 px-4 py-3 glass-strong">
      <div className="flex gap-2 min-w-max">
        {items.map((item) => (
          <MobileTab key={item.to} {...item} />
        ))}
      </div>
    </ScrollFadeRow>
  );
}

function MobileTab({ to, label, exact }: { to: string; label: string; exact?: boolean }) {
  const isActive = useActive(to, exact);
  return (
    <Link
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={`tap-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
        isActive
          ? "bg-iridescent text-background shadow-glow"
          : "bg-foreground/5 text-muted-foreground"
      }`}
    >
      {label}
      {to === "/dashboard/notifications" && <NotificationBadge />}
      {to === "/messages" && <MessagesBadge />}
    </Link>
  );
}
