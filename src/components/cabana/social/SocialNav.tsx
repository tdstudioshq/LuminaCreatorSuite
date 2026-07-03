import { motion } from "framer-motion";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Compass,
  Home,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  PenLine,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";
import { useCabana, type CabanaProfile } from "@/lib/cabana-store";
import { cabanaAuth, useCabanaUser, type CabanaUser } from "@/lib/cabana-auth";
import { NotificationBadge } from "@/components/cabana/notifications/NotificationBadge";

/**
 * Persistent left navigation for the social surfaces (OnlyFans-style structure).
 * Every destination maps to an implemented route; creator-only publishing is
 * surfaced only when a creator profile exists for the signed-in account.
 */
type NavItem = {
  label: string;
  icon: LucideIcon;
  to: string;
  badge?: boolean;
};

const MEMBER_NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: Home, to: "/feed" },
  { label: "Explore", icon: Compass, to: "/explore" },
  { label: "Notifications", icon: Bell, to: "/notifications", badge: true },
  { label: "Messages", icon: MessageCircle, to: "/messages" },
  { label: "Settings", icon: User, to: "/settings" },
];

function useActive(path?: string) {
  const current = useRouterState({ select: (s) => s.location.pathname });
  if (!path) return false;
  return current === path || current.startsWith(path + "/");
}

/** Desktop: fixed vertical rail. Mobile: bottom tab bar (icons only). */
export function SocialNav() {
  const user = useCabanaUser();
  const { profile } = useCabana();
  const items = profile
    ? [...MEMBER_NAV_ITEMS, { label: "Studio", icon: LayoutDashboard, to: "/dashboard/home" }]
    : MEMBER_NAV_ITEMS;

  return (
    <>
      <DesktopNav items={items} user={user} profile={profile} />
      <MobileNav items={items} />
    </>
  );
}

function DesktopNav({
  items,
  user,
  profile,
}: {
  items: NavItem[];
  user: CabanaUser | null;
  profile: CabanaProfile | null;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col border-r border-white/[0.07] bg-[oklch(0.105_0.012_280/0.94)] px-5 py-6 backdrop-blur-3xl lg:flex">
      <div className="absolute inset-x-0 top-0 h-px bg-iridescent opacity-70" />
      <div className="mb-8 flex items-center justify-between px-2">
        <Link
          to="/feed"
          className="group flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-iridescent shadow-glow-sm transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105">
            <Sparkles className="h-5 w-5 text-background" />
            <span className="absolute inset-[1px] rounded-[15px] border border-white/30" />
          </div>
          <div>
            <div className="font-display text-lg font-semibold tracking-[0.08em]">CABANA</div>
            <div className="text-[9px] uppercase tracking-[0.28em] text-muted-foreground">
              Private social
            </div>
          </div>
        </Link>
      </div>

      <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/60">
        Menu
      </p>
      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {items.map((item) => (
          <NavLink key={item.label} item={item} />
        ))}
      </nav>

      <div className="border-t border-white/[0.07] pt-5">
        <PrimaryAction user={user} profile={profile} />
        <ProfileCard user={user} profile={profile} />
      </div>
    </aside>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const isActive = useActive(item.to);
  const Icon = item.icon;
  const inner = (
    <>
      {isActive && (
        <motion.div
          layoutId="socialNavActive"
          className="absolute inset-0 rounded-2xl border border-white/[0.12] bg-white/[0.08] shadow-[inset_0_1px_0_oklch(1_0_0/0.12),0_14px_36px_-24px_oklch(0.78_0.18_280/0.8)] backdrop-blur-xl"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      {isActive && <span className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-iridescent" />}
      <span
        className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
          isActive
            ? "bg-iridescent text-background shadow-glow-sm"
            : "bg-white/[0.025] text-muted-foreground group-hover:bg-white/[0.06] group-hover:text-foreground"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span
        className={`relative z-10 font-medium tracking-[-0.01em] ${
          isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
        }`}
      >
        {item.label}
      </span>
      {item.badge && <NotificationBadge className="relative z-10 ml-auto" />}
    </>
  );

  const className =
    "group relative flex items-center gap-3 rounded-2xl px-3 py-2 text-sm outline-none transition-colors hover:bg-foreground/[0.035] focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Link to={item.to} className={className}>
      {inner}
    </Link>
  );
}

function PrimaryAction({
  user,
  profile,
}: {
  user: CabanaUser | null;
  profile: CabanaProfile | null;
}) {
  const destination = profile ? "/dashboard/posts/new" : user ? "/explore" : "/signup";
  const label = profile ? "Create new post" : user ? "Explore creators" : "Join CABANA";
  const Icon = profile ? PenLine : user ? Compass : Sparkles;

  return (
    <Link to={destination} className="btn-luxury w-full justify-center !rounded-2xl !py-3.5">
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}

function ProfileCard({
  user,
  profile,
}: {
  user: CabanaUser | null;
  profile: CabanaProfile | null;
}) {
  const navigate = useNavigate();
  if (!user) return null;
  const handle = profile?.handle;
  const initials = user.name
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-2.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-iridescent text-xs font-semibold text-background ring-2 ring-white/10">
        {profile?.avatar ? (
          <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          initials || "✦"
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{user.name}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {handle ? `@${handle}` : user.email}
        </div>
      </div>
      <button
        onClick={async () => {
          await cabanaAuth.logout();
          navigate({ to: "/login" });
        }}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Mobile bottom tab bar — primary destinations only. */
function MobileNav({ items }: { items: NavItem[] }) {
  const mobileItems = items.filter((item) => item.to !== "/dashboard").slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/[0.08] bg-[oklch(0.11_0.012_280/0.94)] px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_-30px_oklch(0_0_0/0.9)] backdrop-blur-3xl lg:hidden">
      {mobileItems.map((item) => (
        <MobileTab key={item.label} item={item} />
      ))}
    </nav>
  );
}

function MobileTab({ item }: { item: NavItem }) {
  const isActive = useActive(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={`relative flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
        isActive ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      {isActive && (
        <span className="absolute inset-x-1 -top-2 h-0.5 rounded-full bg-iridescent shadow-glow-sm" />
      )}
      <span className={isActive ? "rounded-xl bg-white/[0.08] px-3 py-1" : "px-3 py-1"}>
        <Icon className="h-5 w-5" />
      </span>
      {item.label}
      {item.badge && <NotificationBadge className="absolute right-1 top-0" />}
    </Link>
  );
}
