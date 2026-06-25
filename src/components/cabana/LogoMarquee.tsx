import { motion } from "framer-motion";

const logos = ["VOGUE", "COMPLEX", "HYPEBEAST", "BILLBOARD", "FORBES", "DAZED", "GQ", "WIRED"];

export function LogoMarquee() {
  return (
    <section className="relative py-16 overflow-hidden border-y border-border/40">
      <p className="text-center eyebrow mb-8 text-muted-foreground/70">As featured in</p>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        <motion.div
          className="flex gap-16 whitespace-nowrap"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        >
          {[...logos, ...logos, ...logos].map((l, i) => (
            <span
              key={i}
              className="font-display text-2xl sm:text-3xl font-semibold tracking-[0.3em] text-foreground/40 hover:text-foreground/80 transition-colors"
            >
              {l}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
