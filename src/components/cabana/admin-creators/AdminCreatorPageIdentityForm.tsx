import { useState, type FormEvent } from "react";
import { useBlocker } from "@tanstack/react-router";
import { CheckCircle2, Image, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_CREATOR_BIO_MAX,
  ADMIN_CREATOR_HEADLINE_MAX,
  ADMIN_CREATOR_NAME_MAX,
  hasValidationErrors,
  safeCreatorEditorError,
  validateCreatorIdentity,
} from "@/lib/cabana-admin-creator-editor";
import {
  BACKGROUND_STYLES,
  BUTTON_STYLES,
  FONT_FAMILIES,
  isValidAccentColor,
  normalizeHandle,
} from "@/lib/cabana-creator-pages";
import { CABANA_THEMES } from "@/lib/cabana-creator-page-view";
import { isValidHttpUrl, normalizeUrl } from "@/lib/cabana-validation";

export type AdminCreatorPageEditorDraft = {
  handle: string;
  name: string;
  bio: string;
  headline: string;
  avatarUrl: string;
  bannerUrl: string;
  theme: (typeof CABANA_THEMES)[number];
  accentColor: string;
  buttonStyle: (typeof BUTTON_STYLES)[number];
  fontFamily: (typeof FONT_FAMILIES)[number];
  backgroundStyle: (typeof BACKGROUND_STYLES)[number];
};

type DraftErrors = Partial<Record<keyof AdminCreatorPageEditorDraft, string>>;

function validateDraft(draft: AdminCreatorPageEditorDraft): DraftErrors {
  const errors: DraftErrors = validateCreatorIdentity(draft);
  if (draft.avatarUrl.trim() && !isValidHttpUrl(draft.avatarUrl)) {
    errors.avatarUrl = "Enter a complete HTTP or HTTPS image URL.";
  }
  if (draft.bannerUrl.trim() && !isValidHttpUrl(draft.bannerUrl)) {
    errors.bannerUrl = "Enter a complete HTTP or HTTPS image URL.";
  }
  if (!isValidAccentColor(draft.accentColor)) {
    errors.accentColor = "Use a six-digit hex color, such as #7c3aed.";
  }
  return errors;
}

function normalizeDraft(draft: AdminCreatorPageEditorDraft): AdminCreatorPageEditorDraft {
  return {
    ...draft,
    handle: normalizeHandle(draft.handle),
    name: draft.name.trim(),
    headline: draft.headline.trim(),
    bio: draft.bio.trim(),
    avatarUrl: draft.avatarUrl.trim() ? normalizeUrl(draft.avatarUrl) : "",
    bannerUrl: draft.bannerUrl.trim() ? normalizeUrl(draft.bannerUrl) : "",
    accentColor: draft.accentColor.trim(),
  };
}

