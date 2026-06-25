import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Camera,
  Music,
  Dumbbell,
  Briefcase,
  Users,
  Star,
  Instagram,
  Youtube,
  Twitter,
  Wand2,
  Globe,
  Loader2,
  Upload,
} from "lucide-react";
import { useCabana, useCabanaMutations, type CabanaTheme } from "@/lib/cabana-store";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "description", content: "Build your creator empire in minutes." },
      { property: "og:title", content: "CABANA" },
      { property: "og:description", content: "Premium creator setup, powered by AI." },
    ],
  }),
  component: OnboardingPage,
});

const STEPS = ["Welcome", "Identity", "Theme", "Connect", "Define", "Generate", "Preview"];

const creatorTypes = [
  { id: "influencer", label: "Influencer", icon: Star, hint: "Lifestyle & content" },
  { id: "model", label: "Model", icon: Camera, hint: "Editorial & fashion" },
  { id: "musician", label: "Musician", icon: Music, hint: "Artists & DJs" },
  { id: "fitness", label: "Fitness", icon: Dumbbell, hint: "Coaches & athletes" },
  { id: "coach", label: "Coach", icon: Briefcase, hint: "Mentors & creators" },
  { id: "agency", label: "Agency", icon: Users, hint: "Teams & rosters" },
];

// Theme IDs intentionally match the stored CabanaTheme values so the selection
// persists to creator_profiles.theme and applies on the public page.
const themes: { id: CabanaTheme; label: string; swatch: string }[] = [
  {
    id: "iridescent",
    label: "Iridescent",
    swatch: "linear-gradient(135deg, #8be9ff, #c084fc, #f0abfc, #fde68a)",
  },
  {
    id: "midnight",
    label: "Midnight",
    swatch: "linear-gradient(135deg, #0f172a, #312e81, #0f172a)",
  },
  {
    id: "rose",
    label: "Rose Gold",
    swatch: "linear-gradient(135deg, #fda4af, #fcd34d, #f9a8d4)",
  },
  { id: "chrome", label: "Chrome", swatch: "linear-gradient(135deg, #e5e7eb, #94a3b8, #e5e7eb)" },
];

