import { motion } from "framer-motion";
import { useState } from "react";
import { Wand2, Sparkles, RefreshCw } from "lucide-react";

const tools = [
  {
    id: "bio",
    label: "Bio",
    placeholder: "Three words about you...",
    sample: "Digital muse crafting cinematic universes from light, sound and silk.",
  },
  {
    id: "cta",
    label: "CTA Text",
    placeholder: "What do you want fans to do?",
    sample: "Step inside the inner circle — your sanctuary awaits.",
  },
  {
    id: "caption",
    label: "Caption",
    placeholder: "Describe the post...",
    sample: "soft mornings, gold hour, and the kind of quiet that feels like a secret. ✦",
  },
  {
    id: "theme",
    label: "Theme",
    placeholder: "Mood, colors, vibe...",
    sample: "Midnight chrome with iridescent accents and quiet luxury typography.",
  },
];

export function AIStudio() {
  const [active, setActive] = useState("bio");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const tool = tools.find((t) => t.id === active)!;

  const generate = () => {
    setLoading(true);
    setOutput("");
    setTimeout(() => {
      setOutput(tool.sample);
      setLoading(false);
    }, 900);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-iridescent mb-2 flex items-center gap-2">
          <Sparkles className="w-3 h-3" /> CABANA Studio
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tighter">
          AI Tools
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate copy, captions, and themes that sound like you.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActive(t.id);
              setOutput("");
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              active === t.id
                ? "bg-iridescent text-background shadow-glow"
                : "glass text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-3xl p-6">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Prompt</label>
          <textarea
            placeholder={tool.placeholder}
            rows={6}
            className="w-full mt-3 bg-foreground/5 border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 resize-none"
          />
          <button
            onClick={generate}
            disabled={loading}
            className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-iridescent text-background font-medium shadow-glow disabled:opacity-60"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {loading ? "Generating..." : `Generate ${tool.label}`}
          </button>
        </div>

        <div className="glass rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-iridescent opacity-30 blur-3xl animate-pulse-glow" />
          <label className="text-xs uppercase tracking-wider text-muted-foreground relative">
            Output
          </label>
          <div className="mt-3 min-h-[200px] relative">
            {output ? (
              <motion.p
                key={output}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-lg font-display leading-relaxed"
              >
                {output}
              </motion.p>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                Your generation will appear here.
              </div>
            )}
          </div>
          {output && (
            <div className="flex gap-2 mt-4 relative">
              <button className="text-xs px-3 py-1.5 rounded-full bg-foreground/10 hover:bg-foreground/15">
                Copy
              </button>
              <button
                onClick={generate}
                className="text-xs px-3 py-1.5 rounded-full bg-foreground/10 hover:bg-foreground/15"
              >
                Regenerate
              </button>
              <button className="text-xs px-3 py-1.5 rounded-full bg-iridescent text-background">
                Use it
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
