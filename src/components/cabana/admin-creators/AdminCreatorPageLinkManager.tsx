import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/cabana/EmptyState";
import { ICON_OPTIONS, LINK_ICONS } from "@/lib/cabana-store";
import {
  moveCreatorLinkIds,
  normalizedCreatorLinkUrl,
  safeCreatorEditorError,
  validateCreatorLinkDraft,
} from "@/lib/cabana-admin-creator-editor";
import type { AdminCreatorPageLink } from "@/lib/cabana-admin-creator-page-detail";
import { LINK_KINDS, type LinkKind } from "@/lib/cabana-creator-pages";
import type { LinkIconKey } from "@/lib/cabana-creator-page-view";

type LinkEditorDraft = {
  id: string | null;
  title: string;
  url: string;
  icon: LinkIconKey;
  featured: boolean;
  scheduled: string;
  kind: LinkKind;
  isVisible: boolean;
};

const NEW_LINK: LinkEditorDraft = {
  id: null,
  title: "",
  url: "",
  icon: "globe",
  featured: false,
  scheduled: "",
  kind: "link",
  isVisible: true,
};

function toDraft(link: AdminCreatorPageLink): LinkEditorDraft {
  return {
    id: link.id,
    title: link.title,
    url: link.url,
    icon: ICON_OPTIONS.includes(link.icon as LinkIconKey) ? (link.icon as LinkIconKey) : "globe",
    featured: link.featured,
    scheduled: link.scheduled ?? "",
    kind: link.kind,
    isVisible: link.isVisible,
  };
}

