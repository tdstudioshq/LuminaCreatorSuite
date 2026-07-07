import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { SocialLinks } from "@/components/social/SocialLinks";
import type { SocialLink } from "@/components/social/social-types";

export const Route = createFileRoute("/danielasanchez")({
  component: DanielaLinkBio,
  head: () => ({
    meta: [
      { title: "Daniela Sánchez" },
      { name: "description", content: "Daniela Sánchez — official links." },
      { property: "og:title", content: "Daniela Sánchez" },
      { property: "og:image", content: "https://www.cabanagrp.com/dani/dani-social-share.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Daniela Sánchez" },
      { name: "twitter:image", content: "https://www.cabanagrp.com/dani/dani-social-share.jpg" },
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

const BG_IMAGE = "/dani/dbackground.jpg";
const PROFILE_IMAGE = "/dani/daniavipic.jpg";
// Fallback for the card while no slideshow images exist yet.
// (davi.jpg is currently a 150px thumbnail — replace it with the full-res photo to use it here.)
const CARD_IMAGE = "/dani/dbackground.jpg";

// Card slideshow: save photos into public/dani/ with these names and they
// join the rotation automatically. Missing/broken files are skipped.
const SLIDESHOW_IMAGES = [
  "/dani/dani-1.jpg",
  "/dani/dani-2.jpg",
  "/dani/dani-3.jpg",
  "/dani/dani-4.jpg",
  "/dani/dani-5.jpg",
];
const SLIDE_INTERVAL_MS = 2000;
// Slides smaller than this are excluded so the card never shows an upscaled blurry thumbnail.
const MIN_SLIDE_WIDTH = 600;

const SOCIALS: SocialLink[] = [
  { platform: "x", url: "https://x.com/DanielaSan8382" },
  { platform: "onlyfans", url: "https://onlyfans.com/danibustamantesanchez" },
  {
    platform: "instagram",
    url: "https://www.instagram.com/danielasanchezx0/",
    username: "@danielasanchezx0",
  },
];

function DanielaLinkBio() {
  const [avatarOk, setAvatarOk] = useState(true);

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center px-4 py-6 sm:py-10">
      {/* Background: gradient underlay always paints; the photo covers it once present.
          Positive z-indexes inside an isolated stacking context — a negative z-index
          here would paint BEHIND ancestor layout backgrounds and show as black. */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(1100px_600px_at_20%_-10%,oklch(0.45_0.12_300/0.55),transparent_60%),radial-gradient(900px_540px_at_90%_10%,oklch(0.5_0.1_230/0.4),transparent_55%),linear-gradient(180deg,oklch(0.2_0.04_290),oklch(0.1_0.02_270))]" />
      <div className="fixed inset-0 z-10">
        <img
          src={BG_IMAGE}
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
                  alt="Daniela Sánchez"
                  className="h-full w-full object-cover"
                  onError={() => setAvatarOk(false)}
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center bg-white/10 text-5xl"
                  style={{ fontFamily: SCRIPT_FONT }}
                >
                  D
                </div>
              )}
            </div>

            {/* Title & handle */}
            <div className="space-y-1">
              <div
                className="whitespace-nowrap text-3xl leading-tight tracking-wide sm:text-4xl md:text-5xl"
                style={{ fontFamily: SCRIPT_FONT }}
              >
                Daniela Sánchez
              </div>
              <div
                className="text-sm uppercase tracking-[0.45em] text-white/85"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                @danielasanchezx0
              </div>
            </div>

            {/* Social icons */}
            <SocialLinks socials={SOCIALS} colored size="xl" className="gap-5 pt-2" />

            {/* Photo slideshow — flexes to fill whatever viewport height remains */}
            <div className="relative w-full flex-1 overflow-hidden rounded-3xl border-2 border-white/20 shadow-2xl">
              <CardSlideshow />
            </div>
          </div>
        </div>
      </motion.div>
    </main>
  );
}

function CardSlideshow() {
  const [status, setStatus] = useState<Readonly<Record<string, "ok" | "bad">>>({});
  const [tick, setTick] = useState(0);

  // Probe every candidate up front (works for cached images too, unlike an
  // onLoad prop, which can miss images the browser already has). A slide only
  // enters the rotation when it exists AND is at least MIN_SLIDE_WIDTH wide,
  // so an upscaled blurry thumbnail is never shown.
  useEffect(() => {
    let cancelled = false;
    SLIDESHOW_IMAGES.forEach((src) => {
      const probe = new Image();
      probe.onload = () => {
        if (!cancelled) {
          const ok = probe.naturalWidth >= MIN_SLIDE_WIDTH;
          setStatus((prev) => ({ ...prev, [src]: ok ? "ok" : "bad" }));
        }
      };
      probe.onerror = () => {
        if (!cancelled) setStatus((prev) => ({ ...prev, [src]: "bad" }));
      };
      probe.src = src;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const available = SLIDESHOW_IMAGES.filter((src) => status[src] === "ok");
  const slides = available.length > 0 ? available : [CARD_IMAGE];
  const active = tick % slides.length;

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setTick((t) => t + 1), SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <>
      {slides.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === active ? "Daniela Sánchez" : ""}
          aria-hidden={i !== active}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ease-in-out ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </>
  );
}
