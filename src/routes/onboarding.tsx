import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Camera,
  Upload,
  Loader2,
  Plus,
  X,
  Link2,
} from "lucide-react";
import {
  useCabana,
  useCabanaMutations,
  LINK_ICONS,
  FALLBACK_AVATAR,
  type CabanaTheme,
  type CabanaProfile,
  type ButtonStyle,
  type LinkIconKey,
} from "@/lib/cabana-store";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "description", content: "Create your CABANA — add your basics and go live." },
      { property: "og:title", content: "CABANA" },
      { property: "og:description", content: "Create your CABANA in a couple of minutes." },
    ],
  }),
  component: OnboardingPage,
});

const STEPS = ["Identity", "Links", "Look", "Preview"] as const;

// ─────────────────────────── Link platforms ───────────────────────────
type PlatformKey =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "website"
  | "store"
  | "email"
  | "phone";

const clean = (v: string) => v.trim().replace(/^@/, "");
const isUrl = (v: string) => /^(https?:\/\/|mailto:|tel:)/i.test(v.trim());
const ensureHttp = (v: string) =>
  /^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`;

type Platform = {
  key: PlatformKey;
  label: string;
  icon: LinkIconKey;
  placeholder: string;
  build: (value: string) => { title: string; url: string };
};

const PLATFORMS: Platform[] = [
  {
    key: "instagram",
    label: "Instagram",
    icon: "instagram",
    placeholder: "username or link",
    build: (v) => ({
      title: "Instagram",
      url: isUrl(v) ? v.trim() : `https://instagram.com/${clean(v)}`,
    }),
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: "music",
    placeholder: "username or link",
    build: (v) => ({
      title: "TikTok",
      url: isUrl(v) ? v.trim() : `https://www.tiktok.com/@${clean(v)}`,
    }),
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: "youtube",
    placeholder: "@handle or link",
    build: (v) => ({
      title: "YouTube",
      url: isUrl(v) ? v.trim() : `https://youtube.com/@${clean(v)}`,
    }),
  },
  {
    key: "x",
    label: "X",
    icon: "x",
    placeholder: "username or link",
    build: (v) => ({ title: "X", url: isUrl(v) ? v.trim() : `https://x.com/${clean(v)}` }),
  },
  {
    key: "website",
    label: "Website",
    icon: "globe",
    placeholder: "yourdomain.com",
    build: (v) => ({ title: "Website", url: ensureHttp(v) }),
  },
  {
    key: "store",
    label: "Store",
    icon: "shop",
    placeholder: "store link",
    build: (v) => ({ title: "Store", url: ensureHttp(v) }),
  },
  {
    key: "email",
    label: "Email",
    icon: "mail",
    placeholder: "you@email.com",
    build: (v) => ({ title: "Email", url: `mailto:${v.trim()}` }),
  },
  {
    key: "phone",
    label: "Phone",
    icon: "phone",
    placeholder: "+1 555 000 0000",
    build: (v) => ({ title: "Phone", url: `tel:${v.trim().replace(/[^\d+]/g, "")}` }),
  },
];

type Draft = {
  id: string;
  platform: PlatformKey | "custom";
  value: string;
  customTitle: string;
  existingId?: string;
};

function detectPlatform(url: string): PlatformKey | null {
  const u = url.toLowerCase();
  if (u.startsWith("mailto:")) return "email";
  if (u.startsWith("tel:")) return "phone";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("x.com") || u.includes("twitter.com")) return "x";
  return null;
}

/** Built {title,url,icon} for a draft that has a value; null when empty. */
function buildDraft(d: Draft): { title: string; url: string; icon: LinkIconKey } | null {
  const v = d.value.trim();
  if (!v) return null;
  if (d.platform === "custom") {
    return { title: d.customTitle.trim() || "Link", url: ensureHttp(v), icon: "globe" };
  }
  const p = PLATFORMS.find((x) => x.key === d.platform)!;
  return { ...p.build(v), icon: p.icon };
}

// ─────────────────────────── Themes ───────────────────────────
const THEMES: { id: CabanaTheme; label: string; swatch: string }[] = [
  {
    id: "iridescent",
    label: "Iridescent",
    swatch: "linear-gradient(135deg,#8be9ff,#c084fc,#f0abfc,#fde68a)",
  },
  { id: "midnight", label: "Midnight", swatch: "linear-gradient(135deg,#0f172a,#312e81,#0f172a)" },
  { id: "rose", label: "Rose Gold", swatch: "linear-gradient(135deg,#fda4af,#fcd34d,#f9a8d4)" },
  { id: "chrome", label: "Chrome", swatch: "linear-gradient(135deg,#e5e7eb,#94a3b8,#e5e7eb)" },
];

