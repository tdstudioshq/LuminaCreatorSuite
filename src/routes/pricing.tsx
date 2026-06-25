import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { Sparkles, Check, ArrowUpRight, Minus, Star, Zap, Crown, Building2 } from "lucide-react";
import { GlobalNav } from "@/components/cabana/GlobalNav";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "CABANA" },
      {
        name: "description",
        content:
          "Free, Pro, Premium and Agency plans. Bio pages, storefronts, AI agents, analytics — priced for serious creators.",
      },
      { property: "og:title", content: "CABANA" },
      {
        property: "og:description",
        content: "Plans engineered for creators, premium operators and agencies.",
      },
    ],
  }),
});

type Cycle = "monthly" | "yearly";

const PLANS = [
  {
    id: "free",
    name: "Atelier",
    tag: "Free",
    Icon: Sparkles,
    price: { monthly: 0, yearly: 0 },
    blurb: "Start your creator world. No credit card.",
    features: [
      "1 creator page",
      "Up to 8 smart links",
      "Basic analytics",
      "Cabana subdomain",
      "Community templates",
    ],
    cta: "Start free",
    accent: "from-foreground/10 to-foreground/5",
  },
  {
    id: "pro",
    name: "Studio",
    tag: "Pro",
    Icon: Zap,
    price: { monthly: 19, yearly: 15 },
    blurb: "For serious creators monetizing fans daily.",
    features: [
      "Everything in Atelier",
      "Unlimited smart links",
      "Storefront & digital products",
      "AI bio + caption agent",
      "Advanced analytics",
      "Custom domain",
    ],
    cta: "Start 14-day trial",
    accent: "from-iridescent/40 to-iridescent/10",
    featured: false,
  },
  {
    id: "premium",
    name: "Maison",
    tag: "Premium",
    Icon: Crown,
    price: { monthly: 49, yearly: 39 },
    blurb: "The full operating system. Apple-grade polish.",
    features: [
      "Everything in Studio",
      "All 7 AI agents",
      "Premium themes & chrome",
      "Sponsorship-ready media kit",
      "Priority routing engine",
      "Concierge onboarding",
    ],
    cta: "Go premium",
    accent: "from-iridescent/60 via-accent/40 to-primary/30",
    featured: true,
  },
  {
    id: "agency",
    name: "Empire",
    tag: "Agency",
    Icon: Building2,
    price: { monthly: 199, yearly: 169 },
    blurb: "Manage a roster of creators under one suite.",
    features: [
      "Up to 25 creator seats",
      "Roster dashboard",
      "White-label exports",
      "Shared brand library",
      "Dedicated success lead",
      "API & webhooks",
    ],
    cta: "Talk to sales",
    accent: "from-chrome/50 to-chrome/10",
  },
];

