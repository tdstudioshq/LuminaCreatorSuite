import { describe, expect, it } from "vitest";
import {
  BACKGROUND_STYLES,
  BUTTON_STYLES,
  CREATOR_PAGE_THEMES,
  CREATOR_PAGE_STATUSES,
  FONT_FAMILIES,
  LINK_KINDS,
  PAGE_STATUS_ACTIONS,
  type CreatorPageStatus,
  type PageStatusAction,
  allowedPageStatusActions,
  canTransitionPageStatus,
  changedFields,
  hasHttpScheme,
  isCreatorPageStatus,
  isPageStatusAction,
  isPlausibleHandle,
  isValidAccentColor,
  isValidBackgroundStyle,
  isValidButtonStyle,
  isValidCreatorPageTheme,
  isValidFontFamily,
  isValidHttpUrl,
  isValidLinkKind,
  isUuid,
  mapCreatorPageError,
  nextPageStatus,
  normalizeHandle,
  pageStatusAuditAction,
  validateReorder,
} from "@/lib/cabana-creator-pages";

describe("page status type guards", () => {
  it("recognizes valid statuses and actions", () => {
    expect(isCreatorPageStatus("draft")).toBe(true);
    expect(isCreatorPageStatus("published")).toBe(true);
    expect(isCreatorPageStatus("nope")).toBe(false);
    expect(isCreatorPageStatus(3)).toBe(false);
    expect(isPageStatusAction("publish")).toBe(true);
    expect(isPageStatusAction("delete")).toBe(false);
    expect(isPageStatusAction(null)).toBe(false);
  });

  it("exposes the canonical constant sets", () => {
    expect(CREATOR_PAGE_STATUSES).toEqual(["draft", "published", "archived"]);
    expect(PAGE_STATUS_ACTIONS).toEqual(["publish", "unpublish", "archive", "restore"]);
  });
});

describe("nextPageStatus — mirrors the SQL transition table", () => {
  const cases: [CreatorPageStatus, PageStatusAction, CreatorPageStatus | null][] = [
    ["draft", "publish", "published"],
    ["published", "unpublish", "draft"],
    ["draft", "archive", "archived"],
    ["published", "archive", "archived"],
    ["archived", "restore", "draft"],
    // rejected / no-op / illegal
    ["published", "publish", null],
    ["draft", "unpublish", null],
    ["archived", "publish", null],
    ["archived", "archive", null],
    ["draft", "restore", null],
    ["published", "restore", null],
  ];
  it.each(cases)("%s + %s -> %s", (from, action, expected) => {
    expect(nextPageStatus(from, action)).toBe(expected);
    expect(canTransitionPageStatus(from, action)).toBe(expected !== null);
  });

  it("returns null for an unknown action", () => {
    expect(nextPageStatus("draft", "bogus" as PageStatusAction)).toBeNull();
  });

  it("lists allowed actions per status", () => {
    expect(allowedPageStatusActions("draft").sort()).toEqual(["archive", "publish"]);
    expect(allowedPageStatusActions("published").sort()).toEqual(["archive", "unpublish"]);
    expect(allowedPageStatusActions("archived")).toEqual(["restore"]);
  });
});

describe("pageStatusAuditAction", () => {
  it("maps each action to its stable audit name", () => {
    expect(pageStatusAuditAction("publish")).toBe("creator_page.published");
    expect(pageStatusAuditAction("unpublish")).toBe("creator_page.unpublished");
    expect(pageStatusAuditAction("archive")).toBe("creator_page.archived");
    expect(pageStatusAuditAction("restore")).toBe("creator_page.restored");
  });
});

describe("handles", () => {
  it("normalizes to lower+trim (matches SQL lower(btrim))", () => {
    expect(normalizeHandle("  MyHandle  ")).toBe("myhandle");
    expect(normalizeHandle("ALLCAPS")).toBe("allcaps");
  });

  it("advises on plausible handle shape", () => {
    expect(isPlausibleHandle("good_handle-1")).toBe(true);
    expect(isPlausibleHandle("  Good_Handle  ")).toBe(true); // normalized first
    expect(isPlausibleHandle("has spaces")).toBe(false);
    expect(isPlausibleHandle("emoji😀")).toBe(false);
    expect(isPlausibleHandle("")).toBe(false);
    expect(isPlausibleHandle("x".repeat(65))).toBe(false);
  });
});

describe("appearance allow-lists", () => {
  it("validates font families", () => {
    for (const f of FONT_FAMILIES) expect(isValidFontFamily(f)).toBe(true);
    expect(isValidFontFamily("comic-sans")).toBe(false);
    expect(isValidFontFamily(42)).toBe(false);
  });
  it("validates background styles", () => {
    for (const b of BACKGROUND_STYLES) expect(isValidBackgroundStyle(b)).toBe(true);
    expect(isValidBackgroundStyle("plaid")).toBe(false);
    expect(isValidBackgroundStyle(null)).toBe(false);
  });
  it("validates button styles", () => {
    for (const b of BUTTON_STYLES) expect(isValidButtonStyle(b)).toBe(true);
    expect(isValidButtonStyle("hexagon")).toBe(false);
    expect(isValidButtonStyle(undefined)).toBe(false);
  });
  it("validates the existing creator themes", () => {
    for (const theme of CREATOR_PAGE_THEMES) expect(isValidCreatorPageTheme(theme)).toBe(true);
    expect(isValidCreatorPageTheme("arbitrary-css")).toBe(false);
  });
  it("validates accent color (empty or 6-digit hex)", () => {
    expect(isValidAccentColor("")).toBe(true);
    expect(isValidAccentColor("#c084fc")).toBe(true);
    expect(isValidAccentColor("#ABC123")).toBe(true);
    expect(isValidAccentColor("#abc")).toBe(false);
    expect(isValidAccentColor("c084fc")).toBe(false);
    expect(isValidAccentColor(0xffffff)).toBe(false);
  });
});

