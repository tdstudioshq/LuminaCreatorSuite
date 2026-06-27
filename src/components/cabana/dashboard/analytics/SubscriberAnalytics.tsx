import { TrendingUp, UserMinus, UserPlus, Users } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SubscriberAnalyticsView } from "@/lib/cabana-creator-analytics";

function CountTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs shadow-luxury">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-display font-semibold tabular-nums">{payload[0].value} active</div>
    </div>
  );
}

export function SubscriberAnalytics({ subscribers }: { subscribers: SubscriberAnalyticsView }) {
  const stats = [
    {
      key: "active",
      label: "Active",
      value: subscribers.active,
      icon: Users,
      tone: "text-iridescent",
    },
    { key: "new", label: "New", value: subscribers.new, icon: UserPlus, tone: "text-emerald-400" },
    {
      key: "canceled",
      label: "Canceled",
      value: subscribers.canceled,
      icon: UserMinus,
      tone: "text-rose-400",
    },
  ];

  return (
    <section className="glass-strong rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Subscribers</h2>
          <p className="text-xs text-muted-foreground">Growth and churn over the selected range.</p>
        </div>
        {subscribers.new > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
            <TrendingUp className="h-3 w-3" />+{subscribers.growthPct}%
          </span>
        )}
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.key} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </div>
            <div className={`mt-1.5 font-display text-2xl font-semibold tabular-nums ${s.tone}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={subscribers.series} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.3}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={36}
              allowDecimals={false}
            />
            <Tooltip content={<CountTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
            <Line
              type="monotone"
              dataKey="cents"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
