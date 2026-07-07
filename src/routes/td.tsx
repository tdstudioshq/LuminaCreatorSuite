import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { Check, ArrowUpRight, Sparkles, Globe, Mail, Crown, Phone } from "lucide-react";
import { SOCIAL_ICONS } from "@/components/social/social-icons";
import cabanaLogo from "@/assets/cabana-logo.webp";

export const Route = createFileRoute("/td")({
  component: TDProfile,
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "description", content: "Tyler D · TD Studios." }],
  }),
});

const PHONE = "9297528373";
const LINKS = [
  {
    id: "ig",
    title: "Instagram",
    sub: "@tdstudiosco",
    url: "https://instagram.com/tdstudiosco",
    icon: SOCIAL_ICONS.instagram,
    accent: "oklch(0.75 0.2 330)",
    featured: true,
  },
  {
    id: "web",
    title: "Website",
    sub: "tdstudiosny.com",
    url: "https://tdstudiosny.com",
    icon: Globe,
    accent: "oklch(0.85 0.14 60)",
    featured: true,
  },
  {
    id: "tg",
    title: "Telegram",
    sub: "929-752-8373",
    url: `https://t.me/+1${PHONE}`,
    icon: SOCIAL_ICONS.telegram,
    accent: "oklch(0.78 0.15 230)",
  },
  {
    id: "wa",
    title: "WhatsApp",
    sub: "929-752-8373",
    url: `https://wa.me/1${PHONE}`,
    icon: SOCIAL_ICONS.whatsapp,
    accent: "oklch(0.82 0.18 145)",
  },
  {
    id: "call",
    title: "Call",
    sub: "929-752-8373",
    url: `tel:+1${PHONE}`,
    icon: Phone,
    accent: "oklch(0.85 0.12 195)",
  },
  {
    id: "mail",
    title: "Email",
    sub: "tyler@tdstudiosny.com",
    url: "mailto:tyler@tdstudiosny.com",
    icon: Mail,
    accent: "oklch(0.78 0.18 20)",
  },
];

function TDProfile() {
  const [followed, setFollowed] = useState(false);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--gradient-iridescent)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.7 0.2 195), transparent 70%)" }}
        />
      </div>

      <div className="max-w-md mx-auto px-4 sm:px-6 pt-10 pb-32">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative rounded-[2rem] overflow-hidden aspect-[4/5] glass-strong shadow-luxury">
            <motion.img
              src="/td.jpg"
              alt="Tyler D"
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-display text-4xl font-semibold tracking-tighter leading-none">
                  Tyler D
                </h1>
                <motion.span
                  initial={{ scale: 0, rotate: -90, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ scale: 1.15, rotate: 8 }}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full cursor-pointer"
                  style={{ background: "oklch(0.6 0.2 250)" }}
                >
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </motion.span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">@tdstudiosco</p>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Globe className="w-3 h-3" /> TD Studios · NYC
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7 }}
            className="mt-4 grid grid-cols-[1fr_auto] gap-2"
          >
            <button
              onClick={() => setFollowed(!followed)}
              className={`btn-luxury !w-full !py-4 ${followed ? "!bg-none" : ""}`}
              style={
                followed
                  ? {
                      background: "oklch(1 0 0 / 0.06)",
                      color: "var(--foreground)",
                      border: "1px solid oklch(1 0 0 / 0.12)",
                      boxShadow: "none",
                    }
                  : {}
              }
            >
              {followed ? "Following" : "Follow Tyler"}
              {!followed && <Sparkles className="w-4 h-4" />}
            </button>
            <a
              href="mailto:tyler@tdstudiosny.com"
              className="btn-ghost !px-4 flex items-center justify-center"
            >
              <Mail className="w-4 h-4" />
            </a>
          </motion.div>
        </motion.section>

        <section className="mt-12">
          <div className="mb-5">
            <p className="eyebrow text-muted-foreground mb-1.5">CABANA</p>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Social Links</h2>
          </div>
          <div className="space-y-2.5">
            {LINKS.map((l, i) => {
              const Icon = l.icon;
              return (
                <motion.a
                  key={l.id}
                  href={l.url}
                  target={l.url.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  whileHover={{ x: 4 }}
                  className={`group relative block rounded-2xl p-4 overflow-hidden ${l.featured ? "glass-strong" : "glass"}`}
                >
                  {l.featured && (
                    <div
                      className="absolute inset-0 opacity-30 pointer-events-none"
                      style={{
                        background: `radial-gradient(circle at 0% 50%, ${l.accent}, transparent 60%)`,
                      }}
                    />
                  )}
                  <div className="relative flex items-center gap-4">
                    <div
                      className="w-11 h-11 rounded-xl glass-strong flex items-center justify-center shrink-0"
                      style={{ boxShadow: `0 0 24px -8px ${l.accent}` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: l.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm flex items-center gap-1.5">
                        {l.title}
                        {l.featured && <Crown className="w-3 h-3" style={{ color: l.accent }} />}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{l.sub}</p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:rotate-45 group-hover:text-foreground" />
                  </div>
                </motion.a>
              );
            })}
          </div>
        </section>

        <Link
          to="/"
          className="mt-8 mx-auto flex flex-col items-center justify-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <span>Powered by</span>
          <img src={cabanaLogo} alt="CABANA" className="h-[7.5rem] w-auto" />
        </Link>
      </div>
    </div>
  );
}
