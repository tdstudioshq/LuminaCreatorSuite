import { describe, expect, it } from "vitest";
import {
  ADMIN_CREATOR_PAGE_AUDIT_DEFAULT_LIMIT,
  type AdminCreatorPageAuditRow,
  type AdminCreatorPageLinkRow,
  type AdminCreatorPageRow,
  mapAdminCreatorPageAuditItem,
  mapAdminCreatorPageDetail,
  mapAdminCreatorPageReadError,
  normalizeAdminCreatorPageAuditInput,
  normalizeAdminCreatorPageDetailInput,
  normalizeCreatorProfileId,
} from "@/lib/cabana-admin-creator-page-detail";

const PAGE_ID = "0a000000-0000-4000-8000-000000000001";
const OWNER_ID = "0a000000-0000-4000-8000-000000000002";
const LINK_A = "0a000000-0000-4000-8000-000000000003";
const LINK_B = "0a000000-0000-4000-8000-000000000004";
const AUDIT_ID = "0a000000-0000-4000-8000-000000000005";

function page(overrides: Partial<AdminCreatorPageRow> = {}): AdminCreatorPageRow {
  return {
    id: PAGE_ID,
    user_id: OWNER_ID,
    handle: "aurora",
    name: "Aurora Vale",
    bio: "Biography",
    headline: "Headline",
    avatar_url: "https://example.test/avatar.jpg",
    banner_url: null,
    theme: "iridescent",
    accent_color: "#c084fc",
    button_style: "rounded",
    font_family: "display",
    background_style: "gradient",
    page_status: "draft",
    plan: "free",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function link(
  id: string,
  position: number,
  createdAt: string,
  overrides: Partial<AdminCreatorPageLinkRow> = {},
): AdminCreatorPageLinkRow {
  return {
    id,
    profile_id: PAGE_ID,
    title: `Link ${position}`,
    url: "https://example.test",
    icon: "globe",
    featured: false,
    scheduled: null,
    position,
    kind: "link",
    is_visible: true,
    created_at: createdAt,
    ...overrides,
  };
}

function audit(overrides: Partial<AdminCreatorPageAuditRow> = {}): AdminCreatorPageAuditRow {
  return {
    id: AUDIT_ID,
    actor_role: "admin",
    action: "creator_page.updated",
    target_type: "creator_profile",
    target_id: PAGE_ID,
    before: { headline: "Before" },
    after: { headline: "After" },
    reason: null,
    created_at: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("creator-page read input validation", () => {
  it("normalizes a valid UUID and detail input", () => {
    expect(normalizeCreatorProfileId(` ${PAGE_ID.toUpperCase()} `)).toBe(PAGE_ID);
    expect(normalizeAdminCreatorPageDetailInput({ creatorProfileId: PAGE_ID })).toEqual({
      creatorProfileId: PAGE_ID,
    });
  });

  it("rejects missing, malformed, nil, and non-RFC UUIDs", () => {
    for (const value of [
      undefined,
      "page-id",
      "00000000-0000-0000-0000-000000000000",
      "0a000000-0000-6000-8000-000000000001",
    ]) {
      expect(() => normalizeCreatorProfileId(value)).toThrow(/valid creator page ID/);
    }
    expect(() => normalizeAdminCreatorPageDetailInput(null)).toThrow(/valid creator page ID/);
  });

  it("defaults and strictly bounds audit history", () => {
    expect(normalizeAdminCreatorPageAuditInput({ creatorProfileId: PAGE_ID })).toEqual({
      creatorProfileId: PAGE_ID,
      limit: ADMIN_CREATOR_PAGE_AUDIT_DEFAULT_LIMIT,
    });
    expect(
      normalizeAdminCreatorPageAuditInput({ creatorProfileId: PAGE_ID, limit: 100 }).limit,
    ).toBe(100);
    for (const limit of [0, 101, 2.5, "25", Number.NaN]) {
      expect(() =>
        normalizeAdminCreatorPageAuditInput({ creatorProfileId: PAGE_ID, limit }),
      ).toThrow(/between 1 and 100/);
    }
    expect(() => normalizeAdminCreatorPageAuditInput(null)).toThrow(/Invalid audit-history/);
  });
});

describe("creator-page detail mapping", () => {
  it("maps ownership, appearance, lifecycle, and deterministic links", () => {
    const result = mapAdminCreatorPageDetail(page(), [
      link(LINK_B, 2, "2026-07-02T00:00:00.000Z"),
      link(LINK_B, 1, "2026-07-02T00:00:00.000Z"),
      link(LINK_A, 1, "2026-07-01T00:00:00.000Z", {
        kind: "social",
        is_visible: false,
      }),
    ]);
    expect(result).toMatchObject({
      id: PAGE_ID,
      ownerUserId: OWNER_ID,
      claimed: true,
      handle: "aurora",
      displayName: "Aurora Vale",
      pageStatus: "draft",
      fontFamily: "display",
      backgroundStyle: "gradient",
    });
    expect(result.links.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: LINK_A, position: 1 },
      { id: LINK_B, position: 1 },
      { id: LINK_B, position: 2 },
    ]);
    expect(result.links[0]).toMatchObject({ kind: "social", isVisible: false });
  });

  it("represents an ownerless draft without inventing an owner", () => {
    expect(mapAdminCreatorPageDetail(page({ user_id: null }), [])).toMatchObject({
      ownerUserId: null,
      claimed: false,
      links: [],
    });
  });

  it("fails closed on invalid constrained row values", () => {
    expect(() => mapAdminCreatorPageDetail(page({ page_status: "deleted" }), [])).toThrow(
      /data is unavailable/,
    );
    expect(() => mapAdminCreatorPageDetail(page({ font_family: "comic" }), [])).toThrow(
      /data is unavailable/,
    );
    expect(() =>
      mapAdminCreatorPageDetail(page(), [
        link(LINK_A, 0, "2026-07-01T00:00:00.000Z", { kind: "unsafe" }),
      ]),
    ).toThrow(/data is unavailable/);
  });
});

describe("audit mapping and safe errors", () => {
  it("maps only the editor audit contract and normalizes non-object payloads", () => {
    expect(mapAdminCreatorPageAuditItem(audit())).toEqual({
      id: AUDIT_ID,
      actorRole: "admin",
      action: "creator_page.updated",
      targetType: "creator_profile",
      targetId: PAGE_ID,
      before: { headline: "Before" },
      after: { headline: "After" },
      reason: null,
      createdAt: "2026-07-03T00:00:00.000Z",
    });
    expect(mapAdminCreatorPageAuditItem(audit({ before: ["legacy"], after: null }))).toMatchObject({
      before: {},
      after: {},
    });
    expect(() => mapAdminCreatorPageAuditItem(audit({ actor_role: "finance" }))).toThrow(
      /audit data is unavailable/,
    );
    expect(() => mapAdminCreatorPageDetail(page({ theme: "custom-css" }), [])).toThrow(
      /data is unavailable/,
    );
  });

  it("maps read errors without leaking raw database diagnostics", () => {
    expect(mapAdminCreatorPageReadError({ code: "42501", message: "secret policy name" })).toBe(
      "Admin access is required.",
    );
    expect(mapAdminCreatorPageReadError({ code: "P0002", message: "internal row" })).toBe(
      "That creator page could not be found.",
    );
    const fallback = mapAdminCreatorPageReadError({ code: "XX000", message: "private stack" });
    expect(fallback).toBe("Creator page data could not be loaded. Please try again.");
    expect(fallback).not.toContain("private stack");
  });
});