function PricingPage() {
  const [cycle, setCycle] = useState<Cycle>("yearly");

  return (
    <div className="relative min-h-screen overflow-x-hidden pb-32">
      {/* Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/3 w-[560px] h-[560px] rounded-full bg-iridescent opacity-25 blur-[140px] animate-float" />
        <div
          className="absolute top-1/2 -right-40 w-[480px] h-[480px] rounded-full opacity-25 blur-[140px] animate-float"
          style={{
            animationDelay: "2s",
            background: "radial-gradient(circle, oklch(0.7 0.2 330 / 0.6), transparent 70%)",
          }}
        />
      </div>

      <GlobalNav />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-28">
        <Hero cycle={cycle} setCycle={setCycle} />
        <Cards cycle={cycle} />
        <Comparison />
        <Faq />
        <FinalCTA />
      </main>
    </div>
  );
}

function Hero({ cycle, setCycle }: { cycle: Cycle; setCycle: (c: Cycle) => void }) {
  return (
    <section className="pt-12 sm:pt-16 text-center">
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="eyebrow">
        Pricing
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.8 }}
        className="mt-4 font-display font-semibold tracking-tighter leading-[0.95]"
        style={{ fontSize: "clamp(2.5rem, 6.5vw, 5rem)" }}
      >
        Plans built for the
        <br />
        <span className="text-iridescent">next-gen creator class.</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="mt-5 max-w-lg mx-auto text-muted-foreground"
      >
        Start free. Upgrade when your audience does. Every plan is engineered to feel cinematic.
      </motion.p>

      {/* Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-8 inline-flex items-center gap-1 p-1.5 rounded-full glass-strong"
      >
        {(["monthly", "yearly"] as Cycle[]).map((c) => {
          const active = cycle === c;
          return (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className="relative px-5 py-2 rounded-full text-xs font-semibold capitalize"
            >
              {active && (
                <motion.div
                  layoutId="cycle-pill"
                  className="absolute inset-0 rounded-full bg-iridescent shadow-glow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span
                className={`relative z-10 ${active ? "text-background" : "text-muted-foreground"}`}
              >
                {c}
              </span>
              {c === "yearly" && (
                <span
                  className={`relative z-10 ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-background/20 text-background" : "bg-foreground/10 text-foreground"}`}
                >
                  −20%
                </span>
              )}
            </button>
          );
        })}
      </motion.div>
    </section>
  );
}

function Cards({ cycle }: { cycle: Cycle }) {
  return (
    <section className="mt-16 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {PLANS.map((p, i) => {
        const price = p.price[cycle];
        const featured = p.featured;
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.6 }}
            whileHover={{ y: -6 }}
            className={`relative rounded-3xl ${featured ? "lg:scale-[1.03]" : ""}`}
          >
            {/* Glowing border for featured */}
            {featured && (
              <>
                <div className="absolute -inset-px rounded-3xl bg-iridescent opacity-90 blur-[2px]" />
                <div className="absolute -inset-6 rounded-[36px] bg-iridescent opacity-30 blur-2xl -z-10 animate-pulse-glow" />
              </>
            )}

            <div
              className={`relative h-full rounded-3xl p-6 sm:p-7 flex flex-col ${featured ? "glass-strong" : "glass"}`}
            >
              {featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.22em] font-semibold surface-chrome flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" /> Most loved
                </div>
              )}

              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-2xl bg-iridescent shadow-glow-sm flex items-center justify-center">
                  <p.Icon className="w-5 h-5 text-background" />
                </div>
                <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {p.tag}
                </span>
              </div>

              <div className="mt-5 font-display text-2xl font-semibold tracking-tight">
                {p.name}
              </div>
              <p className="text-sm text-muted-foreground mt-1 min-h-[42px]">{p.blurb}</p>

              {/* Price */}
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-display font-semibold tracking-tighter">
                  ${price}
                </span>
                <span className="text-sm text-muted-foreground">
                  /{cycle === "yearly" ? "mo · billed yearly" : "month"}
                </span>
              </div>

              {/* CTA */}
              <button
                className={`mt-5 w-full py-3 rounded-2xl font-semibold text-sm transition-all ${featured ? "bg-iridescent text-background shadow-glow hover:shadow-luxury" : "btn-ghost justify-center"}`}
              >
                {p.cta}
              </button>

              {/* Features */}
              <div className="mt-6 pt-6 border-t border-border/50 space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <div key={f} className="flex items-start gap-2.5 text-sm">
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${featured ? "bg-iridescent" : "bg-foreground/10"}`}
                    >
                      <Check
                        className={`w-2.5 h-2.5 ${featured ? "text-background" : "text-foreground"}`}
                      />
                    </div>
                    <span className="text-foreground/85">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        );
      })}
    </section>
  );
}

const COMPARE_ROWS = [
  { feat: "Creator pages", values: ["1", "Unlimited", "Unlimited", "25 seats"] },
  { feat: "Smart links", values: ["8", "Unlimited", "Unlimited", "Unlimited"] },
  { feat: "Storefront", values: [false, true, true, true] },
  { feat: "AI bio & captions", values: [false, true, true, true] },
  { feat: "All 7 AI agents", values: [false, false, true, true] },
  { feat: "Premium themes & chrome", values: [false, false, true, true] },
  { feat: "Custom domain", values: [false, true, true, true] },
  { feat: "Sponsorship media kit", values: [false, false, true, true] },
  { feat: "White-label exports", values: [false, false, false, true] },
  { feat: "API & webhooks", values: [false, false, false, true] },
  { feat: "Concierge support", values: [false, false, true, true] },
];

function Comparison() {
  return (
    <section className="mt-28">
      <SectionTitle kicker="Side by side" title="Compare every plan." />
      <div className="glass rounded-3xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] px-6 py-4 border-b border-border/50 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <div>Feature</div>
          {PLANS.map((p) => (
            <div key={p.id} className="text-center">
              {p.tag}
            </div>
          ))}
        </div>
        {COMPARE_ROWS.map((r, i) => (
          <div
            key={r.feat}
            className={`grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] px-6 py-4 items-center text-sm ${i % 2 ? "bg-foreground/[0.02]" : ""}`}
          >
            <div className="font-medium col-span-2 md:col-span-1 mb-2 md:mb-0">{r.feat}</div>
            {r.values.map((v, vi) => (
              <div key={vi} className="flex md:justify-center items-center gap-2">
                <span className="md:hidden text-[10px] uppercase tracking-wider text-muted-foreground w-16">
                  {PLANS[vi].tag}
                </span>
                {typeof v === "boolean" ? (
                  v ? (
                    <Check className="w-4 h-4 text-iridescent" />
                  ) : (
                    <Minus className="w-4 h-4 text-muted-foreground/40" />
                  )
                ) : (
                  <span className="text-foreground/90">{v}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "Can I switch plans anytime?",
    a: "Yes. Upgrades apply instantly with prorated billing. Downgrades take effect at the end of the current cycle.",
  },
  {
    q: "What happens if I cancel?",
    a: "Your page stays live on the free tier. Premium features pause but your data is preserved.",
  },
  {
    q: "Do you offer discounts for creators?",
    a: "Yearly billing is 20% off. Verified students and non-profits get an additional 30% on Studio and Maison.",
  },
  {
    q: "Is there a transaction fee on sales?",
    a: "No platform fee on Maison and Empire. Studio is 2.5%. Free is 7%. Stripe processing applies on all tiers.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="mt-28">
      <SectionTitle kicker="Questions" title="Everything you need to know." />
      <div className="space-y-3 max-w-3xl mx-auto">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <motion.button
              key={f.q}
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full text-left glass rounded-2xl p-5 hover:bg-foreground/[0.04] transition-colors"
              layout
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-display font-semibold">{f.q}</span>
                <span
                  className={`w-7 h-7 rounded-full glass flex items-center justify-center transition-transform ${isOpen ? "rotate-45" : ""}`}
                >
                  <span className="text-lg leading-none">+</span>
                </span>
              </div>
              <motion.div
                initial={false}
                animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <p className="text-sm text-muted-foreground mt-3">{f.a}</p>
              </motion.div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mt-28">
      <div className="relative glass-strong rounded-[36px] p-10 sm:p-16 text-center overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, oklch(0.7 0.2 280 / 0.6), transparent 65%)",
          }}
        />
        <p className="eyebrow">Ready when you are</p>
        <h2
          className="mt-3 font-display font-semibold tracking-tighter"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
        >
          Start your <span className="text-iridescent">creator empire</span> today.
        </h2>
        <p className="mt-4 text-muted-foreground max-w-md mx-auto">
          14-day Maison trial. No credit card. Cancel anytime.
        </p>
        <div className="mt-8 flex justify-center gap-3 flex-wrap">
          <button className="btn-luxury">
            Start free trial <ArrowUpRight className="w-4 h-4" />
          </button>
          <Link to="/features/ai" className="btn-ghost">
            Explore AI
          </Link>
        </div>
      </div>
    </section>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-10 text-center">
      <p className="eyebrow">{kicker}</p>
      <h2
        className="mt-2 font-display font-semibold tracking-tighter"
        style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)" }}
      >
        {title}
      </h2>
    </div>
  );
}
