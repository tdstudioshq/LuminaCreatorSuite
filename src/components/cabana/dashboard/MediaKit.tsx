import { motion } from "framer-motion";
import { Download, FileText, Sparkles } from "lucide-react";
import auroraImg from "@/assets/aurora-hero.jpg";
import { comingSoon } from "@/lib/coming-soon";
import { Button } from "@/components/ui/button";

const metrics = [
  { label: "Total Reach", value: "2.4M" },
  { label: "Engagement Rate", value: "12.8%" },
  { label: "Avg. Story Views", value: "184K" },
  { label: "Audience Growth", value: "+24%/mo" },
];

const demographics = [
  { label: "Female 18-24", pct: 38 },
  { label: "Female 25-34", pct: 31 },
  { label: "Male 18-24", pct: 14 },
  { label: "Male 25-34", pct: 11 },
  { label: "Other", pct: 6 },
];

const geo = ["United States 42%", "United Kingdom 14%", "Brazil 9%", "Germany 7%", "France 6%"];

export function MediaKit() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2 flex items-center gap-2">
            <Sparkles className="w-3 h-3" /> Sponsorship Ready
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tighter">
            Media Kit
          </h1>
        </div>
        <Button
          onClick={() => comingSoon("Media kit PDF export")}
          variant="cta"
          size="sm"
          className="!rounded-full"
        >
          <Download className="w-4 h-4" /> Export PDF
        </Button>
      </div>

      <div className="glass-strong rounded-[2rem] overflow-hidden shadow-luxury">
        <div className="grid md:grid-cols-2">
          <div className="relative aspect-[4/5] md:aspect-auto md:min-h-[420px]">
            <img src={auroraImg} alt="Aurora" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <div className="text-xs uppercase tracking-[0.3em] text-white/70">Creator</div>
              <div className="text-4xl font-display font-semibold text-white tracking-tighter">
                Aurora
              </div>
              <div className="text-sm text-white/80">Lifestyle • Fashion • Music</div>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <div>
              <h3 className="font-display text-lg font-semibold mb-3">Reach & Performance</h3>
              <div className="grid grid-cols-2 gap-3">
                {metrics.map((m) => (
                  <div key={m.label} className="glass rounded-2xl p-4">
                    <div className="text-2xl font-display font-semibold text-iridescent">
                      {m.value}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-display text-lg font-semibold mb-3">Audience</h3>
              <div className="space-y-2.5">
                {demographics.map((d, i) => (
                  <div key={d.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{d.label}</span>
                      <span className="text-muted-foreground">{d.pct}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-foreground/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${d.pct}%` }}
                        transition={{ delay: i * 0.08 }}
                        className="h-full bg-iridescent rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-display text-lg font-semibold mb-3">Top Geographies</h3>
              <div className="flex flex-wrap gap-2">
                {geo.map((g) => (
                  <span key={g} className="text-xs px-3 py-1.5 rounded-full glass">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-3xl p-6 flex items-center gap-4">
        <FileText className="w-8 h-8 text-iridescent" />
        <div className="flex-1">
          <div className="font-medium">Brand-ready presentation deck</div>
          <div className="text-xs text-muted-foreground">
            Auto-generated from your latest 30 days of metrics.
          </div>
        </div>
        <button
          onClick={() => comingSoon("Presentation deck preview")}
          className="text-xs px-4 py-2 rounded-full bg-foreground/10 hover:bg-foreground/15"
        >
          Preview
        </button>
      </div>
    </div>
  );
}
