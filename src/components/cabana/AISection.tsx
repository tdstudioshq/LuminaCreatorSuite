import { motion } from "framer-motion";
import { Sparkles, Wand2 } from "lucide-react";

const prompts = [
  {
    tag: "Bio",
    text: "Brooklyn-born vocalist blending late-night R&B with cinematic electronics.",
  },
  { tag: "CTA", text: "Get the unreleased single — 24h only." },
  { tag: "Theme", text: "Iridescent chrome on noir, brutalist serif, 8pt grid." },
  { tag: "Landing", text: "Drop announcement page with countdown + waitlist." },
];

export function AISection() {
  return (
    <section className="relative py-32 px-4 sm:px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="relative order-2 lg:order-1"
        >
          <div
            className="absolute -inset-10 opacity-30 blur-3xl rounded-full"
            style={{ background: "var(--gradient-iridescent)" }}
          />
          <div className="relative glass-strong rounded-3xl p-6 shadow-luxury">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-xl bg-iridescent flex items-center justify-center">
                <Wand2 className="w-4 h-4 text-background" />
              </div>
              <div>
                <p className="font-display font-semibold text-sm">CABANA Studio</p>
                <p className="text-[10px] text-muted-foreground">Generating your kit…</p>
              </div>
              <span className="ml-auto text-[10px] glass rounded-full px-2 py-1 flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse-glow"
                  style={{ background: "oklch(0.85 0.15 165)" }}
                />
                Live
              </span>
            </div>

            <div className="space-y-3">
              {prompts.map((p, i) => (
                <motion.div
                  key={p.tag}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.15 }}
                  className="glass rounded-2xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md glass-strong shrink-0 mt-0.5">
                      {p.tag}
                    </span>
                    <p className="text-sm leading-relaxed">{p.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-5 glass rounded-2xl p-3 flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground flex-1 truncate">
                Describe a vibe, drop a reference, paste a song…
              </p>
              <button className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-foreground text-background">
                Generate
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="order-1 lg:order-2"
        >
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground mb-4">
            CABANA Studio
          </p>
          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tighter leading-[1]">
            AI that <span className="text-iridescent italic font-light">writes,</span> designs{" "}
            <br />
            and ships with you.
          </h2>
          <p className="mt-6 text-muted-foreground text-lg max-w-md">
            Generate bios, landing pages, CTAs, themes, even full storefronts — tuned to your voice,
            never to a template.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 max-w-sm">
            {["Bios", "CTA copy", "Page layouts", "Brand themes"].map((t) => (
              <div key={t} className="glass rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" style={{ color: "oklch(0.85 0.15 280)" }} />
                {t}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
