import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Sparkles,
  Users,
  ShieldCheck,
  BarChart3,
  CreditCard,
  DollarSign,
  Flag,
  Star,
  TrendingUp,
  Search,
  Bell,
  Filter,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  Crown,
  LayoutDashboard,
  ClipboardList,
  ScrollText,
} from "lucide-react";
import { useHasRole } from "@/lib/cabana-roles";

export const Route = createFileRoute("/admin")({
  component: AdminGate,
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Internal CABANA admin console." },
    ],
  }),
});

type Tab = "overview" | "users" | "verify" | "subs" | "payouts" | "flags" | "featured" | "growth";

function AdminGate() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { loading, hasRole, signedIn } = useHasRole("admin");

  useEffect(() => {
    if (pathname !== "/admin") return;
    if (loading) return;
    if (!signedIn) navigate({ to: "/login", search: { redirect: "/admin" } as never });
    else if (!hasRole) navigate({ to: "/dashboard" });
  }, [pathname, loading, hasRole, signedIn, navigate]);

  // Child routes own their capability gates: moderation permits admin or
  // moderator, while finance remains admin-only. Render the child outlet here
  // instead of forcing every nested route through this root admin-only gate.
  if (pathname !== "/admin") {
    return <Outlet />;
  }
  if (loading || !hasRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground animate-pulse">
          Verifying access…
        </div>
      </div>
    );
  }
  return <Admin />;
}

function Admin() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Orbs />
      <Sidebar tab={tab} setTab={setTab} />
      <div className="lg:pl-72">
        <TopBar />
        <main className="px-4 sm:px-6 lg:px-10 pt-6 pb-24 max-w-[1400px] mx-auto">
          <MobileTabs tab={tab} setTab={setTab} />
          {tab === "overview" && <Overview />}
          {tab === "users" && <UsersPanel />}
          {tab === "verify" && <Verification />}
          {tab === "subs" && <Subscriptions />}
          {tab === "payouts" && <Payouts />}
          {tab === "flags" && <Flagged />}
          {tab === "featured" && <Featured />}
          {tab === "growth" && <Growth />}
        </main>
      </div>
    </div>
  );
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full bg-iridescent opacity-15 blur-[140px]" />
      <div
        className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full opacity-15 blur-[120px]"
        style={{ background: "radial-gradient(circle, oklch(0.7 0.2 195 / 0.6), transparent 70%)" }}
      />
    </div>
  );
}

/* ------------------------------ NAV ------------------------------ */
const NAV: { id: Tab; label: string; Icon: typeof Users }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "users", label: "Users", Icon: Users },
  { id: "verify", label: "Verification", Icon: ShieldCheck },
  { id: "subs", label: "Subscriptions", Icon: CreditCard },
  { id: "payouts", label: "Payouts", Icon: DollarSign },
  { id: "flags", label: "Flagged", Icon: Flag },
  { id: "featured", label: "Featured", Icon: Star },
  { id: "growth", label: "Growth", Icon: TrendingUp },
];