const ACCENTS: { label: string; value: string }[] = [
  { label: "Theme default", value: "" },
  { label: "Violet", value: "#c084fc" },
  { label: "Cyan", value: "#8be9ff" },
  { label: "Pink", value: "#f9a8d4" },
  { label: "Gold", value: "#fcd34d" },
  { label: "Green", value: "#86efac" },
  { label: "Coral", value: "#fda4af" },
];

const BUTTON_STYLES: { id: ButtonStyle; label: string; radius: string }[] = [
  { id: "rounded", label: "Rounded", radius: "rounded-2xl" },
  { id: "pill", label: "Pill", radius: "rounded-full" },
  { id: "square", label: "Square", radius: "rounded-md" },
];

const buttonRadius = (s: ButtonStyle) =>
  BUTTON_STYLES.find((b) => b.id === s)?.radius ?? "rounded-2xl";

const sanitizeHandle = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 30);

// ─────────────────────────── Page ───────────────────────────
function OnboardingPage() {
  const navigate = useNavigate();
  const { profile, links, loading } = useCabana();
  const m = useCabanaMutations();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [theme, setTheme] = useState<CabanaTheme>("iridescent");
  const [accentColor, setAccentColor] = useState("");
  const [buttonStyle, setButtonStyle] = useState<ButtonStyle>("rounded");
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    PLATFORMS.map((p) => ({ id: p.key, platform: p.key, value: "", customTitle: "" })),
  );

  const [savingIdentity, setSavingIdentity] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);

  const originalHandle = useRef<string>("");
  const seeded = useRef(false);

  // Seed once from the existing creator profile (created at signup).
  useEffect(() => {
    if (seeded.current || loading || !profile) return;
    seeded.current = true;
    setName(profile.name ?? "");
    setHandle(profile.handle ?? "");
    originalHandle.current = profile.handle ?? "";
    setHeadline(profile.headline ?? "");
    setBio(profile.bio ?? "");
    if (profile.theme) setTheme(profile.theme);
    setAccentColor(profile.accentColor ?? "");
    setButtonStyle(profile.buttonStyle ?? "rounded");
    if (profile.avatar && profile.avatar !== FALLBACK_AVATAR) setAvatarPreview(profile.avatar);

    if (links.length > 0) {
      const next = PLATFORMS.map<Draft>((p) => ({
        id: p.key,
        platform: p.key,
        value: "",
        customTitle: "",
      }));
      const customs: Draft[] = [];
      for (const l of links) {
        const platform = detectPlatform(l.url);
        const display = l.url.replace(/^mailto:/i, "").replace(/^tel:/i, "") || l.url;
        if (platform) {
          const slot = next.find((d) => d.platform === platform);
          if (slot && !slot.value) {
            slot.value = display;
            slot.existingId = l.id;
            continue;
          }
        }
        customs.push({
          id: `c-${l.id}`,
          platform: "custom",
          value: l.url.replace(/^https?:\/\//i, ""),
          customTitle: l.title,
          existingId: l.id,
        });
      }
      setDrafts([...next, ...customs]);
    }
  }, [loading, profile, links]);

  const previewLinks = useMemo(
    () => drafts.map(buildDraft).filter((x): x is NonNullable<typeof x> => x !== null),
    [drafts],
  );

  const canContinue = step === 0 ? name.trim().length > 0 && handle.trim().length >= 2 : true;

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const addCustom = () =>
    setDrafts((ds) => [
      ...ds,
      { id: crypto.randomUUID(), platform: "custom", value: "", customTitle: "" },
    ]);
  const removeDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    setDrafts((ds) => ds.filter((x) => x.id !== id));
    if (d?.existingId) void m.removeLink(d.existingId);
  };

  const onPickAvatar = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    setAvatarPreview(URL.createObjectURL(file));
    const url = await m.uploadAvatar(file);
    if (url) setAvatarPreview(url);
  };

  const saveIdentity = async () => {
    setHandleError(null);
    setSavingIdentity(true);
    const patch: Record<string, string> = {
      name: name.trim(),
      bio: bio.trim(),
      headline: headline.trim(),
    };
    if (handle !== originalHandle.current) patch.handle = handle.trim();
    // wrap() resolves to null on failure (and shows a toast); undefined on success.
    const res = await m.setProfile(patch);
    setSavingIdentity(false);
    if (res === null) {
      if (patch.handle) setHandleError("That username may be taken. Try another.");
      return false;
    }
    originalHandle.current = handle.trim();
    return true;
  };

  const next = async () => {
    if (step === 0) {
      const ok = await saveIdentity();
      if (!ok) return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const goLive = async () => {
    setGoingLive(true);
    // Reconcile links: update existing, create new (empty existing rows are
    // removed inline via removeDraft when the user clears them).
    const creates: { title: string; url: string; icon: LinkIconKey; featured?: boolean }[] = [];
    const updates: Promise<unknown>[] = [];
    for (const d of drafts) {
      const built = buildDraft(d);
      if (d.existingId) {
        if (built) updates.push(m.updateLink(d.existingId, { title: built.title, url: built.url }));
      } else if (built) {
        creates.push(built);
      }
    }
    await Promise.all(updates);
    if (creates.length) await m.createLinks(creates);
    const look: Partial<Pick<CabanaProfile, "theme" | "accentColor" | "buttonStyle">> = {};
    if (theme !== profile?.theme) look.theme = theme;
    if (accentColor !== (profile?.accentColor ?? "")) look.accentColor = accentColor;
    if (buttonStyle !== (profile?.buttonStyle ?? "rounded")) look.buttonStyle = buttonStyle;
    if (Object.keys(look).length) await m.setProfile(look);
    setGoingLive(false);
    if (typeof window !== "undefined") sessionStorage.setItem("cabana:justOnboarded", "1");
    navigate({ to: "/dashboard" });
  };

  const displayHandle = handle || "yourname";

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-background">
      {/* subtle, non-intrusive backdrop */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, oklch(0.3 0.12 280 / 0.35), transparent 60%)",
        }}
      />

      {/* Header + progress */}
      <div className="mx-auto w-full max-w-lg px-5 pt-6">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-semibold tracking-tight">CABANA</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {step + 1} <span className="opacity-50">/ {STEPS.length}</span>
          </span>
        </div>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <motion.div
                initial={false}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="h-full bg-iridescent"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Step body */}
      <div className="mx-auto w-full max-w-lg flex-1 px-5 pb-40 pt-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && (
              <IdentityStep
                name={name}
                setName={setName}
                handle={handle}
                setHandle={(v) => setHandle(sanitizeHandle(v))}
                handleError={handleError}
                headline={headline}
                setHeadline={setHeadline}
                bio={bio}
                setBio={setBio}
                avatar={avatarPreview}
                onPickAvatar={onPickAvatar}
              />
            )}
            {step === 1 && (
              <LinksStep
                drafts={drafts}
                setDraft={setDraft}
                addCustom={addCustom}
                removeDraft={removeDraft}
              />
            )}
            {step === 2 && (
              <LookStep
                theme={theme}
                setTheme={setTheme}
                accentColor={accentColor}
                setAccentColor={setAccentColor}
                buttonStyle={buttonStyle}
                setButtonStyle={setButtonStyle}
              />
            )}
            {step === 3 && (
              <PreviewStep
                name={name}
                handle={displayHandle}
                headline={headline}
                bio={bio}
                avatar={avatarPreview}
                theme={theme}
                accentColor={accentColor}
                buttonStyle={buttonStyle}
                links={previewLinks}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky footer — safe-area aware for mobile Safari */}
      <div className="sticky bottom-0 z-20 border-t border-white/[0.08] bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-5 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-3.5">
          <button
            onClick={back}
            disabled={step === 0}
            className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-0"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <div className="flex items-center gap-2">
              {step === 1 && (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="min-h-11 rounded-full px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Skip
                </button>
              )}
              <button
                onClick={() => void next()}
                disabled={!canContinue || savingIdentity}
                className="flex min-h-11 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background shadow-glow transition-all hover:scale-[1.02] disabled:opacity-40 disabled:shadow-none"
              >
                {savingIdentity ? "Saving…" : "Continue"}
                {!savingIdentity && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <button
              onClick={() => void goLive()}
              disabled={goingLive}
              className="flex min-h-11 items-center gap-2 rounded-full bg-iridescent px-6 text-sm font-semibold text-background shadow-glow transition-all hover:scale-[1.02] disabled:opacity-60"
            >
              {goingLive ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {goingLive ? "Going live…" : "Enter CABANA"}
              {!goingLive && <ArrowRight className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Steps ───────────────────────────
function StepHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[1.7rem] font-semibold leading-tight tracking-tight">
        {title}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-2xl border border-white/[0.1] bg-white/[0.04] px-4 py-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/60 focus:bg-white/[0.06]";

function IdentityStep({
  name,
  setName,
  handle,
  setHandle,
  handleError,
  headline,
  setHeadline,
  bio,
  setBio,
  avatar,
  onPickAvatar,
}: {
  name: string;
  setName: (v: string) => void;
  handle: string;
  setHandle: (v: string) => void;
  handleError: string | null;
  headline: string;
  setHeadline: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  avatar: string;
  onPickAvatar: (f: File | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <StepHead title="Create your CABANA" sub="Add the basics. You can change everything later." />

      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative shrink-0"
          aria-label="Upload profile photo"
        >
          <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-iridescent p-[2px]">
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-background">
              {avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-6 w-6 text-muted-foreground" />
              )}
            </span>
          </span>
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full glass-strong transition-transform group-hover:scale-110">
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
        <div className="min-w-0">
          <p className="text-sm font-medium">Profile photo</p>
          <p className="mt-0.5 text-xs text-muted-foreground">PNG or JPG, up to 5MB. Optional.</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            setBusy(true);
            await onPickAvatar(e.target.files?.[0] ?? undefined);
            setBusy(false);
          }}
        />
      </div>

      <div className="space-y-4">
        <Labeled label="Display name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </Labeled>
        <Labeled label="Username">
          <div className="flex items-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-4 focus-within:border-primary/60">
            <span className="shrink-0 text-sm text-muted-foreground">cabanagrp.com/</span>
            <input
              className="w-full bg-transparent py-3.5 text-base outline-none placeholder:text-muted-foreground/50"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourname"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          {handleError ? (
            <span className="mt-1.5 block text-xs text-destructive">{handleError}</span>
          ) : null}
        </Labeled>
        <Labeled label="Headline">
          <input
            className={inputCls}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="e.g. Creator · Photographer (optional)"
            maxLength={80}
          />
        </Labeled>
        <Labeled label="Short bio">
          <textarea
            className={`${inputCls} min-h-[92px] resize-none`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A line about you (optional)"
            maxLength={200}
          />
        </Labeled>
      </div>
    </div>
  );
}

function LinksStep({
  drafts,
  setDraft,
  addCustom,
  removeDraft,
}: {
  drafts: Draft[];
  setDraft: (id: string, patch: Partial<Draft>) => void;
  addCustom: () => void;
  removeDraft: (id: string) => void;
}) {
  return (
    <div>
      <StepHead title="Add your first links" sub="Only what you want. Skip any — add more later." />
      <div className="space-y-2.5">
        {drafts.map((d) => {
          const platform =
            d.platform === "custom" ? null : PLATFORMS.find((p) => p.key === d.platform)!;
          const iconKey: LinkIconKey = platform ? platform.icon : "globe";
          const Icon = LINK_ICONS[iconKey];
          return (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5 focus-within:border-primary/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl glass-strong">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                {platform ? (
                  <p className="text-xs font-medium">{platform.label}</p>
                ) : (
                  <input
                    className="w-full bg-transparent text-xs font-medium outline-none placeholder:text-muted-foreground/60"
                    value={d.customTitle}
                    onChange={(e) => setDraft(d.id, { customTitle: e.target.value })}
                    placeholder="Link title"
                  />
                )}
                <input
                  className="w-full bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground/45"
                  value={d.value}
                  onChange={(e) => setDraft(d.id, { value: e.target.value })}
                  placeholder={platform ? platform.placeholder : "https://…"}
                  inputMode={
                    d.platform === "phone" ? "tel" : d.platform === "email" ? "email" : "url"
                  }
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              {d.platform === "custom" || d.existingId ? (
                <button
                  type="button"
                  onClick={() => removeDraft(d.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                  aria-label="Remove link"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addCustom}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.14] py-3 text-sm text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
      >
        <Plus className="h-4 w-4" /> Add another link
      </button>
    </div>
  );
}

function LookStep({
  theme,
  setTheme,
  accentColor,
  setAccentColor,
  buttonStyle,
  setButtonStyle,
}: {
  theme: CabanaTheme;
  setTheme: (v: CabanaTheme) => void;
  accentColor: string;
  setAccentColor: (v: string) => void;
  buttonStyle: ButtonStyle;
  setButtonStyle: (v: ButtonStyle) => void;
}) {
  return (
    <div>
      <StepHead title="Pick a look" sub="Choose a vibe. You can restyle anytime." />

      <span className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Theme
      </span>
      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`relative overflow-hidden rounded-2xl p-3 text-left transition-all ${
                active ? "ring-2 ring-foreground" : "ring-1 ring-white/10 hover:ring-white/25"
              }`}
            >
              <span className="block h-20 w-full rounded-xl" style={{ background: t.swatch }} />
              <span className="mt-2.5 flex items-center justify-between">
                <span className="text-sm font-medium">{t.label}</span>
                {active ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                    <Check className="h-3 w-3" />
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <span className="mb-2.5 mt-6 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Accent color
      </span>
      <div className="flex flex-wrap gap-2.5">
        {ACCENTS.map((a) => {
          const active = accentColor === a.value;
          return (
            <button
              key={a.value || "default"}
              type="button"
              onClick={() => setAccentColor(a.value)}
              aria-label={a.label}
              title={a.label}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                active
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  : "ring-1 ring-white/15"
              }`}
              style={
                a.value
                  ? { background: a.value }
                  : {
                      background:
                        "var(--gradient-iridescent, linear-gradient(135deg,#8be9ff,#c084fc,#f0abfc))",
                    }
              }
            >
              {active ? <Check className="h-4 w-4 text-black/70" /> : null}
            </button>
          );
        })}
      </div>

      <span className="mb-2.5 mt-6 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Button style
      </span>
      <div className="grid grid-cols-3 gap-2.5">
        {BUTTON_STYLES.map((b) => {
          const active = buttonStyle === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setButtonStyle(b.id)}
              className={`flex flex-col items-center gap-2 rounded-2xl p-3 transition-all ${
                active ? "ring-2 ring-foreground" : "ring-1 ring-white/10 hover:ring-white/25"
              }`}
            >
              <span className={`h-7 w-full border border-white/25 bg-white/10 ${b.radius}`} />
              <span className="text-xs">{b.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewStep({
  name,
  handle,
  headline,
  bio,
  avatar,
  theme,
  accentColor,
  buttonStyle,
  links,
}: {
  name: string;
  handle: string;
  headline: string;
  bio: string;
  avatar: string;
  theme: CabanaTheme;
  accentColor: string;
  buttonStyle: ButtonStyle;
  links: { title: string; url: string; icon: LinkIconKey }[];
}) {
  const initial = (name || handle).charAt(0).toUpperCase();
  const radius = buttonRadius(buttonStyle);
  const iconColor = accentColor || undefined; // undefined → CSS class default
  return (
    <div>
      <StepHead
        title="You're live"
        sub="This is your public page. Tweak anything from the dashboard."
      />
      <div
        data-cabana-theme={theme}
        className="mx-auto max-w-sm overflow-hidden rounded-[28px] border border-white/[0.1] bg-[oklch(0.14_0.015_280/0.6)] shadow-luxury"
      >
        <div
          className="h-24 bg-iridescent opacity-80"
          style={accentColor ? { background: accentColor } : undefined}
        />
        <div className="px-5 pb-6">
          <span className="-mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-iridescent text-xl font-semibold text-background ring-4 ring-background">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initial}
          </span>
          <h2 className="mt-3 font-display text-xl font-semibold tracking-tight">
            {name || `@${handle}`}
          </h2>
          {headline ? (
            <p
              className="mt-0.5 text-sm font-medium"
              style={accentColor ? { color: accentColor } : undefined}
            >
              {headline}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">@{handle}</p>
          {bio ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/85">{bio}</p>
          ) : null}

          <div className="mt-5 space-y-2">
            {links.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.14] px-4 py-6 text-center text-sm text-muted-foreground">
                Add your first link anytime.
              </div>
            ) : (
              links.map((l, i) => {
                const Icon = LINK_ICONS[l.icon] ?? Link2;
                return (
                  <div
                    key={`${l.title}-${i}`}
                    className={`flex items-center gap-3 border border-white/[0.08] bg-white/[0.04] px-4 py-3 ${radius}`}
                  >
                    <Icon
                      className="h-4 w-4 shrink-0 text-primary"
                      style={iconColor ? { color: iconColor } : undefined}
                    />
                    <span className="truncate text-sm font-medium">{l.title}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
