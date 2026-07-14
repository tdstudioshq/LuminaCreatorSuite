import { describe, expect, it } from "vitest";
import {
  ADMIN_CREATORS_MAX_PAGE_SIZE,
  ADMIN_CREATORS_PAGE_SIZE,
  ADMIN_CREATORS_SEARCH_MAX,
  type CreatorProfileRow,
  buildSearchFilter,
  countLinksByProfile,
  creatorExcerpt,
  formatCreatedAt,
  isClaimFilter,
  mapAdminCreatorPage,
  mapAdminCreatorRow,
  normalizeAdminCreatorsQuery,
  publicCreatorPath,
  publicCreatorUrl,
  rangeForPage,
  sanitizeSearchTerm,
  summarizeAdminCreatorsPage,
} from "@/lib/cabana-admin-creators";

function row(over: Partial<CreatorProfileRow> = {}): CreatorProfileRow {
  return {
    id: "p1",
    user_id: "u1",
    handle: "aurora",
    name: "Aurora Vale",
    bio: "Ambient composer",
    headline: "Sound design studio",
    avatar_url: "https://cdn.example/a.png",
    theme: "iridescent",
    button_style: "pill",
    accent_color: "#ff00aa",
    plan: "free",
    created_at: "2026-03-04T12:00:00.000Z",
    ...over,
  };
}

describe("claim filter", () => {
  it("accepts only the three known values", () => {
    expect(isClaimFilter("all")).toBe(true);
    expect(isClaimFilter("claimed")).toBe(true);
    expect(isClaimFilter("unclaimed")).toBe(true);
    expect(isClaimFilter("admin")).toBe(false);
    expect(isClaimFilter(null)).toBe(false);
    expect(isClaimFilter(7)).toBe(false);
  });
});

describe("normalizeAdminCreatorsQuery", () => {
  it("defaults an empty query", () => {
    expect(normalizeAdminCreatorsQuery({})).toEqual({
      page: 0,
      pageSize: ADMIN_CREATORS_PAGE_SIZE,
      search: "",
      claimed: "all",
    });
  });

  it("clamps a negative page to zero and truncates fractions", () => {
    expect(normalizeAdminCreatorsQuery({ page: -5 }).page).toBe(0);
    expect(normalizeAdminCreatorsQuery({ page: 3.9 }).page).toBe(3);
  });

  it("clamps pageSize into [1, max] — a hostile caller cannot request the whole table", () => {
    expect(normalizeAdminCreatorsQuery({ pageSize: 100000 }).pageSize).toBe(
      ADMIN_CREATORS_MAX_PAGE_SIZE,
    );
    expect(normalizeAdminCreatorsQuery({ pageSize: 0 }).pageSize).toBe(1);
    expect(normalizeAdminCreatorsQuery({ pageSize: -3 }).pageSize).toBe(1);
  });

  it("ignores non-finite and non-numeric page inputs", () => {
    expect(normalizeAdminCreatorsQuery({ page: Number.NaN }).page).toBe(0);
    expect(normalizeAdminCreatorsQuery({ page: "2" }).page).toBe(0);
    expect(normalizeAdminCreatorsQuery({ pageSize: Number.POSITIVE_INFINITY }).pageSize).toBe(
      ADMIN_CREATORS_PAGE_SIZE,
    );
    expect(normalizeAdminCreatorsQuery({ pageSize: "50" }).pageSize).toBe(ADMIN_CREATORS_PAGE_SIZE);
  });

  it("falls back to 'all' for an unknown claim filter", () => {
    expect(normalizeAdminCreatorsQuery({ claimed: "banned" }).claimed).toBe("all");
    expect(normalizeAdminCreatorsQuery({ claimed: "unclaimed" }).claimed).toBe("unclaimed");
  });
});

