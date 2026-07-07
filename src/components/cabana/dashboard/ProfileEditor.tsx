import { motion } from "framer-motion";
import { Camera, Check, Eye, ImageIcon, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import {
  useCabana,
  useCabanaMutations,
  type CabanaTheme,
  type ButtonStyle,
} from "@/lib/cabana-store";
import { useDebouncedField } from "@/hooks/use-debounced-callback";

const themes: { id: CabanaTheme; name: string; gradient: string }[] = [
  {
    id: "iridescent",
    name: "Iridescent",
    gradient: "linear-gradient(135deg,#8be9ff,#c084fc,#f0abfc,#fde68a)",
  },
  { id: "midnight", name: "Midnight", gradient: "linear-gradient(135deg,#0f172a,#312e81,#0f172a)" },
  { id: "rose", name: "Rose Gold", gradient: "linear-gradient(135deg,#fda4af,#fcd34d,#f9a8d4)" },
  { id: "chrome", name: "Chrome", gradient: "linear-gradient(135deg,#e5e7eb,#94a3b8,#e5e7eb)" },
];

const accents: { label: string; value: string }[] = [
  { label: "Theme default", value: "" },
  { label: "Violet", value: "#c084fc" },
  { label: "Cyan", value: "#8be9ff" },
  { label: "Pink", value: "#f9a8d4" },
  { label: "Gold", value: "#fcd34d" },
  { label: "Green", value: "#86efac" },
  { label: "Coral", value: "#fda4af" },
];

const buttonStyles: { id: ButtonStyle; label: string; radius: string }[] = [
  { id: "rounded", label: "Rounded", radius: "rounded-2xl" },
  { id: "pill", label: "Pill", radius: "rounded-full" },
  { id: "square", label: "Square", radius: "rounded-md" },
];

export function ProfileEditor() {
  const { profile, links, loading } = useCabana();
  const m = useCabanaMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  if (loading || !profile) {
    return (
      <div className="min-h-[400px] flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading your studio…
      </div>
    );
  }

  const active = themes.find((t) => t.id === profile.theme) ?? themes[0];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tighter">
            Profile Editor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tune every detail of your public presence.
          </p>
        </div>
        <Link
          to="/$username"
          params={{ username: profile.handle || "aurora" }}
          target="_blank"
          className="flex items-center gap-2 px-4 py-2.5 rounded-full glass-strong text-sm font-medium hover:border-primary/30"
        >
          <Eye className="w-4 h-4" /> Preview public page
        </Link>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-5">
          <div className="glass rounded-3xl p-6">
            <h3 className="font-display font-semibold mb-4">Avatar</h3>
            <div className="flex items-center gap-5">
              <div className="relative">
                <div className="w-24 h-24 rounded-full p-[2px] bg-iridescent">
                  <img
                    src={profile.avatar}
                    alt="Avatar"
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full glass-strong flex items-center justify-center hover:scale-110 transition-transform"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) m.uploadAvatar(f);
                  }}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                <div>Drop an image or click the camera</div>
                <div className="text-xs mt-1">PNG/JPG, 1:1 ratio recommended</div>
              </div>
            </div>
          </div>

          <div className="glass rounded-3xl p-6">
            <h3 className="font-display font-semibold mb-4">Banner</h3>
            <button
              type="button"
              onClick={() => bannerRef.current?.click()}
              className="group relative block w-full aspect-[16/6] rounded-2xl overflow-hidden glass-strong"
              aria-label="Upload banner image"
            >
              {profile.banner ? (
                <img
                  src={profile.banner}
                  alt="Banner"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0" style={{ background: active.gradient }} />
              )}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-sm font-medium">
                <ImageIcon className="w-4 h-4" />{" "}
                {profile.banner ? "Replace banner" : "Upload banner"}
              </div>
            </button>
            <p className="text-xs text-muted-foreground mt-3">
              Shown as the hero image on your public page. Wide format, PNG/JPG.
            </p>
            <input
              ref={bannerRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) m.uploadBanner(f);
              }}
            />
          </div>

          <div className="glass rounded-3xl p-6 space-y-4">
            <h3 className="font-display font-semibold">Identity</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field
                label="Display name"
                value={profile.name}
                onChange={(v) => m.setProfile({ name: v })}
              />
              <Field
                label="Handle"
                value={profile.handle}
                onChange={(v) =>
                  m.setProfile({ handle: v.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() })
                }
                prefix="@"
              />
            </div>
            <Field
              label="Headline"
              value={profile.headline}
              onChange={(v) => m.setProfile({ headline: v })}
            />
            <BioField value={profile.bio} onChange={(v) => m.setProfile({ bio: v })} />
          </div>

          <div className="glass rounded-3xl p-6 space-y-6">
            <div>
              <h3 className="font-display font-semibold mb-4">Theme</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => m.setProfile({ theme: t.id })}
                    className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                      profile.theme === t.id
                        ? "border-primary scale-95"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ background: t.gradient }}
                  >
                    {profile.theme === t.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Check className="w-6 h-6 text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-1 left-2 text-[10px] font-medium text-white drop-shadow">
                      {t.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-display font-semibold mb-3">Accent color</h3>
              <div className="flex flex-wrap gap-2.5">
                {accents.map((a) => {
                  const active = (profile.accentColor || "") === a.value;
                  return (
                    <button
                      key={a.value || "default"}
                      type="button"
                      onClick={() => m.setProfile({ accentColor: a.value })}
                      aria-label={a.label}
                      title={a.label}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                        active
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : "ring-1 ring-border"
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
            </div>

            <div>
              <h3 className="font-display font-semibold mb-3">Button style</h3>
              <div className="grid grid-cols-3 gap-2.5">
                {buttonStyles.map((b) => {
                  const active = (profile.buttonStyle || "rounded") === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => m.setProfile({ buttonStyle: b.id })}
                      className={`flex flex-col items-center gap-2 rounded-2xl p-3 transition-all ${
                        active
                          ? "ring-2 ring-primary"
                          : "ring-1 ring-border hover:ring-foreground/30"
                      }`}
                    >
                      <span
                        className={`h-6 w-full border border-foreground/25 bg-foreground/10 ${b.radius}`}
                      />
                      <span className="text-xs">{b.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3 px-1">
              Live Preview
            </div>
            <motion.div
              key={profile.theme}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[2rem] overflow-hidden border border-border shadow-luxury aspect-[9/16] relative"
              style={{ background: active.gradient }}
            >
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative z-10 p-6 flex flex-col items-center text-center h-full">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/40 mb-4 mt-8">
                  <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="font-display text-xl font-semibold text-white">
                  {profile.name || "Your name"}
                </div>
                <div className="text-xs text-white/70 mb-4">@{profile.handle || "handle"}</div>
                <p className="text-sm text-white/90 max-w-[80%]">{profile.bio}</p>
                <div className="mt-auto w-full space-y-2">
                  {links.slice(0, 3).map((l) => (
                    <div
                      key={l.id}
                      className="w-full py-3 rounded-full bg-white/15 backdrop-blur text-white text-sm font-medium truncate px-3"
                    >
                      {l.title}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
}) {
  const [local, setLocal] = useDebouncedField(value, onChange);
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="mt-2 flex items-center bg-foreground/5 border border-border rounded-xl focus-within:border-primary/50 transition-colors">
        {prefix && <span className="pl-3 text-sm text-muted-foreground">{prefix}</span>}
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          className="w-full bg-transparent px-4 py-2.5 text-sm focus:outline-none"
        />
      </div>
    </div>
  );
}

function BioField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useDebouncedField(value, (v) => onChange(v.slice(0, 180)));
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider">Bio</label>
      <textarea
        value={local}
        maxLength={180}
        onChange={(e) => setLocal(e.target.value)}
        rows={3}
        className="w-full mt-2 bg-foreground/5 border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors"
      />
      <div className="text-[10px] text-muted-foreground mt-1">{local.length}/180</div>
    </div>
  );
}
