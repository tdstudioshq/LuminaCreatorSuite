import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { SocialIcon } from "@/components/social/SocialIcon";
import type { SocialPlatform } from "@/components/social/social-types";
import portrait from "@/assets/eldondolla-portrait.png";
import logo from "@/assets/eldondolla-logo.png";

export const Route = createFileRoute("/eldondolla")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "description", content: "El Don Dolla — Only Kings Club. Powered by TD Studios." },
      { property: "og:title", content: "CABANA" },
      { property: "og:description", content: "El Don Dolla — Only Kings Club." },
    ],
  }),
  component: ElDonDollaPage,
});

const GOLD = "#d4af37";
const GOLD_LIGHT = "#f5d97a";
const GOLD_DEEP = "#8a6a17";

// Brand accents matching this page's original art direction; glyphs come from
// the shared social icon registry (@/components/social).
const SOCIAL_COLORS: Partial<Record<SocialPlatform, string>> = {
  tiktok: "#ffffff",
  instagram: "#E4405F",
  x: "#ffffff",
  facebook: "#1877f2",
};

type Social = { key: SocialPlatform; href: string; label: string };
const socials: Social[] = [
  { key: "tiktok", href: "https://tiktok.com/@eldondolla", label: "TIKTOK" },
  { key: "instagram", href: "https://instagram.com/eldondolla", label: "INSTAGRAM" },
  { key: "x", href: "https://x.com/eldondolla", label: "X / TWITTER" },
  { key: "facebook", href: "https://facebook.com/eldondolla", label: "FACEBOOK" },
];

