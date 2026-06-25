import { motion } from "framer-motion";
import { TrendingUp, Users, DollarSign, MousePointerClick } from "lucide-react";

const stats = [
  { icon: MousePointerClick, label: "Clicks", value: "284,917", delta: "+12.4%" },
  { icon: TrendingUp, label: "Conversion", value: "8.7%", delta: "+2.1%" },
  { icon: Users, label: "New fans", value: "12,408", delta: "+34%" },
  { icon: DollarSign, label: "Revenue", value: "$48.2K", delta: "+18.6%" },
];

const bars = [40, 65, 50, 80, 72, 95, 68, 88, 76, 92, 84, 100];

export function Analytics() {
  return (
    <section className="relative py-32 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground mb-4">
            Intelligence
          </p>
          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tighter leading-[1]">
            Analytics that look <br />
            <span className="text-chrome">like the brand.</span>
          </h2>
          <p className="mt-6 text-muted-foreground text-lg max-w-md">
            Cohorts, funnels, audience geometry and revenue attribution — rendered in a canvas
            you'll actually open every morning.
          </p>
          <div className="mt-8 flex flex-wrap gap-2 text-xs">
            {[
              "Real-time",
              "Cohort retention",
              "Revenue split",
              "UTM attribution",
              "Geo heatmap",
            ].map((t) => (
              <span key={t} className="glass rounded-full px-3 py-1.5 text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay: 0.1 }}
          className="relative"
        >
          <div className="absolute -inset-10 bg-iridescent opacity-20 blur-3xl rounded-full" />
          <div className="relative glass-strong rounded-3xl p-6 shadow-luxury">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs text-muted-foreground">This month</p>
                <p className="font-display text-2xl font-semibold">Performance</p>
              </div>
              <div className="flex gap-1.5">
                {["7D", "30D", "90D"].map((t, i) => (
                  <button
                    key={t}
                    className={`text-[10px] px-2.5 py-1 rounded-lg ${i === 1 ? "bg-foreground text-background" : "glass text-muted-foreground"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {stats.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className="glass rounded-2xl p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <s.icon className="w-4 h-4 text-muted-foreground" />
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: "oklch(0.85 0.15 165)" }}
                    >
                      {s.delta}
                    </span>
                  </div>
                  <p className="font-display text-2xl font-semibold tracking-tight">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                </motion.div>
              ))}
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="flex items-end justify-between h-32 gap-1.5">
                {bars.map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    whileInView={{ height: `${h}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.4 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                    className="flex-1 rounded-t-md bg-iridescent opacity-80"
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                <span>Jan</span>
                <span>Apr</span>
                <span>Aug</span>
                <span>Dec</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