export function AdminCreatorPageIdentityForm({
  initialValue,
  onDraftChange,
  onSave,
}: {
  initialValue: AdminCreatorPageEditorDraft;
  onDraftChange: (draft: AdminCreatorPageEditorDraft) => void;
  onSave: (draft: AdminCreatorPageEditorDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm("Discard your unsaved creator-page changes?"),
    enableBeforeUnload: dirty,
  });

  const update = <Key extends keyof AdminCreatorPageEditorDraft>(
    key: Key,
    value: AdminCreatorPageEditorDraft[Key],
  ) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onDraftChange(next);
    setErrors((current) => ({ ...current, [key]: undefined }));
    setServerError("");
    setSuccess(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = normalizeDraft(draft);
    const nextErrors = validateDraft(next);
    setDraft(next);
    onDraftChange(next);
    setErrors(nextErrors);
    setServerError("");
    setSuccess(false);
    if (hasValidationErrors(nextErrors)) return;

    setSaving(true);
    try {
      await onSave(next);
      setSaved(next);
      setSuccess(true);
    } catch (error) {
      setServerError(safeCreatorEditorError(error, "Couldn’t save the creator page. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass-strong space-y-7 rounded-3xl p-5 sm:p-7" noValidate>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Identity and appearance</p>
          <h2 className="mt-2 font-display text-xl font-semibold">Creator page</h2>
        </div>
        <div className="flex items-center gap-3">
          {dirty ? <span className="text-xs text-amber-300">Unsaved changes</span> : null}
          {success ? (
            <span
              className="inline-flex items-center gap-1.5 text-xs text-emerald-300"
              role="status"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          ) : null}
          <Button type="submit" size="sm" loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </div>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Creator identity</legend>
        <EditorField label="Handle" htmlFor="editor-handle" error={errors.handle}>
          <Input
            id="editor-handle"
            value={draft.handle}
            onChange={(event) => update("handle", event.target.value)}
            aria-invalid={!!errors.handle}
            maxLength={64}
          />
        </EditorField>
        <EditorField label="Display name" htmlFor="editor-name" error={errors.name}>
          <Input
            id="editor-name"
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
            aria-invalid={!!errors.name}
            maxLength={ADMIN_CREATOR_NAME_MAX}
          />
        </EditorField>
        <EditorField label="Headline" htmlFor="editor-headline" error={errors.headline} optional>
          <Input
            id="editor-headline"
            value={draft.headline}
            onChange={(event) => update("headline", event.target.value)}
            aria-invalid={!!errors.headline}
            maxLength={ADMIN_CREATOR_HEADLINE_MAX}
          />
        </EditorField>
        <EditorField label="Biography" htmlFor="editor-bio" error={errors.bio} optional>
          <Textarea
            id="editor-bio"
            value={draft.bio}
            onChange={(event) => update("bio", event.target.value)}
            aria-invalid={!!errors.bio}
            maxLength={ADMIN_CREATOR_BIO_MAX}
            className="min-h-28"
          />
        </EditorField>
      </fieldset>

      <fieldset className="space-y-5 border-t border-border/40 pt-6">
        <legend className="flex items-center gap-2 font-display text-sm font-semibold">
          <Image className="h-4 w-4 text-primary" /> Media
        </legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <EditorField label="Avatar URL" htmlFor="editor-avatar" error={errors.avatarUrl} optional>
            <Input
              id="editor-avatar"
              type="url"
              inputMode="url"
              value={draft.avatarUrl}
              onChange={(event) => update("avatarUrl", event.target.value)}
              aria-invalid={!!errors.avatarUrl}
              placeholder="https://…"
            />
          </EditorField>
          <EditorField label="Banner URL" htmlFor="editor-banner" error={errors.bannerUrl} optional>
            <Input
              id="editor-banner"
              type="url"
              inputMode="url"
              value={draft.bannerUrl}
              onChange={(event) => update("bannerUrl", event.target.value)}
              aria-invalid={!!errors.bannerUrl}
              placeholder="https://…"
            />
          </EditorField>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-border/40 pt-6">
        <legend className="flex items-center gap-2 font-display text-sm font-semibold">
          <Palette className="h-4 w-4 text-primary" /> Appearance
        </legend>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <EditorSelect
            id="editor-theme"
            label="Theme"
            value={draft.theme}
            options={CABANA_THEMES}
            onChange={(value) => update("theme", value as AdminCreatorPageEditorDraft["theme"])}
          />
          <EditorSelect
            id="editor-button-style"
            label="Button style"
            value={draft.buttonStyle}
            options={BUTTON_STYLES}
            onChange={(value) =>
              update("buttonStyle", value as AdminCreatorPageEditorDraft["buttonStyle"])
            }
          />
          <EditorSelect
            id="editor-font-family"
            label="Font family"
            value={draft.fontFamily}
            options={FONT_FAMILIES}
            onChange={(value) =>
              update("fontFamily", value as AdminCreatorPageEditorDraft["fontFamily"])
            }
          />
          <EditorSelect
            id="editor-background-style"
            label="Background"
            value={draft.backgroundStyle}
            options={BACKGROUND_STYLES}
            onChange={(value) =>
              update("backgroundStyle", value as AdminCreatorPageEditorDraft["backgroundStyle"])
            }
          />
          <EditorField
            label="Accent color"
            htmlFor="editor-accent"
            error={errors.accentColor}
            optional
          >
            <div className="flex gap-2">
              <Input
                id="editor-accent"
                value={draft.accentColor}
                onChange={(event) => update("accentColor", event.target.value)}
                aria-invalid={!!errors.accentColor}
                placeholder="#7c3aed"
                maxLength={7}
              />
              <input
                type="color"
                value={draft.accentColor || "#7c3aed"}
                onChange={(event) => update("accentColor", event.target.value)}
                aria-label="Choose accent color"
                className="h-9 w-12 rounded-md border border-input bg-transparent p-1"
              />
            </div>
          </EditorField>
        </div>
      </fieldset>

      {serverError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {serverError}
        </p>
      ) : null}
    </form>
  );
}

function EditorField({
  label,
  htmlFor,
  error,
  optional = false,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? <span className="text-[10px] text-muted-foreground">Optional</span> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function EditorSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}