function GoldPill({
  children,
  href,
  label,
}: {
  children: React.ReactNode;
  href: string;
  label: string;
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
      className="relative flex items-center w-full max-w-sm rounded-full py-3.5 px-5"
      style={{
        background: "linear-gradient(180deg, #1a1a1a 0%, #050505 100%)",
        border: `2px solid ${GOLD}`,
        boxShadow: `0 8px 30px -10px ${GOLD}90, inset 0 1px 0 rgba(255,255,255,.08)`,
      }}
    >
      <span className="flex items-center justify-center w-10 h-10 shrink-0">{children}</span>
      <span
        className="flex-1 text-center font-black tracking-[0.18em] text-sm -ml-10"
        style={{
          background: `linear-gradient(180deg, ${GOLD_LIGHT}, ${GOLD} 60%, ${GOLD_DEEP})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {label}
      </span>
    </motion.a>
  );
}

function ElDonDollaPage() {
  return (
    <div
      className="relative min-h-screen w-full overflow-hidden text-white"
      style={{ background: "#0a0700" }}
    >
      {/* Luxury black & gold marble texture */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {/* Warm base: black with bronze/gold underglow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 60% at 50% 0%, #5c4310 0%, #1a1200 35%, #050300 70%, #000 100%)," +
              "radial-gradient(ellipse 100% 70% at 50% 100%, #4a3508 0%, #120c00 40%, transparent 70%)",
          }}
        />
        {/* Large gold marble veins (inline SVG for guaranteed rendering) */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 800 1400"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="goldVein" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f8e9a8" />
              <stop offset="0.5" stopColor="#d4af37" />
              <stop offset="1" stopColor="#7a5a10" />
            </linearGradient>
            <linearGradient id="goldVein2" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#fff2c2" />
              <stop offset="0.5" stopColor="#e8c25a" />
              <stop offset="1" stopColor="#8a6a17" />
            </linearGradient>
            <filter id="wobble">
              <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="9" />
              <feDisplacementMap in="SourceGraphic" scale="80" />
            </filter>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Bold primary veins */}
          <g filter="url(#wobble)" opacity="0.85">
            <path
              d="M-50,200 C150,120 320,360 500,260 C680,160 780,340 900,280"
              stroke="url(#goldVein)"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M-50,520 C120,640 380,420 560,560 C720,680 820,500 900,600"
              stroke="url(#goldVein2)"
              strokeWidth="2.5"
              fill="none"
            />
            <path
              d="M-50,860 C180,760 340,980 540,880 C720,790 820,1000 900,920"
              stroke="url(#goldVein)"
              strokeWidth="3.2"
              fill="none"
            />
            <path
              d="M-50,1180 C200,1080 420,1280 620,1160 C780,1080 850,1220 900,1200"
              stroke="url(#goldVein2)"
              strokeWidth="2.8"
              fill="none"
            />
          </g>

          {/* Vertical streaks */}
          <g filter="url(#wobble)" opacity="0.6">
            <path
              d="M180,-50 C220,300 140,600 260,900 C360,1150 240,1300 320,1450"
              stroke="url(#goldVein)"
              strokeWidth="1.6"
              fill="none"
            />
            <path
              d="M560,-50 C620,250 500,540 660,820 C780,1050 660,1240 720,1450"
              stroke="url(#goldVein2)"
              strokeWidth="1.4"
              fill="none"
            />
          </g>

          {/* Fine filigree */}
          <g filter="url(#wobble)" opacity="0.45">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <path
                key={i}
                d={`M-50,${100 + i * 180} L900,${130 + i * 180}`}
                stroke="url(#goldVein)"
                strokeWidth="0.8"
                fill="none"
              />
            ))}
          </g>

          {/* Glowing gold pools */}
          <g filter="url(#glow)" opacity="0.5">
            <circle cx="120" cy="180" r="60" fill="#d4af37" opacity="0.35" />
            <circle cx="680" cy="420" r="80" fill="#f5d97a" opacity="0.3" />
            <circle cx="200" cy="900" r="70" fill="#d4af37" opacity="0.3" />
            <circle cx="640" cy="1180" r="90" fill="#e8c25a" opacity="0.28" />
          </g>
        </svg>

        {/* Top & bottom gold glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 30% at 50% 0%, rgba(245,217,122,0.45), transparent 70%)," +
              "radial-gradient(ellipse 70% 35% at 50% 100%, rgba(184,134,11,0.4), transparent 70%)",
          }}
        />

        {/* Gold dust sparkle */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(1.2px 1.2px at 12% 18%, rgba(245,217,122,1), transparent)," +
              "radial-gradient(1px 1px at 78% 24%, rgba(255,240,200,.8), transparent)," +
              "radial-gradient(1.5px 1.5px at 32% 70%, rgba(245,217,122,.9), transparent)," +
              "radial-gradient(1px 1px at 88% 62%, rgba(255,240,200,.7), transparent)," +
              "radial-gradient(1.3px 1.3px at 55% 88%, rgba(245,217,122,.85), transparent)," +
              "radial-gradient(1px 1px at 8% 92%, rgba(255,240,200,.6), transparent)," +
              "radial-gradient(1.5px 1.5px at 64% 12%, rgba(245,217,122,.7), transparent)",
            backgroundSize: "380px 380px",
          }}
        />

        {/* Film grain */}
        <div
          className="absolute inset-0 opacity-[0.1] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
          }}
        />

        {/* Edge vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: "inset 0 0 260px 60px #000" }}
        />
      </div>

      <div className="mx-auto max-w-md px-5 pt-10 pb-16 flex flex-col items-center">
        {/* Portrait in gold ring */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
          style={{ width: 260, height: 260 }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 200deg, ${GOLD_DEEP}, ${GOLD_LIGHT} 25%, ${GOLD} 50%, ${GOLD_DEEP} 75%, ${GOLD_LIGHT})`,
              padding: 8,
              boxShadow: `0 0 60px ${GOLD}55, 0 0 120px ${GOLD}33`,
            }}
          >
            <div
              className="w-full h-full rounded-full overflow-hidden"
              style={{ background: "#000" }}
            >
              <img src={portrait} alt="El Don Dolla" className="w-full h-full object-cover" />
            </div>
          </div>
        </motion.div>

        {/* Logo */}
        <motion.img
          src={logo}
          alt="EL DON DOLLA"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="mt-8 w-full max-w-[22rem] h-auto"
          style={{
            filter: `drop-shadow(0 6px 18px ${GOLD}55) drop-shadow(0 0 30px rgba(212,175,55,0.25))`,
          }}
        />

        {/* Social pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="mt-8 w-full flex flex-col items-center gap-3"
        >
          {socials.map((s) => (
            <GoldPill key={s.key} href={s.href} label={s.label}>
              <SocialIcon
                platform={s.key}
                size={26}
                style={{ color: SOCIAL_COLORS[s.key] ?? "#ffffff" }}
              />
            </GoldPill>
          ))}
        </motion.div>

        {/* OnlyKingsClub */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.7 }}
          className="mt-8 text-center"
        >
          <div className="font-black tracking-tight text-2xl">
            <span style={{ color: "#fff" }}>ⓞNLY</span>
            <span style={{ color: GOLD }}>KINGS</span>
            <span style={{ color: "#fff" }}>CLUB</span>
          </div>
        </motion.div>

        {/* Powered by */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.7 }}
          className="mt-8 text-center"
        >
          <p className="text-[11px] tracking-[0.35em] font-bold" style={{ color: GOLD }}>
            POWERED BY
          </p>
          <p
            className="mt-1 font-black tracking-tight text-2xl"
            style={{
              background: `linear-gradient(180deg, ${GOLD_LIGHT}, ${GOLD} 50%, ${GOLD_DEEP})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            TD STUDIOS
          </p>
        </motion.div>
      </div>
    </div>
  );
}
