import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useRef } from "react";
import hero from "@/assets/hero-creator.jpg";

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yMockup = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const opacityMockup = useTransform(scrollYProgress, [0, 0.7], [1, 0.4]);
  const yHeadline = useTransform(scrollYProgress, [0, 1], [0, -60]);

  return (
    <section ref={ref} className="relative pt-40 pb-32 px-4 sm:px-6 overflow-hidden">
      {/* Floating gradient orbs */}
      <motion.div
        aria-hidden
        className="absolute -top-32 -right-40 w-[640px] h-[640px] rounded-full pointer-events-none animate-float"
        style={{ background: "var(--gradient-iridescent)", filter: "blur(140px)", opacity: 0.3 }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full pointer-events-none animate-float"
        style={{
          background: "radial-gradient(circle, oklch(0.7 0.2 195 / 0.7), transparent 70%)",
          filter: "blur(120px)",
          opacity: 0.45,
          animationDelay: "2.5s",
        }}
      />

      <div className="relative max-w-6xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="inline-flex items-center gap-2 glass rounded-full pl-2 pr-4 py-1.5 text-xs"
        >
          <span className="px-2 py-0.5 rounded-full bg-iridescent text-background text-[10px] font-semibold tracking-wider">
            NEW
          </span>
          <span className="text-muted-foreground">Private beta · invitation only</span>
          <Sparkles className="w-3.5 h-3.5 text-iridescent" />
        </motion.div>

        <motion.h1
          style={{ y: yHeadline, fontSize: "clamp(2.75rem, 8.5vw, 7rem)" }}
          initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 font-display font-semibold leading-[0.92] tracking-tighter"
        >
          The operating system <br />
          for <span className="text-iridescent italic font-light">modern creators.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="mt-7 text-base sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed"
        >
          Landing pages, storefronts, media kits and fan funnels — engineered into one cinematic,
          mobile-first hub. No templates. No compromises.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <button className="btn-luxury !px-6 !py-3.5 text-sm">
            Claim your CABANA
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:rotate-45" />
          </button>
        </motion.div>

        {/* Hero mockup */}
        <motion.div
          style={{ y: yMockup, opacity: opacityMockup }}
          initial={{ opacity: 0, y: 80, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mt-20 relative mx-auto max-w-sm will-change-transform"
        >
          <div className="absolute -inset-10 bg-iridescent opacity-40 blur-3xl rounded-full animate-pulse-glow" />
          <div className="relative rounded-[2.5rem] p-2 glass-strong shadow-luxury">
            <div className="rounded-[2rem] overflow-hidden aspect-[9/19] relative">
              <img src={hero} alt="Creator preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full glass-strong">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-medium">Live</span>
                </div>
                <div className="px-2.5 py-1 rounded-full glass-strong text-[10px] font-medium">
                  @aurora.fm
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2.5">
                {["Latest drop — 'Nocturne'", "Book a session", "Shop the look"].map((label, i) => (
                  <motion.div
                    key={label}
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 1.1 + i * 0.12 }}
                    className="glass rounded-2xl px-4 py-3 text-sm font-medium flex items-center justify-between"
                  >
                    {label}
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Floating side cards */}
          <motion.div
            initial={{ opacity: 0, x: -30, rotate: -8 }}
            animate={{ opacity: 1, x: 0, rotate: -8 }}
            transition={{ delay: 1.4, duration: 0.9 }}
            className="hidden lg:block absolute -left-32 top-20 glass-strong rounded-2xl p-4 w-44 shadow-luxury"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              This month
            </div>
            <div className="font-display text-2xl font-semibold mt-1">$48,210</div>
            <div className="text-[10px] text-emerald-400 mt-0.5">+18.6% MoM</div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 30, rotate: 6 }}
            animate={{ opacity: 1, x: 0, rotate: 6 }}
            transition={{ delay: 1.55, duration: 0.9 }}
            className="hidden lg:block absolute -right-28 top-40 glass-strong rounded-2xl p-4 w-44 shadow-luxury"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-iridescent flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-background" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  AI agent
                </div>
                <div className="text-xs font-semibold">Drafting bio…</div>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <div className="h-1.5 rounded-full bg-iridescent w-3/4" />
              <div className="h-1.5 rounded-full bg-foreground/15 w-full" />
              <div className="h-1.5 rounded-full bg-foreground/15 w-2/3" />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
