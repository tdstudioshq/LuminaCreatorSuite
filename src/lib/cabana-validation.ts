/**
 * Lightweight input validation/normalization shared by creator editors.
 * Pure helpers — safe to call from any component.
 */

/** Prefix a bare host with https:// so "example.com" becomes a valid URL. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Whether `raw` is (or can be normalized to) a plausible http(s) URL. */
export function isValidHttpUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(normalizeUrl(trimmed));
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}
