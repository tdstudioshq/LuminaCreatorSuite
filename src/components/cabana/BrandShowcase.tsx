import { motion } from "framer-motion";
import orb from "@/assets/chrome-orb.jpg";

export function BrandShowcase() {
  return (
    <section id="showcase" className="relative py-32 px-4 sm:px-6 overflow-hidden">
      <motion.img
        src={orb}
        alt=""
        aria-hidden
        loading="lazy"
        width={1024}
        height={1024}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] opacity-30 mix-blend-screen blur-md pointer-events-none"
        animate={{ rotate: -360, scale: [1, 1.1, 1] }}
        transition={{
          rotate: { duration: 120, repeat: Infinity, ease: "linear" },
          scale: { duration: 12, repeat: Infinity },
        }}
      />

      <div className="relative max-w-5xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-5xl sm:text-7xl font-semibold tracking-tighter leading-[0.95]"
        >
          Built like a <br />
          <span className="text-iridescent italic font-light">flagship store.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-8 text-lg text-muted-foreground max-w-xl mx-auto"
        >
          Every interaction tuned for taste. Every pixel earning its place. CABANA is the difference
          between a link page and a brand.
        </motion.p>

        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { k: "98", l: "Lighthouse" },
            { k: "0.8s", l: "Time to Interactive" },
            { k: "3.4×", l: "Avg conversion lift" },
            { k: "24/7", l: "Concierge support" },
          ].map((s, i) => (
            <motion.div
              key={s.l}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass rounded-2xl p-6"
            >
              <div className="text-3xl sm:text-4xl font-display font-semibold text-chrome">
                {s.k}
              </div>
              <div className="text-xs text-muted-foreground mt-2 uppercase tracking-wider">
                {s.l}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
