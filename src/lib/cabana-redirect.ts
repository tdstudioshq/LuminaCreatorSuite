/**
 * Safe post-auth redirect handling. Pure -- no React/router dependency, so it is
 * unit-tested in the 95% coverage set.
 *
 * The login surfaces read a `?redirect=<path>` query param and navigate to it
 * after sign-in. Every in-app caller writes an INTERNAL path, but the param is
 * attacker-controllable, so it must be sanitized to a same-origin absolute path
 * before it reaches `navigate({ to })` -- otherwise a crafted value is an
 * open-redirect / phishing vector.
 */

/** Where a missing or rejected redirect target lands. */
export const DEFAULT_REDIRECT = "/dashboard";

/** True if the value carries any ASCII control character (0x00-0x1F) or DEL (0x7F). */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Returns `raw` only when it is a safe same-origin absolute path; otherwise
 * `fallback` (default `/dashboard`).
 *
 * Accepted: a string beginning with exactly one "/" and containing no control
 * characters, whitespace, or backslashes -- e.g. "/dashboard",
 * "/dashboard/earnings", "/post/123?tab=media".
 *
 * Rejected (fall back): protocol-relative "//host", backslash tricks "/\\host"
 * (browsers normalize "\" to "/"), absolute URLs ("https://evil.com"), scheme
 * URIs ("javascript:...", "data:..."), any value not starting with "/", and any
 * value carrying control/whitespace/backslash characters.
 */
export function sanitizeRedirect(
  raw: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (typeof raw !== "string") return fallback;
  if (raw.length === 0) return fallback;
  // Must be an absolute internal path.
  if (raw[0] !== "/") return fallback;
  // Reject "//host" (protocol-relative) and "/\host" (backslash normalizes to /).
  if (raw[1] === "/" || raw[1] === "\\") return fallback;
  // No whitespace, backslash, or control characters anywhere.
  if (/\s/.test(raw) || raw.includes("\\") || hasControlChar(raw)) return fallback;
  return raw;
}
