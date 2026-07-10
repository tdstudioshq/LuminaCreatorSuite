import { motion, Reorder, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  GripVertical,
  BarChart3,
  Calendar,
  Eye,
  Plus,
  X,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  useCabana,
  useCabanaMutations,
  LINK_ICONS,
  ICON_OPTIONS,
  type CabanaLink,
} from "@/lib/cabana-store";
import { toast } from "sonner";
import { useDebouncedCallback, useDebouncedField } from "@/hooks/use-debounced-callback";
import { isValidHttpUrl, normalizeUrl } from "@/lib/cabana-validation";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/cabana/dashboard/ConfirmDeleteButton";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import { EmptyState } from "@/components/cabana/EmptyState";

export function LinkManager() {
  const { links, loading, error, refetch } = useCabana();
  const m = useCabanaMutations();
  const [editing, setEditing] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<CabanaLink[] | null>(null);

  const items = localOrder ?? links;
  // Keep the latest dragged order in a ref so we can persist exactly once when
  // the drag gesture ends — never on every intermediate reorder event.
  const orderRef = useRef(items);
  orderRef.current = items;

  const commitOrder = () => {
    const next = orderRef.current;
    const changed = next.some((link, i) => links[i]?.id !== link.id);
    if (changed) {
      m.setLinks(next).finally(() => setLocalOrder(null));
    } else {
      setLocalOrder(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tighter">
            Link Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {links.length > 0
              ? "Drag to reorder. Click edit to update."
              : "Add the links your audience should see."}
          </p>
        </div>
        <Button onClick={() => m.addLink()} variant="cta" size="sm" className="!rounded-full">
          <Plus className="w-4 h-4" /> Add link
        </Button>
      </div>

      {loading ? (
        <div className="glass rounded-3xl p-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading links…
        </div>
      ) : error ? (
        <QueryErrorState title="Couldn’t load your links" onRetry={refetch} />
      ) : links.length === 0 ? (
        <EmptyState
          icon={LINK_ICONS.globe}
          title="No links yet"
          description="Add the links, socials, and destinations your audience should see."
          action={
            <Button onClick={() => m.addLink()} variant="cta" size="sm" className="!rounded-full">
              <Plus className="w-4 h-4" /> Add link
            </Button>
          }
        />
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={setLocalOrder} className="space-y-3">
          {items.map((link) => {
            const Icon = LINK_ICONS[link.icon] ?? LINK_ICONS.globe;
            const isEditing = editing === link.id;
            return (
              <Reorder.Item
                key={link.id}
                value={link}
                onDragEnd={commitOrder}
                className="glass rounded-2xl p-4 hover:border-primary/30 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                  <div className="w-11 h-11 rounded-xl glass-strong flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{link.title}</div>
                      {link.scheduled && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" /> {link.scheduled}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{link.url}</div>
                  </div>
                  <div className="hidden sm:flex items-center gap-5 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Eye className="w-3.5 h-3.5" /> {link.clicks.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-300">
                      <BarChart3 className="w-3.5 h-3.5" /> {link.ctr}
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setEditing(isEditing ? null : link.id)}
                    className="text-xs px-3 py-1.5 rounded-full bg-foreground/10 hover:bg-foreground/15"
                  >
                    {isEditing ? "Done" : "Edit"}
                  </motion.button>
                  <ConfirmDeleteButton
                    onConfirm={() => m.removeLink(link.id)}
                    idleLabel="Delete link"
                    idleClassName="text-muted-foreground hover:text-destructive transition-colors p-1.5"
                  />
                </div>

                <AnimatePresence>
                  {isEditing && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <LinkEditForm link={link} onClose={() => setEditing(null)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}
    </div>
  );
}

function LinkEditForm({ link, onClose }: { link: CabanaLink; onClose: () => void }) {
  const m = useCabanaMutations();
  return (
    <div className="mt-4 pt-4 border-t border-border grid sm:grid-cols-2 gap-3">
      <Input
        label="Title"
        value={link.title}
        onChange={(v) => m.updateLink(link.id, { title: v })}
      />
      <UrlField value={link.url} onCommit={(v) => m.updateLink(link.id, { url: v })} />
      <Input
        label="Note shown on this link (optional)"
        value={link.scheduled ?? ""}
        onChange={(v) => m.updateLink(link.id, { scheduled: v || undefined })}
      />
      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wider">Icon</label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ICON_OPTIONS.map((key) => {
            const I = LINK_ICONS[key];
            const selected = link.icon === key;
            return (
              <button
                key={key}
                onClick={() => m.updateLink(link.id, { icon: key })}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  selected
                    ? "bg-iridescent text-background shadow-glow"
                    : "bg-foreground/5 hover:bg-foreground/10 text-muted-foreground"
                }`}
              >
                <I className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
        <input
          type="checkbox"
          checked={!!link.featured}
          onChange={(e) => m.updateLink(link.id, { featured: e.target.checked })}
          className="accent-primary"
        />
        Featured (highlighted on public page)
      </label>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-full bg-foreground/10 hover:bg-foreground/15 flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Close
        </button>
        <Button onClick={onClose} variant="cta" size="sm" className="!rounded-full !px-3 !text-xs">
          <Check className="w-3 h-3" /> Save
        </Button>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useDebouncedField(value, onChange);
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className="w-full mt-2 bg-foreground/5 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
      />
    </div>
  );
}

/** URL editor with inline validation. Only commits a normalized, valid URL. */
function UrlField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  // Tracks the last value the commit path discarded as invalid, so we can warn
  // (once, via toast) when the field closes with an unsaved invalid URL — the
  // inline error unmounts with the form, which would otherwise be silent.
  const lastInvalid = useRef<string | null>(null);
  const commit = useDebouncedCallback((next: string) => {
    if (isValidHttpUrl(next)) {
      lastInvalid.current = null;
      onCommit(normalizeUrl(next));
    } else {
      lastInvalid.current = next.trim().length > 0 ? next : null;
    }
  }, 500);
  // Runs after the debounce hook's unmount flush (declared above), so it sees
  // the final committed-or-discarded state.
  useEffect(
    () => () => {
      if (lastInvalid.current !== null) {
        toast.error(`URL not saved — "${lastInvalid.current}" isn't a valid link.`);
      }
    },
    [],
  );

  const invalid = local.trim().length > 0 && !isValidHttpUrl(local);

  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider">URL</label>
      <input
        value={local}
        inputMode="url"
        onChange={(e) => {
          setLocal(e.target.value);
          commit(e.target.value);
        }}
        className={`w-full mt-2 bg-foreground/5 border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${
          invalid
            ? "border-destructive/60 focus:border-destructive"
            : "border-border focus:border-primary/50"
        }`}
      />
      {invalid && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-destructive">
          <AlertCircle className="w-3 h-3" /> Enter a valid URL (e.g. https://example.com)
        </p>
      )}
    </div>
  );
}
