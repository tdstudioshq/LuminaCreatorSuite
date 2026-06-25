import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Sparkles,
  Wand2,
  Layout,
  Palette,
  MessageSquareText,
  Megaphone,
  ShoppingBag,
  Target,
  ArrowUpRight,
  Cpu,
  Zap,
  Check,
  ChevronRight,
} from "lucide-react";
import { GlobalNav } from "@/components/cabana/GlobalNav";

export const Route = createFileRoute("/features/ai")({
  component: AIPage,
  head: () => ({
    meta: [
      { title: "CABANA" },
      {
        name: "description",
        content:
          "AI bios, landing pages, branding, captions, CTAs, storefronts and audience optimization — engineered into one cinematic creator OS.",
      },
    ],
  }),
});

function AIPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden pb-32">
      <Orbs />
      <GlobalNav />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 space-y-28">
        <Hero />
        <ToolsGrid />
        <Workflow />
        <LivePreviews />
        <ModelStack />
        <CTA />
      </main>
    </div>
  );
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 left-1/4 w-[560px] h-[560px] rounded-full bg-iridescent opacity-25 blur-[140px] animate-float" />
      <div
        className="absolute top-1/2 -right-40 w-[520px] h-[520px] rounded-full bg-iridescent opacity-20 blur-[140px] animate-float"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute bottom-0 left-0 w-[420px] h-[420px] rounded-full opacity-20 blur-[120px] animate-float"
        style={{
          animationDelay: "4s",
          background: "radial-gradient(circle, oklch(0.7 0.2 195 / 0.6), transparent 70%)",
        }}
      />
    </div>
  );
}

/* ----------------------------- HERO ----------------------------- */
function Hero() {
  return (
    <section className="pt-12 sm:pt-20 text-center relative">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-iridescent animate-pulse-glow" />
        <span className="text-muted-foreground">Powered by CABANA Intelligence</span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.8 }}
        className="mt-5 font-display font-semibold tracking-tighter leading-[0.95]"
        style={{ fontSize: "clamp(2.75rem, 7vw, 5.75rem)" }}
      >
        Your creator empire,
        <br />
        <span className="text-iridescent">written by AI.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="mt-6 max-w-xl mx-auto text-muted-foreground"
      >
        From bio to brand to storefront — CABANA's AI engineers an entire creator business in
        minutes. No templates. No prompts. Just taste.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-8 flex items-center justify-center gap-3 flex-wrap"
      >
        <button className="btn-luxury">
          Generate my page <ArrowUpRight className="w-4 h-4" />
        </button>
        <button className="btn-ghost">Watch the demo</button>
      </motion.div>

      <FloatingPanels />
    </section>
  );
}

function FloatingPanels() {
  return (
    <div className="relative mt-20 h-[420px] hidden md:block">
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: -6 }}
        animate={{ opacity: 1, y: 0, rotate: -6 }}
        transition={{ delay: 0.6, duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-0 top-10 w-72 glass-strong rounded-3xl p-5 shadow-luxury"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-iridescent flex items-center justify-center">
            <MessageSquareText className="w-3.5 h-3.5 text-background" />
          </div>
          <span className="text-xs eyebrow !tracking-[0.18em]">AI Bio</span>
        </div>
        <Typewriter text="Slow luxury. Quiet rituals. Editorial film and the spaces between." />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40, rotate: 4 }}
        animate={{ opacity: 1, y: 0, rotate: 4 }}
        transition={{ delay: 0.75, duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="absolute right-0 top-0 w-80 glass-strong rounded-3xl p-5 shadow-luxury"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs eyebrow !tracking-[0.18em]">AI Landing</span>
          <div className="flex gap-1">
            {["bg-iridescent", "bg-foreground/30", "bg-foreground/15"].map((c, i) => (
              <span key={i} className={`w-2 h-2 rounded-full ${c}`} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 rounded-full bg-iridescent w-3/4 opacity-90" />
          <div className="h-2 rounded-full bg-foreground/15 w-full" />
          <div className="h-2 rounded-full bg-foreground/15 w-5/6" />
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-square rounded-lg glass" />
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 1 }}
        className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[360px] surface-chrome rounded-3xl p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4" />
          <span className="text-xs uppercase tracking-[0.2em] font-semibold">Generating</span>
          <span className="ml-auto text-xs opacity-70">94%</span>
        </div>
        <div className="h-1.5 rounded-full bg-black/20 overflow-hidden">
          <motion.div
            className="h-full bg-background/80"
            initial={{ width: 0 }}
            animate={{ width: "94%" }}
            transition={{ delay: 1.1, duration: 1.4 }}
          />
        </div>
        <div className="mt-3 text-xs opacity-80">
          Composing brand voice · selecting palette · drafting CTAs…
        </div>
      </motion.div>
    </div>
  );
}

function Typewriter({ text }: { text: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setI((v) => (v < text.length ? v + 1 : v)), 32);
    return () => clearTimeout(t);
  }, [i, text]);
  return (
    <p className="text-sm text-foreground/90 leading-relaxed">
      {text.slice(0, i)}
      <span className="inline-block w-[2px] h-4 align-middle bg-iridescent ml-0.5 animate-pulse" />
    </p>
  );
}