describe("sanitizeSearchTerm — PostgREST filter-injection defense", () => {
  it("strips the characters that would change the or=() filter", () => {
    // A comma would append a NEW disjunct; parens would open a group.
    expect(sanitizeSearchTerm("a,b")).toBe("a b");
    expect(sanitizeSearchTerm("x(or)y")).toBe("x or y");
    expect(sanitizeSearchTerm("handle.ilike.*")).toBe("handle ilike");
  });

  it("strips ILIKE wildcards so a term cannot match everything", () => {
    expect(sanitizeSearchTerm("*")).toBe("");
    expect(sanitizeSearchTerm("%")).toBe("");
    expect(sanitizeSearchTerm("a%b*c")).toBe("a b c");
  });

  it("strips quotes and backslashes", () => {
    expect(sanitizeSearchTerm(`"a'b\\c`)).toBe("a b c");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeSearchTerm("  aurora   vale  ")).toBe("aurora vale");
  });

  it("caps the term length", () => {
    const long = "a".repeat(500);
    expect(sanitizeSearchTerm(long)).toHaveLength(ADMIN_CREATORS_SEARCH_MAX);
  });

  it("returns empty for non-strings", () => {
    expect(sanitizeSearchTerm(null)).toBe("");
    expect(sanitizeSearchTerm(42)).toBe("");
    expect(sanitizeSearchTerm(undefined)).toBe("");
  });
});

describe("buildSearchFilter", () => {
  it("is null when there is nothing to search for (no match-everything filter)", () => {
    expect(buildSearchFilter("")).toBeNull();
    expect(buildSearchFilter("   ")).toBeNull();
    expect(buildSearchFilter("%*")).toBeNull();
  });

  it("searches handle and name, with the sanitized term", () => {
    expect(buildSearchFilter("aurora")).toBe("handle.ilike.*aurora*,name.ilike.*aurora*");
  });

  it("cannot be used to inject an extra disjunct", () => {
    const filter = buildSearchFilter("x,plan.eq.enterprise");
    // The comma is gone, so the payload stays a single search term.
    expect(filter).toBe("handle.ilike.*x plan eq enterprise*,name.ilike.*x plan eq enterprise*");
    expect(filter?.split(",")).toHaveLength(2);
  });
});

describe("rangeForPage", () => {
  it("produces the inclusive window PostgREST expects", () => {
    expect(rangeForPage(0, 25)).toEqual({ from: 0, to: 24 });
    expect(rangeForPage(1, 25)).toEqual({ from: 25, to: 49 });
    expect(rangeForPage(3, 10)).toEqual({ from: 30, to: 39 });
  });
});