export function AdminCreatorPageLinkManager({
  links,
  onSave,
  onVisibility,
  onReorder,
  onDelete,
}: {
  links: readonly AdminCreatorPageLink[];
  onSave: (draft: LinkEditorDraft) => Promise<void>;
  onVisibility: (linkId: string, isVisible: boolean) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onDelete: (linkId: string) => Promise<void>;
}) {
  const [ordered, setOrdered] = useState([...links]);
  const [editor, setEditor] = useState<LinkEditorDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => setOrdered([...links]), [links]);

  const run = async (key: string, operation: () => Promise<void>, fallback: string) => {
    setBusyId(key);
    setError("");
    try {
      await operation();
    } catch (caught) {
      setError(safeCreatorEditorError(caught, fallback));
      throw caught;
    } finally {
      setBusyId(null);
    }
  };

  const move = async (linkId: string, direction: "up" | "down") => {
    const currentIds = ordered.map((link) => link.id);
    const nextIds = moveCreatorLinkIds(currentIds, linkId, direction);
    if (nextIds.every((id, index) => id === currentIds[index])) return;
    const byId = new Map(ordered.map((link) => [link.id, link]));
    setOrdered(nextIds.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await run(linkId, () => onReorder(nextIds), "Couldn’t save the link order. Try again.");
    } catch {
      setOrdered([...links]);
    }
  };

  return (
    <section className="glass-strong space-y-5 rounded-3xl p-5" aria-labelledby="links-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="links-title" className="font-display text-lg font-semibold">
            Link manager
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Visible links render by position. Move controls are keyboard accessible.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setEditor({ ...NEW_LINK })}>
          <Plus className="h-3.5 w-3.5" /> Add link
        </Button>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No links yet"
          description="Add the first public destination for this creator page."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditor({ ...NEW_LINK })}
            >
              <Plus className="h-3.5 w-3.5" /> Add link
            </Button>
          }
        />
      ) : (
        <ol className="space-y-2" aria-label="Ordered creator links">
          {ordered.map((link, index) => {
            const Icon =
              LINK_ICONS[
                ICON_OPTIONS.includes(link.icon as LinkIconKey)
                  ? (link.icon as LinkIconKey)
                  : "globe"
              ];
            const busy = busyId === link.id;
            return (
              <li
                key={link.id}
                className="rounded-2xl border border-border/50 bg-white/[0.025] p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xs font-semibold tabular-nums"
                    aria-label={`Position ${index + 1}`}
                  >
                    {index + 1}
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{link.title}</p>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                        {link.kind}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="toolbar"
                      size="icon"
                      disabled={index === 0 || busyId !== null}
                      onClick={() => void move(link.id, "up")}
                      aria-label={`Move ${link.title} up`}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="toolbar"
                      size="icon"
                      disabled={index === ordered.length - 1 || busyId !== null}
                      onClick={() => void move(link.id, "down")}
                      aria-label={`Move ${link.title} down`}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="toolbar"
                      size="icon"
                      disabled={busyId !== null}
                      onClick={() =>
                        void run(
                          link.id,
                          () => onVisibility(link.id, !link.isVisible),
                          "Couldn’t update link visibility. Try again.",
                        ).catch(() => undefined)
                      }
                      aria-label={`${link.isVisible ? "Hide" : "Show"} ${link.title}`}
                    >
                      {link.isVisible ? <Eye /> : <EyeOff />}
                    </Button>
                    <Button
                      type="button"
                      variant="toolbar"
                      size="icon"
                      disabled={busyId !== null}
                      onClick={() => setEditor(toDraft(link))}
                      aria-label={`Edit ${link.title}`}
                    >
                      <Pencil />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="toolbar"
                          size="icon"
                          disabled={busyId !== null}
                          aria-label={`Delete ${link.title}`}
                        >
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{link.title}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the link from the creator page and cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              void run(
                                link.id,
                                () => onDelete(link.id),
                                "Couldn’t delete the link. Try again.",
                              ).catch(() => undefined)
                            }
                            className="[--metal-body:var(--gradient-metal-destructive)]"
                          >
                            Delete link
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <span className="sr-only" aria-live="polite">
                  {busy ? `Updating ${link.title}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {editor ? (
        <LinkEditor
          draft={editor}
          saving={busyId === (editor.id ?? "new")}
          onCancel={() => setEditor(null)}
          onSave={async (draft) => {
            await run(
              draft.id ?? "new",
              () => onSave(draft),
              `Couldn’t ${draft.id ? "save" : "create"} the link. Try again.`,
            );
            setEditor(null);
          }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function LinkEditor({
  draft: initialDraft,
  saving,
  onCancel,
  onSave,
}: {
  draft: LinkEditorDraft;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: LinkEditorDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateCreatorLinkDraft(draft);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    try {
      await onSave({
        ...draft,
        title: draft.title.trim(),
        url: normalizedCreatorLinkUrl(draft.url),
      });
    } catch {
      // The parent retains and announces the safe mapped error beside the list.
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4"
      noValidate
    >
      <h3 className="font-display text-sm font-semibold">{draft.id ? "Edit link" : "New link"}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="link-title">Title</Label>
          <Input
            id="link-title"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            aria-invalid={!!errors.title}
            maxLength={200}
          />
          {errors.title ? <p className="text-xs text-destructive">{errors.title}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="link-url">HTTP/HTTPS URL</Label>
          <Input
            id="link-url"
            type="url"
            inputMode="url"
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            aria-invalid={!!errors.url}
            placeholder="https://example.com"
            maxLength={2_048}
          />
          {errors.url ? <p className="text-xs text-destructive">{errors.url}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="link-kind">Kind</Label>
          <select
            id="link-kind"
            value={draft.kind}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value as LinkKind })}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {LINK_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="link-note">Note or schedule label</Label>
          <Input
            id="link-note"
            value={draft.scheduled}
            onChange={(event) => setDraft({ ...draft, scheduled: event.target.value })}
            maxLength={120}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Icon</legend>
        <div className="flex flex-wrap gap-1.5">
          {ICON_OPTIONS.map((icon) => {
            const Icon = LINK_ICONS[icon];
            return (
              <button
                key={icon}
                type="button"
                onClick={() => setDraft({ ...draft, icon })}
                aria-label={`${icon} icon`}
                aria-pressed={draft.icon === icon}
                className={`flex h-10 w-10 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  draft.icon === icon
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/5 text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-5">
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <Switch
            checked={draft.isVisible}
            onCheckedChange={(checked) => setDraft({ ...draft, isVisible: checked })}
            aria-label="Link visible"
          />
          Visible
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <Switch
            checked={draft.featured}
            onCheckedChange={(checked) => setDraft({ ...draft, featured: checked })}
            aria-label="Featured link"
          />
          Featured
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={saving}>
          {draft.id ? "Save link" : "Create link"}
        </Button>
      </div>
    </form>
  );
}