function Sidebar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <aside className="fixed left-4 top-4 bottom-4 w-64 z-30 hidden lg:flex flex-col glass-strong rounded-3xl p-5 shadow-luxury">
      <Link to="/" className="flex items-center gap-2 px-2 mb-8">
        <div className="w-9 h-9 rounded-xl bg-iridescent flex items-center justify-center shadow-glow-sm">
          <Sparkles className="w-5 h-5 text-background" />
        </div>
        <div>
          <div className="font-display font-semibold tracking-tight">CABANA</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Admin</div>
        </div>
      </Link>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className="relative px-3 py-2.5 rounded-xl text-sm flex items-center gap-3 text-left group"
            >
              {active && (
                <motion.div
                  layoutId="adminTab"
                  className="absolute inset-0 rounded-xl bg-iridescent shadow-glow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <item.Icon
                className={`w-4 h-4 relative z-10 ${active ? "text-background" : "text-muted-foreground group-hover:text-foreground"}`}
              />
              <span
                className={`relative z-10 font-medium ${active ? "text-background" : "text-muted-foreground group-hover:text-foreground"}`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-6 p-4 rounded-2xl glass border border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> All systems
          normal
        </div>
        <div className="font-display font-semibold">99.99% uptime</div>
      </div>
    </aside>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-20 glass-strong lg:bg-transparent lg:backdrop-blur-none lg:shadow-none px-4 lg:px-10 py-4 flex items-center justify-between gap-4">
      <div>
        <div className="text-xs eyebrow">Admin Console</div>
        <div className="font-display text-xl font-semibold tracking-tight">
          Good evening, Operator.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 glass rounded-full px-3 py-2 w-72">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search creators, payouts, flags…"
            className="bg-transparent outline-none text-sm w-full"
          />
        </div>
        <button className="w-10 h-10 rounded-full glass flex items-center justify-center relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-accent" />
        </button>
        <div className="w-10 h-10 rounded-full bg-iridescent shadow-glow-sm flex items-center justify-center text-background font-display font-semibold text-sm">
          A
        </div>
      </div>
    </header>
  );
}

function MobileTabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="lg:hidden -mx-4 px-4 mb-6 overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        {NAV.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${active ? "bg-iridescent text-background shadow-glow-sm" : "glass text-muted-foreground"}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ HELPERS ------------------------------ */
function PanelTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h2 className="text-2xl font-display font-semibold tracking-tight">{title}</h2>
        {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  up,
  Icon,
}: {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  Icon: typeof Users;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="glass rounded-2xl p-5 relative overflow-hidden"
    >
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-iridescent opacity-15 blur-2xl" />
      <div className="flex items-start justify-between relative">
        <div className="w-9 h-9 rounded-xl glass flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        <div
          className={`flex items-center gap-1 text-xs ${up ? "text-emerald-400" : "text-rose-400"}`}
        >
          {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {delta}
        </div>
      </div>
      <div className="mt-4 text-2xl font-display font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </motion.div>
  );
}

/* ------------------------------ OVERVIEW ------------------------------ */
function Overview() {
  return (
    <div className="space-y-6">
      <PanelTitle
        title="Platform overview"
        sub="Live snapshot across the CABANA network."
        right={
          <div className="flex gap-2">
            {["7d", "30d", "QTD", "All"].map((p, i) => (
              <button
                key={p}
                className={`text-xs px-3 py-1.5 rounded-full ${i === 1 ? "bg-iridescent text-background shadow-glow-sm" : "glass text-muted-foreground"}`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active creators" value="14,829" delta="8.4%" up Icon={Users} />
        <StatCard label="MRR" value="$482,910" delta="12.1%" up Icon={DollarSign} />
        <StatCard
          label="Pending payouts"
          value="$98,420"
          delta="3.2%"
          up={false}
          Icon={CreditCard}
        />
        <StatCard label="Open flags" value="38" delta="14%" up={false} Icon={Flag} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-3xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="eyebrow">Revenue</p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-3xl font-display font-semibold tracking-tight">$1.42M</span>
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  +18.6% MoM
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Legend dot="bg-iridescent" label="Subs" />
              <Legend dot="bg-foreground/30" label="Sales" />
            </div>
          </div>
          <Chart />
        </div>

        <div className="glass rounded-3xl p-6">
          <p className="eyebrow">Top creators</p>
          <div className="mt-5 space-y-4">
            {[
              { n: "Aurora Vale", h: "@auroravale", v: "$48,210" },
              { n: "Mira Solène", h: "@mirasolene", v: "$36,940" },
              { n: "Kasper Knox", h: "@kasperknox", v: "$28,310" },
              { n: "Lin Hayashi", h: "@linhayashi", v: "$21,775" },
            ].map((c, i) => (
              <div key={c.h} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-iridescent text-background flex items-center justify-center font-display font-semibold text-sm">
                  {c.n[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.n}</div>
                  <div className="text-xs text-muted-foreground">{c.h}</div>
                </div>
                <div className="text-sm font-display font-semibold">{c.v}</div>
                <div className="text-[10px] text-muted-foreground">#{i + 1}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {[
          { t: "New signups today", v: "284", s: "+12% vs yesterday" },
          { t: "Verifications pending", v: "47", s: "Avg review · 4h" },
          { t: "Payouts processed", v: "$214,802", s: "Last 24h" },
        ].map((m) => (
          <div key={m.t} className="glass rounded-2xl p-5">
            <div className="text-xs text-muted-foreground">{m.t}</div>
            <div className="font-display text-2xl font-semibold mt-2">{m.v}</div>
            <div className="text-xs text-muted-foreground mt-1">{m.s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

function Chart() {
  const a = [40, 55, 48, 62, 58, 72, 68, 82, 78, 90, 85, 96];
  const b = [22, 30, 28, 36, 34, 44, 42, 50, 48, 56, 52, 60];
  return (
    <div className="h-56 flex items-end gap-2">
      {a.map((h, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
          <div className="w-full flex flex-col items-center justify-end h-full gap-0.5">
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: `${h}%` }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="w-full rounded-t-md bg-iridescent opacity-90"
            />
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: `${b[i]}%` }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 + 0.1, duration: 0.7 }}
              className="w-full rounded-b-md bg-foreground/20"
            />
          </div>
          <div className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition">
            {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][i]}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ USERS ------------------------------ */
const USERS = [
  {
    name: "Aurora Vale",
    email: "aurora@vale.studio",
    plan: "Maison",
    status: "Active",
    joined: "Jan 12",
  },
  {
    name: "Mira Solène",
    email: "mira@solene.fr",
    plan: "Studio",
    status: "Active",
    joined: "Feb 03",
  },
  {
    name: "Kasper Knox",
    email: "kasper@knoxlab.com",
    plan: "Empire",
    status: "Active",
    joined: "Mar 18",
  },
  {
    name: "Lin Hayashi",
    email: "lin@hayashi.jp",
    plan: "Studio",
    status: "Pending",
    joined: "Apr 02",
  },
  {
    name: "Theo Marchand",
    email: "theo@marchand.co",
    plan: "Atelier",
    status: "Suspended",
    joined: "Apr 22",
  },
  {
    name: "Noor Rahimi",
    email: "noor@rahimi.world",
    plan: "Maison",
    status: "Active",
    joined: "May 06",
  },
];

function StatusPill({ s }: { s: string }) {
  const map: Record<string, string> = {
    Active: "bg-emerald-400/15 text-emerald-300",
    Pending: "bg-amber-400/15 text-amber-300",
    Suspended: "bg-rose-400/15 text-rose-300",
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${map[s]}`}>{s}</span>;
}

function UsersPanel() {
  return (
    <div>
      <PanelTitle
        title="User management"
        sub="14,829 total accounts · 9,210 monthly active"
        right={
          <button className="btn-ghost !py-2 text-xs">
            <Filter className="w-3.5 h-3.5" /> Filters
          </button>
        }
      />
      <div className="glass rounded-3xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.6fr_1.6fr_1fr_1fr_1fr_40px] px-6 py-4 border-b border-border/50 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <div>Creator</div>
          <div>Email</div>
          <div>Plan</div>
          <div>Status</div>
          <div>Joined</div>
          <div></div>
        </div>
        {USERS.map((u, i) => (
          <motion.div
            key={u.email}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            className="grid grid-cols-2 md:grid-cols-[1.6fr_1.6fr_1fr_1fr_1fr_40px] gap-y-2 items-center px-6 py-4 border-b border-border/30 last:border-0 hover:bg-foreground/[0.03]"
          >
            <div className="flex items-center gap-3 col-span-2 md:col-span-1">
              <div className="w-9 h-9 rounded-xl bg-iridescent text-background flex items-center justify-center font-display font-semibold text-sm">
                {u.name[0]}
              </div>
              <div className="font-medium text-sm">{u.name}</div>
            </div>
            <div className="text-sm text-muted-foreground truncate">{u.email}</div>
            <div className="text-sm">{u.plan}</div>
            <div>
              <StatusPill s={u.status} />
            </div>
            <div className="text-sm text-muted-foreground">{u.joined}</div>
            <button className="w-8 h-8 rounded-lg glass flex items-center justify-center justify-self-end">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ VERIFICATION ------------------------------ */
function Verification() {
  const requests = [
    { name: "Mira Solène", handle: "@mirasolene", followers: "842K", category: "Model", refs: 3 },
    {
      name: "Lin Hayashi",
      handle: "@linhayashi",
      followers: "318K",
      category: "Musician",
      refs: 4,
    },
    {
      name: "Noor Rahimi",
      handle: "@noorworld",
      followers: "1.2M",
      category: "Influencer",
      refs: 6,
    },
  ];
  return (
    <div>
      <PanelTitle title="Creator verification" sub="47 pending requests · 4h average review time" />
      <div className="grid lg:grid-cols-3 gap-4">
        {requests.map((r) => (
          <motion.div
            key={r.handle}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-3xl p-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-iridescent shadow-glow-sm text-background flex items-center justify-center font-display font-bold">
                {r.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-1.5">
                  {r.name} <ShieldCheck className="w-3.5 h-3.5 text-iridescent" />
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.handle} · {r.category}
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 text-center">
              <div className="glass rounded-xl py-2">
                <div className="font-display font-semibold">{r.followers}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Reach
                </div>
              </div>
              <div className="glass rounded-xl py-2">
                <div className="font-display font-semibold">{r.refs}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  References
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button className="btn-luxury flex-1 !py-2.5 text-xs">
                <CheckCircle2 className="w-4 h-4" /> Approve
              </button>
              <button className="btn-ghost flex-1 !py-2.5 text-xs">
                <XCircle className="w-4 h-4" /> Decline
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ SUBSCRIPTIONS ------------------------------ */
function Subscriptions() {
  const tiers = [
    { name: "Atelier", count: 9420, mrr: 0, color: "bg-foreground/20" },
    { name: "Studio", count: 3940, mrr: 74860, color: "bg-iridescent" },
    { name: "Maison", count: 1284, mrr: 62916, color: "bg-iridescent opacity-70" },
    { name: "Empire", count: 185, mrr: 36815, color: "bg-iridescent opacity-50" },
  ];
  const total = tiers.reduce((s, t) => s + t.count, 0);
  return (
    <div className="space-y-6">
      <PanelTitle title="Subscription tracking" sub="Live MRR, churn and tier distribution." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="MRR" value="$482,910" delta="12.1%" up Icon={DollarSign} />
        <StatCard label="Active subs" value="14,829" delta="6.8%" up Icon={CreditCard} />
        <StatCard label="Churn (30d)" value="2.1%" delta="0.4%" up={false} Icon={ArrowDownRight} />
        <StatCard label="ARPU" value="$32.55" delta="3.6%" up Icon={TrendingUp} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-3xl p-6">
          <p className="eyebrow mb-5">Tier distribution</p>
          <div className="space-y-4">
            {tiers.map((t) => (
              <div key={t.name}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted-foreground">
                    {t.count.toLocaleString()} · ${t.mrr.toLocaleString()} MRR
                  </span>
                </div>
                <div className="h-2 rounded-full bg-foreground/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(t.count / total) * 100}%` }}
                    transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full rounded-full ${t.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-3xl p-6">
          <p className="eyebrow mb-5">Recent activity</p>
          <div className="space-y-3">
            {[
              { e: "Upgrade · Studio → Maison", n: "Mira Solène", v: "+$30/mo" },
              { e: "New sub · Empire", n: "Knox & Co.", v: "+$199/mo" },
              { e: "Cancellation", n: "Theo Marchand", v: "-$19/mo" },
              { e: "Upgrade · Atelier → Studio", n: "Noor Rahimi", v: "+$19/mo" },
            ].map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-3 glass rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-iridescent text-background flex items-center justify-center text-xs font-semibold">
                  {a.n[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{a.e}</div>
                  <div className="text-xs text-muted-foreground">{a.n}</div>
                </div>
                <div
                  className={`text-sm font-display font-semibold ${a.v.startsWith("+") ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {a.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ PAYOUTS ------------------------------ */
function Payouts() {
  const payouts = [
    { name: "Aurora Vale", amount: "$12,420", method: "Stripe", status: "Pending" },
    { name: "Mira Solène", amount: "$8,910", method: "Stripe", status: "Processing" },
    { name: "Kasper Knox", amount: "$22,180", method: "Wire", status: "Paid" },
    { name: "Lin Hayashi", amount: "$5,640", method: "Stripe", status: "Paid" },
    { name: "Noor Rahimi", amount: "$14,720", method: "Stripe", status: "Pending" },
  ];
  const map: Record<string, string> = {
    Pending: "bg-amber-400/15 text-amber-300",
    Processing: "bg-sky-400/15 text-sky-300",
    Paid: "bg-emerald-400/15 text-emerald-300",
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/admin/finance"
          className="group glass rounded-2xl p-5 flex items-center justify-between gap-3 hover:border-foreground/20 border border-transparent transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-iridescent flex items-center justify-center shadow-glow-sm">
              <DollarSign className="w-4 h-4 text-background" />
            </div>
            <div>
              <div className="font-semibold">Finance overview</div>
              <div className="text-xs text-muted-foreground">
                Real revenue, earnings & payout status (admin)
              </div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground transition group-hover:translate-x-0.5" />
        </Link>
        <Link
          to="/admin/ledger"
          className="group glass rounded-2xl p-5 flex items-center justify-between gap-3 hover:border-foreground/20 border border-transparent transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <div className="font-semibold">Ledger explorer</div>
              <div className="text-xs text-muted-foreground">
                Read-only transactions · search · CSV
              </div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground transition group-hover:translate-x-0.5" />
        </Link>
      </div>
      <PanelTitle
        title="Payouts"
        sub="Demo preview — live revenue & ledger are under Finance overview above."
        right={<button className="btn-luxury !py-2 text-xs">Run batch payout</button>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending"
          value="$98,420"
          delta="14 creators"
          up={false}
          Icon={DollarSign}
        />
        <StatCard label="Processing" value="$42,810" delta="6 creators" up Icon={CreditCard} />
        <StatCard label="Paid (30d)" value="$1.18M" delta="9.4%" up Icon={CheckCircle2} />
        <StatCard label="Failed" value="$1,210" delta="2 creators" up={false} Icon={XCircle} />
      </div>
      <div className="glass rounded-3xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] px-6 py-4 border-b border-border/50 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <div>Creator</div>
          <div>Amount</div>
          <div>Method</div>
          <div>Status</div>
          <div className="text-right">Action</div>
        </div>
        {payouts.map((p, i) => (
          <div
            key={i}
            className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-y-2 items-center px-6 py-4 border-b border-border/30 last:border-0"
          >
            <div className="flex items-center gap-3 col-span-2 md:col-span-1">
              <div className="w-9 h-9 rounded-xl bg-iridescent text-background flex items-center justify-center font-display font-semibold text-sm">
                {p.name[0]}
              </div>
              <div className="text-sm font-medium">{p.name}</div>
            </div>
            <div className="font-display font-semibold">{p.amount}</div>
            <div className="text-sm text-muted-foreground">{p.method}</div>
            <div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${map[p.status]}`}>
                {p.status}
              </span>
            </div>
            <div className="md:text-right">
              <button className="btn-ghost !px-3 !py-1.5 text-xs">Review</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ FLAGGED ------------------------------ */
function Flagged() {
  const flags = [
    { creator: "Theo Marchand", reason: "Trademark complaint", severity: "high", time: "2h ago" },
    { creator: "Anonymous", reason: "Spam links on profile", severity: "med", time: "5h ago" },
    { creator: "Noor Rahimi", reason: "Reported by 3 fans", severity: "low", time: "1d ago" },
    { creator: "K. Knox", reason: "Payment dispute", severity: "high", time: "1d ago" },
  ];
  const sev: Record<string, string> = {
    high: "bg-rose-400/15 text-rose-300",
    med: "bg-amber-400/15 text-amber-300",
    low: "bg-foreground/10 text-muted-foreground",
  };
  return (
    <div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link
          to="/admin/reports"
          className="group glass rounded-2xl p-5 flex items-center justify-between gap-3 hover:border-foreground/20 border border-transparent transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-iridescent flex items-center justify-center shadow-glow-sm">
              <ClipboardList className="w-4 h-4 text-background" />
            </div>
            <div>
              <div className="font-semibold">Moderation queue</div>
              <div className="text-xs text-muted-foreground">
                Real, RLS-scoped reports · triage with audit
              </div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground transition group-hover:translate-x-0.5" />
        </Link>
        <Link
          to="/admin/audit"
          className="group glass rounded-2xl p-5 flex items-center justify-between gap-3 hover:border-foreground/20 border border-transparent transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass flex items-center justify-center">
              <ScrollText className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <div className="font-semibold">Audit log</div>
              <div className="text-xs text-muted-foreground">Append-only action trail</div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground transition group-hover:translate-x-0.5" />
        </Link>
      </div>
      <PanelTitle
        title="Flagged content & accounts"
        sub="Demo preview — the live queue is under Moderation queue above"
      />
      <div className="grid lg:grid-cols-2 gap-4">
        {flags.map((f, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl glass flex items-center justify-center">
                  <Flag className="w-4 h-4 text-rose-300" />
                </div>
                <div>
                  <div className="font-semibold">{f.creator}</div>
                  <div className="text-xs text-muted-foreground">{f.time}</div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${sev[f.severity]}`}
              >
                {f.severity}
              </span>
            </div>
            <p className="text-sm text-foreground/80 mt-4">{f.reason}</p>
            <div className="mt-4 flex gap-2">
              <button className="btn-ghost flex-1 !py-2 text-xs">Dismiss</button>
              <button className="btn-luxury flex-1 !py-2 text-xs">Investigate</button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ FEATURED ------------------------------ */
function Featured() {
  const list = [
    { n: "Aurora Vale", h: "@auroravale", tag: "Editorial", rank: 1 },
    { n: "Mira Solène", h: "@mirasolene", tag: "Fashion", rank: 2 },
    { n: "Lin Hayashi", h: "@linhayashi", tag: "Music", rank: 3 },
    { n: "Noor Rahimi", h: "@noorworld", tag: "Lifestyle", rank: 4 },
  ];
  return (
    <div>
      <PanelTitle
        title="Featured creators"
        sub="Curated rotation on CABANA discover."
        right={
          <button className="btn-luxury !py-2 text-xs">
            <Crown className="w-4 h-4" /> Add to rotation
          </button>
        }
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {list.map((c) => (
          <motion.div
            key={c.h}
            whileHover={{ y: -6 }}
            className="glass rounded-3xl p-5 relative overflow-hidden"
          >
            <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-iridescent opacity-25 blur-3xl" />
            <div className="absolute top-3 right-3 surface-chrome rounded-full px-2 py-0.5 text-[10px] font-bold">
              #{c.rank}
            </div>
            <div className="aspect-square rounded-2xl bg-iridescent shadow-glow-sm flex items-end p-4 relative">
              <div className="grain absolute inset-0 rounded-2xl" />
              <div className="text-background font-display text-2xl font-semibold relative">
                {c.n
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
            </div>
            <div className="mt-4 font-display font-semibold flex items-center gap-1.5">
              {c.n} <ShieldCheck className="w-3.5 h-3.5 text-iridescent" />
            </div>
            <div className="text-xs text-muted-foreground">
              {c.h} · {c.tag}
            </div>
            <div className="mt-4 flex gap-2">
              <button className="btn-ghost flex-1 !py-2 text-xs">Preview</button>
              <button className="btn-ghost !px-3 !py-2">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ GROWTH ------------------------------ */
function Growth() {
  return (
    <div className="space-y-6">
      <PanelTitle title="Growth metrics" sub="Funnel, retention and acquisition trends." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Signups (30d)" value="8,420" delta="22.4%" up Icon={Users} />
        <StatCard label="Activation rate" value="68.2%" delta="3.1%" up Icon={BarChart3} />
        <StatCard label="D30 retention" value="54.8%" delta="1.2%" up Icon={TrendingUp} />
        <StatCard label="Viral coeff." value="1.21" delta="0.08" up Icon={Sparkles} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-3xl p-6">
          <p className="eyebrow mb-5">Acquisition funnel</p>
          {[
            { l: "Visit", v: 100, n: "412,890" },
            { l: "Signup", v: 28, n: "115,609" },
            { l: "Activated", v: 19, n: "78,449" },
            { l: "Subscribed", v: 7, n: "28,902" },
          ].map((s) => (
            <div key={s.l} className="mb-4">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-medium">{s.l}</span>
                <span className="text-muted-foreground">
                  {s.n} · {s.v}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-foreground/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${s.v}%` }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full bg-iridescent rounded-full"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="glass rounded-3xl p-6">
          <p className="eyebrow mb-5">Acquisition channels</p>
          <div className="space-y-3">
            {[
              { c: "Organic search", v: 38 },
              { c: "Creator referrals", v: 27 },
              { c: "Social", v: 19 },
              { c: "Direct", v: 11 },
              { c: "Paid", v: 5 },
            ].map((c) => (
              <div key={c.c}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground/85">{c.c}</span>
                  <span className="text-muted-foreground text-xs">{c.v}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-foreground/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${c.v * 2}%` }}
                    transition={{ duration: 0.9 }}
                    className="h-full bg-iridescent rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
