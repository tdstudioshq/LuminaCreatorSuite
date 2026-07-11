import { describe, it, expect } from "vitest";
import { sanitizeRedirect, DEFAULT_REDIRECT } from "./cabana-redirect";

describe("sanitizeRedirect", () => {
  it("returns safe internal absolute paths unchanged", () => {
    expect(sanitizeRedirect("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirect("/dashboard/earnings")).toBe("/dashboard/earnings");
    expect(sanitizeRedirect("/post/123?tab=media")).toBe("/post/123?tab=media");
    expect(sanitizeRedirect("/dashboard-home")).toBe("/dashboard-home"); // hyphens allowed
    expect(sanitizeRedirect("/a#section")).toBe("/a#section");
  });

  it("falls back for missing / non-string input", () => {
    expect(sanitizeRedirect(null)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect(undefined)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("")).toBe(DEFAULT_REDIRECT);
    // @ts-expect-error exercising the runtime guard for non-string input
    expect(sanitizeRedirect(42)).toBe(DEFAULT_REDIRECT);
  });

  it("rejects absolute URLs and scheme URIs", () => {
    expect(sanitizeRedirect("https://evil.com")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("http://evil.com")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("javascript:alert(1)")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("data:text/html,evil")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("mailto:x@y.com")).toBe(DEFAULT_REDIRECT);
  });

  it("rejects protocol-relative and backslash-slash bypasses", () => {
    expect(sanitizeRedirect("//evil.com")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("/\\evil.com")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("/\\/evil.com")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("\\/evil.com")).toBe(DEFAULT_REDIRECT); // no leading slash
  });

  it("rejects paths carrying whitespace, backslashes, or control characters", () => {
    const nul = String.fromCharCode(0);
    const del = String.fromCharCode(0x7f);
    expect(sanitizeRedirect("/dash board")).toBe(DEFAULT_REDIRECT); // space
    expect(sanitizeRedirect("/dash\tboard")).toBe(DEFAULT_REDIRECT); // tab
    expect(sanitizeRedirect("/dash\nboard")).toBe(DEFAULT_REDIRECT); // newline
    expect(sanitizeRedirect("/a\\b")).toBe(DEFAULT_REDIRECT); // backslash
    expect(sanitizeRedirect(`/a${nul}b`)).toBe(DEFAULT_REDIRECT); // NUL control char
    expect(sanitizeRedirect(`/a${del}b`)).toBe(DEFAULT_REDIRECT); // DEL control char
  });

  it("honors a custom fallback", () => {
    expect(sanitizeRedirect("https://evil.com", "/account")).toBe("/account");
    expect(sanitizeRedirect(null, "/account")).toBe("/account");
    expect(sanitizeRedirect("/feed", "/account")).toBe("/feed");
  });
});
