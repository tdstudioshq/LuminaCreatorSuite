import {
  isPlausibleHandle,
  normalizeHandle,
  type PageStatusAction,
} from "@/lib/cabana-creator-pages";
import { isValidHttpUrl, normalizeUrl } from "@/lib/cabana-validation";

export const ADMIN_CREATOR_NAME_MAX = 120;
export const ADMIN_CREATOR_HEADLINE_MAX = 160;
export const ADMIN_CREATOR_BIO_MAX = 2_000;

export type CreatorIdentityDraft = {
  handle: string;
  name: string;
  headline: string;
  bio: string;
};

export type CreatorIdentityErrors = Partial<Record<keyof CreatorIdentityDraft, string>>;

export function validateCreatorIdentity(draft: CreatorIdentityDraft): CreatorIdentityErrors {
  const errors: CreatorIdentityErrors = {};
  const handle = normalizeHandle(draft.handle);
  const name = draft.name.trim();

  if (!handle) errors.handle = "Handle is required.";
  else if (!isPlausibleHandle(handle)) {
    errors.handle = "Use 1–64 lowercase letters, numbers, hyphens, or underscores.";
  }
  if (!name) errors.name = "Display name is required.";
  else if (name.length > ADMIN_CREATOR_NAME_MAX) {
    errors.name = `Display name must be ${ADMIN_CREATOR_NAME_MAX} characters or fewer.`;
  }
  if (draft.headline.trim().length > ADMIN_CREATOR_HEADLINE_MAX) {
    errors.headline = `Headline must be ${ADMIN_CREATOR_HEADLINE_MAX} characters or fewer.`;
  }
  if (draft.bio.trim().length > ADMIN_CREATOR_BIO_MAX) {
    errors.bio = `Biography must be ${ADMIN_CREATOR_BIO_MAX.toLocaleString()} characters or fewer.`;
  }
  return errors;
}

export function hasValidationErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}

/** UI boundary: only pass through deliberate action messages, never raw database details. */
export function safeCreatorEditorError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  const lower = message.toLowerCase();
  if (lower.includes("already taken")) return "That handle is already taken.";
  if (lower.includes("reserved") && lower.includes("handle")) return "That handle is reserved.";
  if (
    lower.includes("destination account already owns") ||
    lower.includes("creator account already owns a page")
  ) {
    return "That creator account already owns a creator page.";
  }
  if (
    lower.includes("not a valid creator account") ||
    lower.includes("not eligible to own a creator page")
  ) {
    return "That UUID does not identify an eligible creator account.";
  }
  if (lower.includes("not authorized")) return "You are not authorized to perform this action.";
  if (lower.includes("status change is not allowed")) return "That status change is not allowed.";
  if (lower.includes("could not be found") || lower.includes("not found")) {
    return "The requested creator-page record could not be found.";
  }
  if (/^(handle|display name|link title|link url) .+\.$/i.test(message)) return message;
  if (
    /^invalid (font family|background style|button style|status action|link kind)\.$/i.test(message)
  ) {
    return message;
  }
  if (/^link url must start with http:\/\/ or https:\/\/\.$/i.test(message)) return message;
  return fallback;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCreatorAccountId(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidCreatorAccountId(value: string): boolean {
  return UUID_PATTERN.test(normalizeCreatorAccountId(value));
}

export type CreatorLinkDraft = {
  title: string;
  url: string;
  kind: "link" | "header" | "social" | "embed";
};

export type CreatorLinkDraftErrors = Partial<Record<keyof CreatorLinkDraft, string>>;

export function validateCreatorLinkDraft(draft: CreatorLinkDraft): CreatorLinkDraftErrors {
  const errors: CreatorLinkDraftErrors = {};
  if (!draft.title.trim()) errors.title = "Link title is required.";
  if (!draft.url.trim()) errors.url = "Link URL is required.";
  else if (!isValidHttpUrl(draft.url)) errors.url = "Enter a complete HTTP or HTTPS URL.";
  return errors;
}

export function normalizedCreatorLinkUrl(value: string): string {
  return normalizeUrl(value);
}

export function moveCreatorLinkIds(
  ids: readonly string[],
  id: string,
  direction: "up" | "down",
): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export const STATUS_ACTION_COPY: Record<
  PageStatusAction,
  { label: string; confirmTitle: string; confirmDescription: string; destructive: boolean }
> = {
  publish: {
    label: "Publish",
    confirmTitle: "Publish this creator page?",
    confirmDescription: "The page will become visible at its public URL.",
    destructive: false,
  },
  unpublish: {
    label: "Unpublish",
    confirmTitle: "Unpublish this creator page?",
    confirmDescription: "The public URL will stop showing this page until it is published again.",
    destructive: true,
  },
  archive: {
    label: "Archive",
    confirmTitle: "Archive this creator page?",
    confirmDescription: "The page will be hidden publicly and must be restored before publishing.",
    destructive: true,
  },
  restore: {
    label: "Restore to draft",
    confirmTitle: "Restore this creator page?",
    confirmDescription: "The page will return to draft and remain hidden until it is published.",
    destructive: false,
  },
};
