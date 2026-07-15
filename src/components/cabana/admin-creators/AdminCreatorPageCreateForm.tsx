import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminCreateCreatorPage } from "@/lib/admin-creator-page-actions";
import {
  ADMIN_CREATOR_BIO_MAX,
  ADMIN_CREATOR_HEADLINE_MAX,
  ADMIN_CREATOR_NAME_MAX,
  hasValidationErrors,
  safeCreatorEditorError,
  validateCreatorIdentity,
  type CreatorIdentityDraft,
} from "@/lib/cabana-admin-creator-editor";
import { normalizeHandle } from "@/lib/cabana-creator-pages";

const EMPTY_DRAFT: CreatorIdentityDraft = {
  handle: "",
  name: "",
  headline: "",
  bio: "",
};

export function AdminCreatorPageCreateForm() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CreatorIdentityDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState(() => validateCreatorIdentity(EMPTY_DRAFT));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  const update = (field: keyof CreatorIdentityDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (submitted) {
      setErrors(validateCreatorIdentity({ ...draft, [field]: value }));
    }
    setServerError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextDraft = { ...draft, handle: normalizeHandle(draft.handle) };
    const nextErrors = validateCreatorIdentity(nextDraft);
    setDraft(nextDraft);
    setErrors(nextErrors);
    setSubmitted(true);
    setServerError("");
    if (hasValidationErrors(nextErrors)) return;

    setSaving(true);
    try {
      const created = await adminCreateCreatorPage({
        data: {
          handle: nextDraft.handle,
          displayName: nextDraft.name.trim(),
          headline: nextDraft.headline.trim(),
          bio: nextDraft.bio.trim(),
        },
      });
      await navigate({
        to: "/admin/creators/$creatorProfileId",
        params: { creatorProfileId: created.id },
        replace: true,
      });
    } catch (error) {
      setServerError(safeCreatorEditorError(error, "Couldn’t create the creator page. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link
        to="/admin/creators"
        className="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to creators
      </Link>

      <form onSubmit={submit} className="glass-strong space-y-6 rounded-3xl p-5 sm:p-7" noValidate>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FilePlus2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">Page identity</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              New pages are intentionally ownerless and saved as drafts. Assign ownership or publish
              from the editor after reviewing the page.
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Handle"
            error={submitted ? errors.handle : undefined}
            hint="cabanagrp.com/handle"
          >
            <Input
              id="creator-handle"
              name="handle"
              value={draft.handle}
              onChange={(event) => update("handle", event.target.value)}
              onBlur={() => update("handle", normalizeHandle(draft.handle))}
              aria-invalid={submitted && !!errors.handle}
              aria-describedby={errors.handle ? "creator-handle-error" : undefined}
              autoComplete="off"
              placeholder="aurora-vale"
              maxLength={64}
            />
          </Field>

          <Field label="Display name" error={submitted ? errors.name : undefined}>
            <Input
              id="creator-display-name"
              name="displayName"
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              aria-invalid={submitted && !!errors.name}
              aria-describedby={errors.name ? "creator-display-name-error" : undefined}
              autoComplete="off"
              maxLength={ADMIN_CREATOR_NAME_MAX}
            />
          </Field>

          <Field label="Headline" error={submitted ? errors.headline : undefined} optional>
            <Input
              id="creator-headline"
              name="headline"
              value={draft.headline}
              onChange={(event) => update("headline", event.target.value)}
              aria-invalid={submitted && !!errors.headline}
              aria-describedby={errors.headline ? "creator-headline-error" : undefined}
              maxLength={ADMIN_CREATOR_HEADLINE_MAX}
            />
          </Field>

          <Field label="Biography" error={submitted ? errors.bio : undefined} optional>
            <Textarea
              id="creator-biography"
              name="bio"
              value={draft.bio}
              onChange={(event) => update("bio", event.target.value)}
              aria-invalid={submitted && !!errors.bio}
              aria-describedby={errors.bio ? "creator-biography-error" : undefined}
              maxLength={ADMIN_CREATOR_BIO_MAX}
              className="min-h-28"
            />
          </Field>
        </div>

        {serverError ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {serverError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border/40 pt-5 sm:flex-row sm:justify-end">
          <Button asChild variant="outline">
            <Link to="/admin/creators">Cancel</Link>
          </Button>
          <Button type="submit" loading={saving}>
            Create draft page
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  optional = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const id = `creator-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {optional ? <span className="text-[10px] text-muted-foreground">Optional</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
