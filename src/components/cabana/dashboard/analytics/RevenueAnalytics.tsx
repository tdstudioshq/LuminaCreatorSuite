import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/cabana-money";
import type { RevenueAnalyticsView } from "@/lib/cabana-creator-analytics";
import { ChartEmpty } from "./ChartEmpty";

/** Compact money tick (e.g. $1.2k) for chart axes. */
function compactMoney(cents: number, currency: string): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) {
    return `${dollars < 0 ? "-" : ""}$${Math.abs(dollars / 1000).toFixed(1)}k`;
  }
  return formatMoney(cents, currency);
}

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs shadow-luxury">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-display font-semibold tabular-nums text-iridescent">
        {formatMoney(payload[0].value, currency)}
      </div>
    </div>
  );
}

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;
const TREND_TONE = {
  up: "text-emerald-400",
  down: "text-rose-400",
  flat: "text-muted-foreground",
} as const;

export function RevenueAnalytics({ revenue }: { revenue: RevenueAnalyticsView }) {
  const { currency } = revenue;
  const TrendIcon = TREND_ICON[revenue.trend.direction];
  // An all-zero / empty series should show the shared "no data" state rather
  // than a recharts axis scaled to an invented ceiling.
  const dailyEmpty = revenue.dailySeries.every((d) => d.cents === 0);
  const monthlyEmpty = revenue.monthlySeries.every((d) => d.cents === 0);

  return (
    <section className="glass-strong rounded-3xl p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Revenue</h2>
          <p className="text-xs text-muted-foreground">Settled net earnings over time.</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-semibold tabular-nums text-iridescent">
            {formatMoney(revenue.totalCents, currency)}
          </div>
          <div
            className={`flex items-center justify-end gap-1 text-[11px] font-medium ${TREND_TONE[revenue.trend.direction]}`}
          >
            <TrendIcon className="h-3 w-3" />
            {revenue.trend.changePct > 0 ? "+" : ""}
            {revenue.trend.changePct}% vs prior
          </div>
        </div>
      </div>

      <div className="mb-2 text-xs font-medium text-muted-foreground">
        Daily ({revenue.dailySeries.length}d)
      </div>
      {dailyEmpty ? (
        <ChartEmpty className="h-48 w-full" />
      ) : (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={revenue.dailySeries}
              margin={{ top: 4, right: 4, bottom: 0, left: -8 }}
            >
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                opacity={0.3}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => compactMoney(v, currency)}
              />
              <Tooltip
                content={<ChartTooltip currency={currency} />}
                cursor={{ stroke: "var(--border)" }}
              />
              <Area
                type="monotone"
                dataKey="cents"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#revFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mb-2 mt-5 text-xs font-medium text-muted-foreground">Last 12 months</div>
      {monthlyEmpty ? (
        <ChartEmpty className="h-44 w-full" />
      ) : (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={revenue.monthlySeries}
              margin={{ top: 4, right: 4, bottom: 0, left: -8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                opacity={0.3}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => compactMoney(v, currency)}
              />
              <Tooltip
                content={<ChartTooltip currency={currency} />}
                cursor={{ fill: "var(--foreground)", opacity: 0.04 }}
              />
              <Bar dataKey="cents" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