const socials = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "oklch(0.7 0.2 350)" },
  { id: "tiktok", label: "TikTok", icon: Music, color: "oklch(0.85 0.15 195)" },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "oklch(0.65 0.22 25)" },
  { id: "x", label: "X", icon: Twitter, color: "oklch(0.95 0 0)" },
  { id: "spotify", label: "Spotify", icon: Music, color: "oklch(0.78 0.18 145)" },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const { profile } = useCabana();
  const m = useCabanaMutations();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<string>("");
  const [theme, setTheme] = useState<CabanaTheme>("iridescent");
  const [connected, setConnected] = useState<string[]>([]);
  const [niche, setNiche] = useState("");
  const [style, setStyle] = useState("");
  const [audience, setAudience] = useState("");
  const [goals, setGoals] = useState("");
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  const next = () => {
    if (step === 4) {
      setStep(5);
      setGenerating(true);
      setTimeout(() => {
        setGenerating(false);
        setGenerated(true);
      }, 2200);
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const toggleSocial = (id: string) =>
    setConnected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const canAdvance =
    step === 0 ||
    (step === 1 && !!type) ||
    (step === 2 && !!theme) ||
    step === 3 ||
    (step === 4 && niche.length > 1) ||
    (step === 5 && generated) ||
    step === 6;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Floating gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-20 w-[500px] h-[500px] rounded-full opacity-40 blur-3xl animate-float"
          style={{ background: "var(--gradient-iridescent)" }}
        />
        <div
          className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full opacity-30 blur-3xl animate-float"
          style={{
            background: "radial-gradient(circle, oklch(0.7 0.2 330), transparent 70%)",
            animationDelay: "2s",
          }}
        />
        <div
          className="absolute -bottom-40 left-1/4 w-[450px] h-[450px] rounded-full opacity-25 blur-3xl animate-float"
          style={{
            background: "radial-gradient(circle, oklch(0.7 0.2 195), transparent 70%)",
            animationDelay: "4s",
          }}
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 py-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-iridescent shadow-glow" />
            <span className="font-display font-semibold tracking-tight">CABANA</span>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            Step {step + 1} <span className="opacity-50">/ {STEPS.length}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mb-12">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full overflow-hidden bg-foreground/10">
              <motion.div
                initial={false}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="h-full bg-iridescent"
              />
            </div>
          ))}
        </div>

        {/* Step body */}
        <div className="flex-1 flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -20, filter: "blur(8px)" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1"
            >
              {step === 0 && <Welcome />}
              {step === 1 && <CreatorType value={type} onChange={setType} />}
              {step === 2 && <ThemePicker value={theme} onChange={setTheme} />}
              {step === 3 && <SocialConnect connected={connected} toggle={toggleSocial} />}
              {step === 4 && (
                <AISetup
                  niche={niche}
                  setNiche={setNiche}
                  style={style}
                  setStyle={setStyle}
                  audience={audience}
                  setAudience={setAudience}
                  goals={goals}
                  setGoals={setGoals}
                />
              )}
              {step === 5 && (
                <Generating
                  done={generated}
                  loading={generating}
                  niche={niche || "creator"}
                  type={type}
                />
              )}
              {step === 6 && <FinalPreview type={type} theme={theme} niche={niche} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 pt-10 mt-6">
          <button
            onClick={back}
            disabled={step === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              disabled={!canAdvance}
              className="group flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background font-medium text-sm shadow-glow disabled:opacity-40 disabled:shadow-none transition-all hover:scale-[1.02]"
            >
              {step === 4
                ? "Generate with AI"
                : step === 5
                  ? generated
                    ? "See preview"
                    : "Generating…"
                  : "Continue"}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : (
            <button
              onClick={() => {
                // Persist the one onboarding choice with a real backing column.
                if (profile) m.setProfile({ theme });
                navigate({ to: "/dashboard" });
              }}
              className="group flex items-center gap-2 px-6 py-3 rounded-full bg-iridescent text-background font-semibold text-sm shadow-glow transition-all hover:scale-[1.02]"
            >
              Enter CABANA{" "}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- STEP COMPONENTS ---------------- */

function AvatarUpload() {
  const { profile } = useCabana();
  const m = useCabanaMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    if (f.size > 5 * 1024 * 1024) return;
    setBusy(true);
    await m.uploadAvatar(f);
    setBusy(false);
  };

  const avatar = profile?.avatar;

  return (
    <div className="mb-8 flex items-center gap-5 glass rounded-3xl p-5">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="relative shrink-0 group"
        aria-label="Upload profile photo"
      >
        <div className="w-20 h-20 rounded-full p-[2px] bg-iridescent">
          {avatar ? (
            <img
              src={avatar}
              alt="Your avatar"
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
              <Camera className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full glass-strong flex items-center justify-center group-hover:scale-110 transition-transform">
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
        </div>
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Profile photo</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          This is the picture on your link page. PNG or JPG, up to 5MB.
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-2 text-[11px] uppercase tracking-[0.2em] text-foreground/80 hover:text-foreground transition-colors"
        >
          {avatar ? "Replace photo" : "Upload photo"}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? undefined)}
      />
    </div>
  );
}

function Welcome() {
  return (
    <div className="text-center pt-8 sm:pt-16">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex items-center gap-2 glass rounded-full px-3 py-1.5 mb-8"
      >
        <Sparkles
          className="w-3.5 h-3.5 text-iridescent"
          style={{ color: "oklch(0.78 0.18 280)" }}
        />
        <span className="text-xs uppercase tracking-[0.3em]">Welcome</span>
      </motion.div>
      <h1 className="text-5xl sm:text-7xl font-semibold tracking-tighter leading-[0.95]">
        Build your <br />
        <span className="text-iridescent italic font-light">creator empire.</span>
      </h1>
      <p className="mt-6 text-muted-foreground max-w-md mx-auto leading-relaxed">
        A few quiet questions. Your brand, storefront and landing page — crafted by AI, signed by
        you.
      </p>
      <div className="relative mt-12 mx-auto w-64 h-64">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full opacity-40 blur-2xl bg-iridescent"
        />
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute inset-8 rounded-full bg-iridescent shadow-glow"
        />
        <div className="absolute inset-12 rounded-full glass-strong flex items-center justify-center">
          <Sparkles className="w-10 h-10" style={{ color: "oklch(0.85 0.15 280)" }} />
        </div>
      </div>
    </div>
  );
}

function StepHeading({ tag, title, sub }: { tag: string; title: string; sub: string }) {
  return (
    <div className="mb-10">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">{tag}</p>
      <h2 className="text-3xl sm:text-5xl font-semibold tracking-tighter leading-tight">{title}</h2>
      <p className="text-muted-foreground mt-3 max-w-md">{sub}</p>
    </div>
  );
}

function CreatorType({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeading
        tag="01 — Identity"
        title="What kind of creator are you?"
        sub="Pick the closest fit. We'll tune everything around it."
      />
      <AvatarUpload />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {creatorTypes.map((c, i) => {
          const Icon = c.icon;
          const active = value === c.id;
          return (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => onChange(c.id)}
              className={`relative group text-left p-5 rounded-2xl transition-all overflow-hidden ${
                active ? "glass-strong shadow-glow" : "glass hover:bg-foreground/5"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="type-glow"
                  className="absolute inset-0 -z-10 opacity-50 blur-xl bg-iridescent"
                />
              )}
              <Icon
                className="w-5 h-5 mb-3"
                style={{ color: active ? "oklch(0.85 0.15 280)" : undefined }}
              />
              <p className="font-medium text-sm">{c.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{c.hint}</p>
              {active && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function ThemePicker({
  value,
  onChange,
}: {
  value: CabanaTheme;
  onChange: (v: CabanaTheme) => void;
}) {
  return (
    <div>
      <StepHeading
        tag="02 — Theme"
        title="Choose your aesthetic."
        sub="Don't overthink it. Everything is editable later."
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {themes.map((t, i) => {
          const active = value === t.id;
          return (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => onChange(t.id)}
              className={`relative rounded-2xl overflow-hidden aspect-[4/5] group transition-all ${
                active
                  ? "ring-2 ring-foreground shadow-glow"
                  : "ring-1 ring-border hover:ring-foreground/40"
              }`}
            >
              <div className="absolute inset-0" style={{ background: t.swatch }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                <span className="text-xs font-medium text-white drop-shadow">{t.label}</span>
                {active && (
                  <div className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function SocialConnect({
  connected,
  toggle,
}: {
  connected: string[];
  toggle: (id: string) => void;
}) {
  const [website, setWebsite] = useState("");
  return (
    <div>
      <StepHeading
        tag="03 — Connect"
        title="Import your world."
        sub="We'll pull your photos, stats and links — only what you allow."
      />
      <div className="space-y-2.5">
        {socials.map((s, i) => {
          const isOn = connected.includes(s.id);
          const Icon = s.icon;
          return (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => toggle(s.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${
                isOn ? "glass-strong" : "glass hover:bg-foreground/5"
              }`}
            >
              <div className="w-10 h-10 rounded-xl glass flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {isOn ? "Connected — handle, posts, stats" : "Tap to connect securely"}
                </p>
              </div>
              <div
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                  isOn ? "bg-foreground text-background" : "glass"
                }`}
              >
                {isOn ? "Connected" : "Connect"}
              </div>
            </motion.button>
          );
        })}

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: socials.length * 0.06 }}
          className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${
            website ? "glass-strong" : "glass"
          }`}
        >
          <div className="w-10 h-10 rounded-xl glass flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4" style={{ color: "oklch(0.82 0.14 230)" }} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium">Website</p>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourdomain.com"
              className="w-full mt-0.5 bg-transparent border-0 outline-none text-[11px] text-muted-foreground placeholder:text-muted-foreground/50 focus:text-foreground transition-colors"
            />
          </div>
          <div
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
              website ? "bg-foreground text-background" : "glass"
            }`}
          >
            {website ? "Added" : "Add link"}
          </div>
        </motion.div>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-6">
        Skip if you'd rather connect later.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-2 bg-transparent border-0 border-b border-border focus:border-foreground/50 outline-none py-3 text-base placeholder:text-muted-foreground/50 transition-colors"
      />
    </div>
  );
}

function AISetup(props: {
  niche: string;
  setNiche: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  audience: string;
  setAudience: (v: string) => void;
  goals: string;
  setGoals: (v: string) => void;
}) {
  return (
    <div>
      <StepHeading
        tag="04 — Define"
        title="Tell CABANA Studio about you."
        sub="Whisper a few words. Our AI listens better than most humans."
      />
      <div className="glass-strong rounded-3xl p-6 sm:p-8 space-y-5">
        <Field
          label="Your niche"
          value={props.niche}
          onChange={props.setNiche}
          placeholder="e.g. cinematic R&B vocalist"
        />
        <Field
          label="Your style"
          value={props.style}
          onChange={props.setStyle}
          placeholder="e.g. quiet luxury, warm noir"
        />
        <Field
          label="Your audience"
          value={props.audience}
          onChange={props.setAudience}
          placeholder="e.g. 18-34 night owls, fashion editors"
        />
        <Field
          label="Your goals"
          value={props.goals}
          onChange={props.setGoals}
          placeholder="e.g. drop announcement + VIP fanclub"
        />
      </div>
    </div>
  );
}

function Generating({
  loading,
  done,
  niche,
  type,
}: {
  loading: boolean;
  done: boolean;
  niche: string;
  type: string;
}) {
  const items = [
    { tag: "Bio", text: `${niche} blending mood and momentum into one universe.` },
    { tag: "Palette", text: "Iridescent chrome on noir — quiet, expensive, alive." },
    { tag: "CTA", text: "Step into the inner circle — for the few." },
    { tag: "Layout", text: `${type || "Creator"} grid, hero portrait, smart links, locked drops.` },
    { tag: "Sections", text: "Hero • Links • Storefront • Media kit • Locked content" },
  ];
  return (
    <div>
      <StepHeading
        tag="05 — Generate"
        title={done ? "Your kit is ready." : "CABANA is composing…"}
        sub={
          done
            ? "Drafted in your voice. Refine anything later."
            : "Bios, colors, copy and layout — all in one breath."
        }
      />
      <div className="glass-strong rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute -inset-20 opacity-30 blur-3xl bg-iridescent animate-pulse-glow" />
        <div className="relative space-y-3">
          {items.map((it, i) => (
            <motion.div
              key={it.tag}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.35, duration: 0.5 }}
              className="glass rounded-2xl p-4 flex items-start gap-3"
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md glass-strong shrink-0 mt-0.5">
                {it.tag}
              </span>
              <p className="text-sm leading-relaxed flex-1">{it.text}</p>
              {(done || i < 4) && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.35 + 0.4 }}
                  className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shrink-0"
                >
                  <Check className="w-3 h-3" />
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
        {loading && (
          <div className="relative mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <Wand2 className="w-3.5 h-3.5 animate-pulse" />
            <span>Composing your universe…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FinalPreview({ type, theme, niche }: { type: string; theme: string; niche: string }) {
  return (
    <div>
      <StepHeading
        tag="06 — Preview"
        title="Meet your CABANA."
        sub="A live preview of your public page. Tap anything to refine."
      />
      <div className="flex justify-center">
        <motion.div
          initial={{ y: 30, opacity: 0, rotateX: 10 }}
          animate={{ y: 0, opacity: 1, rotateX: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ perspective: 1200 }}
          className="relative"
        >
          <div className="absolute -inset-10 opacity-50 blur-3xl bg-iridescent rounded-full" />
          <div className="relative w-[280px] h-[560px] rounded-[44px] glass-strong p-2 shadow-luxury">
            <div className="w-full h-full rounded-[36px] overflow-hidden relative bg-background">
              {/* Hero gradient */}
              <div
                className="absolute inset-0 opacity-80"
                style={{
                  background:
                    theme === "neon"
                      ? "linear-gradient(160deg, #ff006e22, #8338ec33, transparent 60%)"
                      : "linear-gradient(160deg, oklch(0.3 0.15 280 / 0.6), transparent 60%)",
                }}
              />
              <div className="relative p-5 flex flex-col h-full">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>cabana.co/you</span>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow bg-iridescent" />
                </div>
                <div className="flex flex-col items-center mt-6">
                  <div className="relative">
                    <div className="absolute -inset-1.5 rounded-full bg-iridescent blur-md opacity-70" />
                    <div className="relative w-20 h-20 rounded-full bg-iridescent" />
                  </div>
                  <h3 className="font-display text-lg mt-3">Your name</h3>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {type || "creator"} · verified
                  </span>
                  <p className="text-[11px] text-center text-muted-foreground mt-2 leading-relaxed px-3">
                    {niche
                      ? `${niche} blending mood and momentum.`
                      : "Your AI-crafted bio appears here."}
                  </p>
                </div>
                <div className="mt-4 space-y-1.5">
                  {["VIP Access", "Latest Drop", "Storefront", "Bookings"].map((l, i) => (
                    <motion.div
                      key={l}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className={`glass rounded-xl px-3 py-2.5 text-[11px] flex items-center justify-between ${i === 0 ? "ring-1 ring-foreground/30" : ""}`}
                    >
                      <span>{l}</span>
                      <ArrowRight className="w-3 h-3" />
                    </motion.div>
                  ))}
                </div>
                <div className="mt-auto pt-3 text-center">
                  <span className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                    {theme.replace("-", " ")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
