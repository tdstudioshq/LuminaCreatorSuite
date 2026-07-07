import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { FaLock } from "react-icons/fa6";
import { SocialLinks } from "@/components/social/SocialLinks";
import type { SocialLink } from "@/components/social/social-types";

export const Route = createFileRoute("/thetejeda")({
  component: TheTejedaLinkBio,
  head: () => ({
    meta: [
      { title: "The Tejeda" },
      { name: "description", content: "The Tejeda — official links." },
      { property: "og:title", content: "The Tejeda" },
      { property: "og:image", content: "https://www.cabanagrp.com/dani/tejeda.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "The Tejeda" },
      { name: "twitter:image", content: "https://www.cabanagrp.com/dani/tejeda.jpg" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Ballet&family=Bebas+Neue&family=Cinzel:wght@500;600&display=swap",
      },
    ],
  }),
});

const SCRIPT_FONT = '"Ballet", "Snell Roundhand", "Apple Chancery", cursive';
const DISPLAY_FONT = '"Cinzel", "Times New Roman", serif';

const PROFILE_IMAGE = "/dani/tejeda.jpg";
const CARD_IMAGE = "/dani/tejeda.jpg";
const TELEGRAM_URL = "https://t.me/+dmdywm0hwY8zNWYx";

// The second Instagram (@the___gata) intentionally uses the `lock` platform so it
// renders a padlock instead of the Instagram glyph — a "locked / VIP" affordance.
const SOCIALS: SocialLink[] = [
  {
    platform: "instagram",
    url: "https://www.instagram.com/the____tejeda/",
    username: "@the____tejeda",
  },
  {
    platform: "lock",
    url: "https://www.instagram.com/the___gata/",
    username: "@the___gata",
  },
  { platform: "telegram", url: TELEGRAM_URL },
  { platform: "whatsapp", url: "https://wa.me/18494070991", username: "849-407-0991" },
];

function TheTejedaLinkBio() {
  const [avatarOk, setAvatarOk] = useState(true);

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center px-4 py-6 sm:py-10">
      {/* Background: gradient underlay always paints; the photo covers it once present.
          Positive z-indexes inside an isolated stacking context — a negative z-index
          here would paint BEHIND ancestor layout backgrounds and show as black. */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(1100px_600px_at_20%_-10%,oklch(0.45_0.12_300/0.55),transparent_60%),radial-gradient(900px_540px_at_90%_10%,oklch(0.5_0.1_230/0.4),transparent_55%),linear-gradient(180deg,oklch(0.2_0.04_290),oklch(0.1_0.02_270))]" />
      <div className="fixed inset-0 z-10">
        <img
          src={CARD_IMAGE}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-20 w-full max-w-md"
      >
        {/* Architectural glass: near-clear crystal (~98% transparent, minimal frost) so the
            photo reads through almost fully. Edge lighting assumes an upper-left light source —
            bright top/left edges, shaded bottom/right for thickness, inner perimeter highlight. */}
        <div
          className="relative flex min-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-[32px] border border-white/40 bg-white/[0.02] px-6 py-7 backdrop-blur-[3px] backdrop-saturate-[1.3] sm:min-h-[calc(100dvh-5rem)] md:px-10 md:py-10"
          style={{
            boxShadow: [
              "0 12px 44px rgba(0,0,0,0.18)",
              "inset 0 1px 0 rgba(255,255,255,0.35)",
              "inset 1px 0 0 rgba(255,255,255,0.22)",
              "inset 0 -1px 0 rgba(0,0,0,0.22)",
              "inset -1px 0 0 rgba(0,0,0,0.14)",
              "inset 0 0 0 1px rgba(255,255,255,0.06)",
              "inset 0 -14px 26px -18px rgba(0,0,0,0.14)",
            ].join(", "),
          }}
        >
          {/* Polished-glass reflections: diagonal sweep from the top-left light source,
              a small upper-right catch, and a very soft horizontal band at the bottom.
              All sit behind the content and never exceed 10% white. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[32px]"
            style={{
              background: [
                "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 30%, transparent 55%)",
                "radial-gradient(240px 160px at 88% 6%, rgba(255,255,255,0.08), transparent 70%)",
                "linear-gradient(to top, rgba(255,255,255,0.05), transparent 22%)",
              ].join(", "),
            }}
          />

          {/* Moving shine: a narrow bright band that sweeps diagonally across the glass. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-y-8 -left-1/2 w-1/2 rotate-[18deg] motion-safe:animate-[cardShine_5s_ease-in-out_infinite]"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.18) 45%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.18) 55%, transparent)",
              filter: "blur(6px)",
            }}
          />
          <style>{`@keyframes cardShine{0%{transform:translateX(0) rotate(18deg)}55%,100%{transform:translateX(320%) rotate(18deg)}}`}</style>

          <div className="relative flex flex-1 flex-col items-center gap-5 text-center text-white md:gap-6">
            {/* Profile picture */}
            <div className="relative h-28 w-28 overflow-hidden rounded-full border-[3px] border-white/80 shadow-2xl sm:h-36 sm:w-36">
              {avatarOk ? (
                <img
                  src={PROFILE_IMAGE}
                  alt="The Tejeda"
                  className="h-full w-full object-cover"
                  onError={() => setAvatarOk(false)}
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center bg-white/10 text-5xl"
                  style={{ fontFamily: SCRIPT_FONT }}
                >
                  T
                </div>
              )}
            </div>

            {/* Title & handle */}
            <div className="space-y-1">
              <div
                className="whitespace-nowrap text-3xl leading-tight tracking-wide sm:text-4xl md:text-5xl"
                style={{ fontFamily: SCRIPT_FONT }}
              >
                The Tejeda
              </div>
              <div
                className="text-sm uppercase tracking-[0.45em] text-white/85"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                @the____tejeda
              </div>
            </div>

            {/* Social icons */}
            <SocialLinks socials={SOCIALS} colored size="xl" className="gap-5 pt-2" />

            {/* Locked photo — blurred with a centered padlock that unlocks via Telegram */}
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Unlock exclusive content on Telegram"
              className="group relative block w-full flex-1 overflow-hidden rounded-3xl border-2 border-white/20 shadow-2xl"
            >
              <img
                src={CARD_IMAGE}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover object-center blur-xl"
              />
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-white/10 backdrop-blur-md transition-transform duration-200 group-hover:scale-110 group-active:scale-95">
                  <FaLock size={26} />
                </span>
                <span
                  className="text-xs uppercase tracking-[0.35em] text-white/90"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  Unlock on Telegram
                </span>
              </div>
            </a>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