describe("creatorExcerpt", () => {
  it("prefers the headline", () => {
    expect(creatorExcerpt("Sound design", "A long bio")).toBe("Sound design");
  });

  it("falls back to the bio when there is no headline", () => {
    expect(creatorExcerpt("", "A long bio")).toBe("A long bio");
    expect(creatorExcerpt(null, "A long bio")).toBe("A long bio");
  });

  it("collapses bio whitespace", () => {
    expect(creatorExcerpt(null, "line one\n\n  line two")).toBe("line one line two");
  });

  it("returns empty rather than inventing copy", () => {
    expect(creatorExcerpt(null, null)).toBe("");
    expect(creatorExcerpt("  ", "  ")).toBe("");
  });

  it("truncates with an ellipsis", () => {
    const out = creatorExcerpt("x".repeat(200), null, 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("public url", () => {
  it("builds the path and the display url", () => {
    expect(publicCreatorPath("aurora")).toBe("/aurora");
    expect(publicCreatorUrl("aurora")).toBe("cabanagrp.com/aurora");
  });
});

describe("mapAdminCreatorRow", () => {
  it("derives claimed from user_id and DROPS user_id from the wire shape", () => {
    const mapped = mapAdminCreatorRow(row({ user_id: "u1" }));
    expect(mapped.claimed).toBe(true);
    expect(Object.keys(mapped)).not.toContain("user_id");
    expect(JSON.stringify(mapped)).not.toContain("u1");
  });

  it("treats a null user_id as unclaimed", () => {
    expect(mapAdminCreatorRow(row({ user_id: null })).claimed).toBe(false);
  });

  it("never exposes an email field", () => {
    expect(Object.keys(mapAdminCreatorRow(row()))).not.toContain("email");
  });

  it("falls back to the handle when the display name is blank", () => {
    expect(mapAdminCreatorRow(row({ name: "  " })).displayName).toBe("aurora");
    expect(mapAdminCreatorRow(row({ name: null })).displayName).toBe("aurora");
  });

  it("defaults theme, button style and plan rather than rendering blanks", () => {
    const mapped = mapAdminCreatorRow(row({ theme: null, button_style: null, plan: null }));
    expect(mapped.theme).toBe("iridescent");
    expect(mapped.buttonStyle).toBe("rounded");
    expect(mapped.plan).toBe("free");
  });

  it("keeps an empty accent colour empty (means: use the theme default)", () => {
    expect(mapAdminCreatorRow(row({ accent_color: null })).accentColor).toBe("");
  });

  it("carries the link count through", () => {
    expect(mapAdminCreatorRow(row(), 4).linkCount).toBe(4);
    expect(mapAdminCreatorRow(row()).linkCount).toBe(0);
  });
});

describe("countLinksByProfile / mapAdminCreatorPage", () => {
  it("counts links per profile", () => {
    const counts = countLinksByProfile([
      { profile_id: "p1" },
      { profile_id: "p1" },
      { profile_id: "p2" },
    ]);
    expect(counts.get("p1")).toBe(2);
    expect(counts.get("p2")).toBe(1);
    expect(counts.get("p3")).toBeUndefined();
  });

  it("joins counts onto the page, defaulting missing profiles to zero", () => {
    const page = mapAdminCreatorPage(
      [row({ id: "p1" }), row({ id: "p2", handle: "mira" })],
      [{ profile_id: "p1" }, { profile_id: "p1" }],
    );
    expect(page[0].linkCount).toBe(2);
    expect(page[1].linkCount).toBe(0);
  });
});

describe("summarizeAdminCreatorsPage", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => mapAdminCreatorRow(row({ id: `p${i}` })));

  it("summarizes a full first page", () => {
    const s = summarizeAdminCreatorsPage({ rows: rows(25), total: 84, page: 0, pageSize: 25 });
    expect(s.label).toBe("1–25 of 84");
    expect(s.firstIndex).toBe(1);
    expect(s.lastIndex).toBe(25);
    expect(s.pageCount).toBe(4);
    expect(s.hasPrev).toBe(false);
    expect(s.hasNext).toBe(true);
    expect(s.isEmpty).toBe(false);
  });

  it("summarizes a partial last page", () => {
    const s = summarizeAdminCreatorsPage({ rows: rows(9), total: 84, page: 3, pageSize: 25 });
    expect(s.label).toBe("76–84 of 84");
    expect(s.hasPrev).toBe(true);
    expect(s.hasNext).toBe(false);
  });

  it("never invents a total when the count is unavailable", () => {
    const s = summarizeAdminCreatorsPage({ rows: rows(25), total: null, page: 0, pageSize: 25 });
    expect(s.label).toBe("1–25");
    expect(s.total).toBeNull();
    expect(s.pageCount).toBeNull();
    // Falls back to "the page came back full" rather than guessing.
    expect(s.hasNext).toBe(true);
  });

  it("stops paging when an uncounted page comes back short", () => {
    const s = summarizeAdminCreatorsPage({ rows: rows(7), total: null, page: 1, pageSize: 25 });
    expect(s.hasNext).toBe(false);
    expect(s.hasPrev).toBe(true);
  });

  it("handles the empty page", () => {
    const s = summarizeAdminCreatorsPage({ rows: [], total: 0, page: 0, pageSize: 25 });
    expect(s.isEmpty).toBe(true);
    expect(s.firstIndex).toBe(0);
    expect(s.lastIndex).toBe(0);
    expect(s.label).toBe("0 of 0");
    expect(s.hasNext).toBe(false);
    expect(s.pageCount).toBe(1);
  });

  it("handles an empty page with no count", () => {
    const s = summarizeAdminCreatorsPage({ rows: [], total: null, page: 0, pageSize: 25 });
    expect(s.label).toBe("No creators");
    expect(s.isEmpty).toBe(true);
  });
});

describe("formatCreatedAt", () => {
  it("formats in UTC, not the viewer's timezone", () => {
    expect(formatCreatedAt("2026-03-04T12:00:00.000Z")).toBe("Mar 4, 2026");
  });

  it("does not roll the date backwards for a late-UTC timestamp", () => {
    expect(formatCreatedAt("2026-03-04T23:59:00.000Z")).toBe("Mar 4, 2026");
  });

  it("degrades safely on an unparseable value", () => {
    expect(formatCreatedAt("not-a-date")).toBe("—");
  });
});
