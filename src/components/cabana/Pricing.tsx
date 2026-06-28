import { motion } from "framer-motion";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Launch your CABANA in minutes.",
    features: [
      "Creator landing page",
      "Storefront essentials",
      "Basic analytics",
      "Mobile-first themes",
    ],
  },
  {
    name: "Pro",
    price: "$19",
    period: "/ month",
    desc: "For creators going full-time.",
    featured: true,
    features: [
      "Custom domain & branding",
      "Advanced fan funnels",
      "Media kit + press exports",
      "Revenue analytics",
      "Priority support",
    ],
  },
  {
    name: "Premium",
    price: "$49",
    period: "/ month",
    desc: "For elite creators & small teams.",
    features: [
      "Everything in Pro",
      "Unlimited fan subscription tiers",
      "Dedicated designer hours",
      "Manager dashboard",
      "Concierge launch & SLA",
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative py-32 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground mb-4">
            Membership
          </p>
          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tighter">Tiered for taste.</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className={`relative rounded-3xl p-8 ${t.featured ? "glass-strong shadow-glow" : "glass"}`}
            >
              {t.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-iridescent text-background text-[10px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full">
                  Most loved
                </div>
              )}
              <h3 className="font-display text-2xl font-semibold">{t.name}</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-6">{t.desc}</p>
              <div className="flex items-baseline gap-2 mb-8">
                <span className="text-5xl font-display font-semibold tracking-tighter">
                  {t.price}
                </span>
                <span className="text-sm text-muted-foreground">{t.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <Check
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "oklch(0.85 0.15 195)" }}
                    />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-3 rounded-xl text-sm font-medium transition-all ${
                  t.featured
                    ? "bg-foreground text-background hover:scale-[1.02]"
                    : "glass hover:bg-white/5"
                }`}
              >
                {t.featured ? "Become a member" : "Choose " + t.name}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