describe("link kind + url scheme", () => {
  it("validates link kinds", () => {
    for (const k of LINK_KINDS) expect(isValidLinkKind(k)).toBe(true);
    expect(isValidLinkKind("button")).toBe(false);
    expect(isValidLinkKind(1)).toBe(false);
  });

  it("accepts http/https prefixes incl. the placeholder, rejects the rest", () => {
    expect(hasHttpScheme("https://example.com")).toBe(true);
    expect(hasHttpScheme("http://example.com")).toBe(true);
    expect(hasHttpScheme("HTTPS://EXAMPLE.COM")).toBe(true);
    expect(hasHttpScheme("https://")).toBe(true); // placeholder
    expect(hasHttpScheme("javascript:alert(1)")).toBe(false);
    expect(hasHttpScheme("data:text/html,x")).toBe(false);
    expect(hasHttpScheme("vbscript:x")).toBe(false);
    expect(hasHttpScheme("ftp://example.com")).toBe(false);
    expect(hasHttpScheme("//example.com")).toBe(false);
    expect(hasHttpScheme("just text")).toBe(false);
    expect(hasHttpScheme(123)).toBe(false);
  });

  it("strictly validates editor URLs and account ids", () => {
    expect(isValidHttpUrl("https://example.com/path")).toBe(true);
    expect(isValidHttpUrl("http://127.0.0.1:8080/path")).toBe(true);
    expect(isValidHttpUrl("https://")).toBe(false);
    expect(isValidHttpUrl("example.com")).toBe(false);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("https://user:secret@example.com")).toBe(false);
    expect(isUuid("0a000000-0000-4000-a000-000000000001")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("validateReorder", () => {
  it("accepts an exact permutation of the page's links", () => {
    expect(validateReorder(["b", "a", "c"], ["a", "b", "c"])).toEqual({ ok: true });
  });
  it("rejects empty", () => {
    expect(validateReorder([], ["a"])).toEqual({ ok: false, reason: "No links provided" });
  });
  it("rejects duplicates", () => {
    const r = validateReorder(["a", "a"], ["a", "b"]);
    expect(r).toEqual({ ok: false, reason: "Duplicate link ids" });
  });
  it("rejects a foreign id", () => {
    const r = validateReorder(["a", "z"], ["a", "b"]);
    expect(r).toEqual({ ok: false, reason: "Ordered list contains links not on this page" });
  });
  it("rejects a partial list (missing ids)", () => {
    const r = validateReorder(["a"], ["a", "b"]);
    expect(r).toEqual({ ok: false, reason: "Ordered list must contain exactly the page's links" });
  });
});

describe("changedFields", () => {
  it("returns only the fields present in `after` that differ", () => {
    const before = { name: "A", bio: "x", headline: "h" };
    const after = { name: "B", bio: "x" }; // headline omitted (unchanged), bio equal
    expect(changedFields(before, after, ["name", "bio", "headline"])).toEqual(["name"]);
  });
  it("returns empty when nothing changed", () => {
    const before = { name: "A" };
    expect(changedFields(before, {}, ["name"])).toEqual([]);
    expect(changedFields(before, { name: "A" }, ["name"])).toEqual([]);
  });
});

describe("mapCreatorPageError", () => {
  it("maps by SQLSTATE code", () => {
    expect(mapCreatorPageError({ code: "23505" })).toBe("That handle is already taken.");
    expect(mapCreatorPageError({ code: "42501" })).toBe(
      "You are not authorized to perform this action.",
    );
    expect(mapCreatorPageError({ code: "P0002" })).toBe("That item could not be found.");
    expect(mapCreatorPageError({ code: "23514", message: "Invalid font_family" })).toBe(
      "Invalid font family.",
    );
    expect(mapCreatorPageError({ code: "23514" })).toBe("That change is not allowed.");
  });

  it("falls back to message inspection", () => {
    expect(mapCreatorPageError("That handle is already taken")).toBe(
      "That handle is already taken.",
    );
    expect(mapCreatorPageError({ message: "Admin role required" })).toBe(
      "You are not authorized to perform this action.",
    );
    expect(mapCreatorPageError({ message: "Creator page not found" })).toBe(
      "That item could not be found.",
    );
    expect(mapCreatorPageError({ message: "Handle admin is reserved" })).toBe(
      "That handle is reserved.",
    );
    expect(
      mapCreatorPageError({ message: "Destination account already owns a creator page" }),
    ).toBe("That creator account already owns a page.");
    expect(mapCreatorPageError({ message: "weird boom with private SQL" })).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("handles null/undefined/empty safely", () => {
    expect(mapCreatorPageError(null)).toBe("Something went wrong. Please try again.");
    expect(mapCreatorPageError(undefined)).toBe("Something went wrong. Please try again.");
    expect(mapCreatorPageError({})).toBe("Something went wrong. Please try again.");
  });
});
