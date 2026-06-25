import { motion } from "framer-motion";
import { Link2, Store, FileText, BarChart3, Wand2, Filter, Palette } from "lucide-react";

const features = [
  {
    icon: Link2,
    title: "Smart Link Blocks",
    desc: "Adaptive links that route fans by behavior, geography and intent.",
  },
  {
    icon: Store,
    title: "Creator Storefront",
    desc: "Sell drops, presets, sessions and digital goods natively.",
  },
  {
    icon: FileText,
    title: "Media Kits",
    desc: "Press-ready kits that update themselves from your analytics.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    desc: "Cohort, conversion and revenue insight in one cinematic canvas.",
  },
  {
    icon: Wand2,
    title: "AI Generation",
    desc: "Bios, CTAs, themes and pages generated in your voice.",
  },
  {
    icon: Filter,
    title: "Fan Funnels",
    desc: "Route superfans to high-intent journeys automatically.",
  },
  {
    icon: Palette,
    title: "Custom Branding",
    desc: "Fonts, motion, color systems — every pixel earns its place.",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-32 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-16">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground mb-4">
            The platform
          </p>
          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tighter leading-[1]">
            One hub. <span className="text-chrome">Every surface</span> of your creator business.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.06 }}
              whileHover={{ y: -4 }}
              className="group relative glass rounded-3xl p-7 overflow-hidden"
            >
              <div
                className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                style={{ background: "var(--gradient-iridescent)", filter: "blur(60px)" }}
              />
              <div className="relative">
                <div className="w-11 h-11 rounded-xl glass-strong flex items-center justify-center mb-6">
                  <f.icon
                    className="w-5 h-5 text-chrome"
                    style={{ color: "oklch(0.92 0.02 230)" }}
                  />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