/* ----------------------------- TOOLS GRID ----------------------------- */
const TOOLS = [
  {
    Icon: MessageSquareText,
    name: "AI Bio",
    desc: "Brand-voice bios that read like a stylist wrote them. Tone, rhythm, specificity.",
    tag: "Bio",
  },
  {
    Icon: Layout,
    name: "AI Landing Pages",
    desc: "Composes complete creator pages — hero, blocks, layout, copy — in seconds.",
    tag: "Landing",
  },
  {
    Icon: Palette,
    name: "AI Branding",
    desc: "Generates a full color system, typography pair, and motion language from one reference.",
    tag: "Brand",
  },
  {
    Icon: Megaphone,
    name: "AI Captions",
    desc: "Captions tuned to your platform, audience and post intent — never generic.",
    tag: "Social",
  },
  {
    Icon: Wand2,
    name: "AI CTA Generation",
    desc: "High-conversion CTAs A/B-tested against your historical click data.",
    tag: "Convert",
  },
  {
    Icon: ShoppingBag,
    name: "AI Storefront Setup",
    desc: "Drops a complete shop — products, descriptions, pricing, bundles — in one move.",
    tag: "Store",
  },
  {
    Icon: Target,
    name: "AI Audience Optimization",
    desc: "Routes fans to the right offer based on intent, geo and lifetime value.",
    tag: "Routing",
  },
];

