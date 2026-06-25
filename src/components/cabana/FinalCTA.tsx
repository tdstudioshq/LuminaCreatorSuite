import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import orb from "@/assets/chrome-orb.jpg";

export function FinalCTA() {
  return (
    <section className="relative py-32 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="relative rounded-[2.5rem] overflow-hidden glass-strong shadow-luxury p-10 sm:p-20 text-center"
        >
          <motion.img
            src={orb}
            alt=""
            aria-hidden
            loading="lazy"
            width={1024}
            height={1024}
            className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, 0] }}
            transition={{ duration: 20, repeat: Infinity }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/30 to-background/80" />

          <div className="relative">
            <h2 className="text-4xl sm:text-7xl font-semibold tracking-tighter leading-[0.95]">
              Your empire <br />
              <span className="text-iridescent italic font-light">starts tonight.</span>
            </h2>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
              Join the private beta and get a hand-built CABANA before public launch.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <button className="group inline-flex items-center gap-2 bg-foreground text-background px-7 py-4 rounded-2xl text-sm font-medium hover:scale-[1.02] transition-transform shadow-glow">
                Request invitation
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:rotate-45" />
              </button>
              <button className="glass px-7 py-4 rounded-2xl text-sm font-medium hover:bg-white/5 transition-colors">
                Talk to founders
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
