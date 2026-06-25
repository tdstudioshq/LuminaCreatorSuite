import { motion } from "framer-motion";
import { Heart, Music, Dumbbell, Camera, Briefcase } from "lucide-react";
import influencer from "@/assets/creator-influencer.jpg";
import model from "@/assets/creator-model.jpg";
import musician from "@/assets/creator-musician.jpg";
import fitness from "@/assets/creator-fitness.jpg";

const creators = [
  {
    name: "Aurora",
    handle: "@aurora.fm",
    role: "Influencer",
    icon: Heart,
    img: influencer,
    color: "oklch(0.75 0.2 330)",
    followers: "2.1M",
  },
  {
    name: "Lior",
    handle: "@liorsound",
    role: "Musician",
    icon: Music,
    img: musician,
    color: "oklch(0.75 0.18 250)",
    followers: "840K",
  },
  {
    name: "Naya",
    handle: "@nayafit",
    role: "Fitness",
    icon: Dumbbell,
    img: fitness,
    color: "oklch(0.78 0.18 60)",
    followers: "612K",
  },
  {
    name: "Mira",
    handle: "@mira.studio",
    role: "Model",
    icon: Camera,
    img: model,
    color: "oklch(0.85 0.12 195)",
    followers: "1.4M",
  },
  {
    name: "OBSIDIAN",
    handle: "@obsidian.agency",
    role: "Agency",
    icon: Briefcase,
    img: influencer,
    color: "oklch(0.78 0.15 280)",
    followers: "Roster: 24",
  },
];

export function CreatorShowcase() {
  return (
    <section className="relative py-32 px-4 sm:px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground mb-4">
            The roster
          </p>
          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tighter leading-[1]">
            Trusted by <span className="text-iridescent italic font-light">tastemakers.</span>
          </h2>
          <p className="mt-6 text-muted-foreground">
            From rising voices to global agencies — every CABANA is unmistakably theirs.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {creators.map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -8 }}
              className={`group relative rounded-3xl overflow-hidden aspect-[3/4] glass-strong cursor-pointer ${i % 2 === 1 ? "md:translate-y-8" : ""}`}
            >
              <img
                src={c.img}
                alt={c.name}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

              <div className="absolute top-3 left-3 glass rounded-full px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-medium">
                <c.icon className="w-3 h-3" style={{ color: c.color }} />
                {c.role}
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="font-display text-xl font-semibold leading-tight">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.handle}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {c.followers}
                  </span>
                  <span className="text-[10px] glass rounded-full px-2 py-0.5">View</span>
                </div>
              </div>

              <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl pointer-events-none" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