function ToolsGrid() {
  return (
    <section>
      <SectionTitle kicker="The toolkit" title="Seven AI agents. One creator OS." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((t, i) => (
          <motion.div
            key={t.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -6 }}
            className="relative glass rounded-3xl p-6 group overflow-hidden"
          >
            <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-iridescent opacity-0 group-hover:opacity-30 blur-3xl transition-opacity duration-500" />
            <div className="relative flex items-start justify-between">
              <div className="w-11 h-11 rounded-2xl bg-iridescent shadow-glow-sm flex items-center justify-center">
                <t.Icon className="w-5 h-5 text-background" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {t.tag}
              </span>
            </div>
            <div className="mt-5 font-display text-xl font-semibold tracking-tight">{t.name}</div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t.desc}</p>
            <div className="mt-5 flex items-center gap-1.5 text-xs text-foreground/80">
              <span>Open agent</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- WORKFLOW ----------------------------- */
function Workflow() {
  const steps = [
    { t: "Describe", d: "One sentence about your creator world." },
    { t: "Compose", d: "AI drafts brand, voice, layout and offers." },
    { t: "Refine", d: "Tap to remix any section. Lock the parts you love." },
    { t: "Ship", d: "Publish to a custom domain — instant, cinematic." },
  ];
  return (
    <section>
      <SectionTitle kicker="The workflow" title="Four moves from idea to empire." />
      <div className="grid lg:grid-cols-4 gap-4 relative">
        <div className="hidden lg:block absolute top-7 left-[8%] right-[8%] h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
        {steps.map((s, i) => (
          <motion.div
            key={s.t}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass rounded-3xl p-6 relative"
          >
            <div className="w-14 h-14 rounded-2xl bg-iridescent shadow-glow-sm flex items-center justify-center font-display text-xl font-semibold text-background">
              0{i + 1}
            </div>
            <div className="mt-5 font-display text-lg font-semibold">{s.t}</div>
            <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- LIVE PREVIEW ----------------------------- */
const VARIANTS = [
  {
    name: "Editorial Noir",
    palette: ["#0b0b0f", "#e8e6df", "#bfa37a"],
    copy: "Slow luxury. Quiet rituals.",
  },
  {
    name: "Chrome Dream",
    palette: ["#0a0e1a", "#9ec5ff", "#ffffff"],
    copy: "Future-forward. Liquid metal aesthetics.",
  },
  {
    name: "Aurora Pulse",
    palette: ["#120824", "#ff7ad9", "#7af0ff"],
    copy: "Night-bright. Made for the front row.",
  },
];

function LivePreviews() {
  const [idx, setIdx] = useState(0);
  const v = VARIANTS[idx];

  return (
    <section>
      <SectionTitle kicker="Watch it think" title="Three brands. Three seconds. Same prompt." />
      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="glass rounded-3xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-iridescent" />
              <span className="text-sm font-medium">Live generation</span>
            </div>
            <div className="flex gap-1.5">
              {VARIANTS.map((vv, i) => (
                <button
                  key={vv.name}
                  onClick={() => setIdx(i)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${idx === i ? "bg-iridescent text-background shadow-glow-sm" : "glass text-muted-foreground"}`}
                >
                  {vv.name}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={v.name}
              initial={{ opacity: 0, y: 16, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl overflow-hidden relative h-[360px]"
              style={{
                background: `linear-gradient(135deg, ${v.palette[0]} 0%, ${v.palette[2]}22 100%)`,
              }}
            >
              <div className="absolute inset-0 grain" />
              <div
                className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-60"
                style={{ background: v.palette[1] }}
              />
              <div className="relative p-8 h-full flex flex-col justify-between">
                <div
                  className="text-[10px] uppercase tracking-[0.3em] opacity-60"
                  style={{ color: v.palette[2] }}
                >
                  {v.name}
                </div>
                <div>
                  <div
                    className="font-display text-4xl font-semibold tracking-tighter"
                    style={{ color: v.palette[2] }}
                  >
                    {v.copy}
                  </div>
                  <div className="mt-3 flex gap-2">
                    {v.palette.map((c) => (
                      <div
                        key={c}
                        className="w-7 h-7 rounded-full ring-1 ring-white/20"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <button
                    className="mt-5 px-5 py-2.5 rounded-full text-sm font-semibold"
                    style={{ background: v.palette[1], color: v.palette[0] }}
                  >
                    Join the world →
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="glass-strong rounded-3xl p-5 space-y-3">
          <div className="text-xs eyebrow">Prompt</div>
          <div className="field-luxury text-sm leading-relaxed">
            "A film photographer in Lisbon — quiet, slow, editorial. Wants a hub for prints, presets
            and a paid newsletter."
          </div>
          <div className="text-xs eyebrow pt-2">AI decisions</div>
          {[
            "Detected aesthetic: editorial luxe",
            "Selected pairing: Space Grotesk × Inter",
            "Composed 6 page sections",
            "Generated 4 product blurbs",
            "Optimized CTA for high-intent fans",
          ].map((s) => (
            <div key={s} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Check className="w-3.5 h-3.5 text-iridescent shrink-0 mt-0.5" />
              {s}
            </div>
          ))}
          <button className="btn-luxury w-full mt-2">Remix this brand</button>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- MODEL STACK ----------------------------- */
function ModelStack() {
  const layers = [
    { t: "Taste model", d: "Trained on 12M editorial references — knows luxury, knows restraint." },
    { t: "Voice model", d: "Mirrors your existing captions and DMs without copying them." },
    { t: "Conversion engine", d: "A/B tests every CTA, headline and price-point in real time." },
    { t: "Audience router", d: "Sends each fan to their highest-LTV destination automatically." },
  ];
  return (
    <section>
      <SectionTitle kicker="Under the hood" title="A stack engineered for taste." />
      <div className="grid md:grid-cols-2 gap-4">
        {layers.map((l, i) => (
          <motion.div
            key={l.t}
            initial={{ opacity: 0, x: i % 2 ? 30 : -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="glass rounded-3xl p-6 flex gap-5 items-start"
          >
            <div className="w-12 h-12 rounded-2xl surface-chrome flex items-center justify-center shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display text-lg font-semibold">{l.t}</div>
              <p className="text-sm text-muted-foreground mt-1">{l.d}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- CTA ----------------------------- */
function CTA() {
  return (
    <section>
      <div className="relative glass-strong rounded-[36px] p-10 sm:p-16 text-center overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, oklch(0.7 0.2 280 / 0.5), transparent 60%)",
          }}
        />
        <p className="eyebrow">Private beta</p>
        <h2
          className="mt-3 font-display font-semibold tracking-tighter"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
        >
          Let the AI build your <span className="text-iridescent">first hour</span>.
        </h2>
        <p className="mt-4 text-muted-foreground max-w-md mx-auto">
          Skip the blank page. Get a complete creator business — generated, refined and ready to
          publish.
        </p>
        <div className="mt-8 flex justify-center gap-3 flex-wrap">
          <button className="btn-luxury">
            Request access <ArrowUpRight className="w-4 h-4" />
          </button>
          <Link to="/onboarding" className="btn-ghost">
            See the system
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- HELPERS ----------------------------- */
function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-10 text-center">
      <p className="eyebrow">{kicker}</p>
      <h2
        className="mt-2 font-display font-semibold tracking-tighter"
        style={{ fontSize: "clamp(2rem, 4.5vw, 3.25rem)" }}
      >
        {title}
      </h2>
    </div>
  );
}
