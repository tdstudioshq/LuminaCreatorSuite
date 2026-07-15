import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AdminCreatorPageReadDeps,
  readAdminCreatorPageAuditHistory,
  readAdminCreatorPageDetail,
} from "@/lib/admin-creator-page-read-actions";
import type {
  AdminCreatorPageAuditRow,
  AdminCreatorPageLinkRow,
  AdminCreatorPageRow,
} from "@/lib/cabana-admin-creator-page-detail";

const PAGE_ID = "0a000000-0000-4000-8000-000000000001";
const OWNER_ID = "0a000000-0000-4000-8000-000000000002";
const LINK_ID = "0a000000-0000-4000-8000-000000000003";
const AUDIT_ID = "0a000000-0000-4000-8000-000000000004";

const profile: AdminCreatorPageRow = {
  id: PAGE_ID,
  user_id: OWNER_ID,
  handle: "aurora",
  name: "Aurora",
  bio: "Bio",
  headline: "Headline",
  avatar_url: null,
  banner_url: null,
  theme: "iridescent",
  accent_color: "",
  button_style: "rounded",
  font_family: "default",
  background_style: "default",
  page_status: "draft",
  plan: "free",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const link: AdminCreatorPageLinkRow = {
  id: LINK_ID,
  profile_id: PAGE_ID,
  title: "Site",
  url: "https://example.test",
  icon: "globe",
  featured: false,
  scheduled: null,
  position: 0,
  kind: "link",
  is_visible: true,
  created_at: "2026-07-01T00:00:00.000Z",
};

const audit: AdminCreatorPageAuditRow = {
  id: AUDIT_ID,
  actor_role: "admin",
  action: "creator_page.created",
  target_type: "creator_profile",
  target_id: PAGE_ID,
  before: null,
  after: { handle: "aurora" },
  reason: null,
  created_at: "2026-07-01T00:00:00.000Z",
};

function makeDeps(
  options: {
    admin?: boolean;
    profile?: AdminCreatorPageRow | null;
    links?: AdminCreatorPageLinkRow[];
    audits?: AdminCreatorPageAuditRow[];
    profileError?: { code?: string; message?: string };
    linkError?: { code?: string; message?: string };
    auditError?: { code?: string; message?: string };
  } = {},
) {
  const calls: string[] = [];
  const auditArgs: Array<{ creatorProfileId: string; limit: number }> = [];
  const deps: AdminCreatorPageReadDeps = {
    assertAdmin: async () => {
      calls.push("assertAdmin");
      if (options.admin === false) throw new Error("Admin access is required.");
    },
    getProfile: async (creatorProfileId) => {
      calls.push(`profile:${creatorProfileId}`);
      return {
        data: options.profile === undefined ? profile : options.profile,
        error: options.profileError,
      };
    },
    getLinks: async (creatorProfileId) => {
      calls.push(`links:${creatorProfileId}`);
      return { data: options.links ?? [link], error: options.linkError };
    },
    getAuditHistory: async (creatorProfileId, limit) => {
      calls.push(`audit:${creatorProfileId}`);
      auditArgs.push({ creatorProfileId, limit });
      return { data: options.audits ?? [audit], error: options.auditError };
    },
  };
  return { deps, calls, auditArgs };
}

describe("admin creator-page detail read", () => {
  it("denies non-admins before any data query", async () => {
    const { deps, calls } = makeDeps({ admin: false });
    await expect(readAdminCreatorPageDetail(deps, { creatorProfileId: PAGE_ID })).rejects.toThrow(
      /Admin access/,
    );
    expect(calls).toEqual(["assertAdmin"]);
  });

  it("validates before authorization or data access", async () => {
    const { deps, calls } = makeDeps();
    await expect(
      readAdminCreatorPageDetail(deps, { creatorProfileId: "not-a-uuid" }),
    ).rejects.toThrow(/valid creator page ID/);
    expect(calls).toEqual([]);
  });

  it("returns the mapped profile and ordered links", async () => {
    const { deps, calls } = makeDeps();
    await expect(
      readAdminCreatorPageDetail(deps, { creatorProfileId: PAGE_ID }),
    ).resolves.toMatchObject({
      id: PAGE_ID,
      ownerUserId: OWNER_ID,
      pageStatus: "draft",
      links: [{ id: LINK_ID }],
    });
    expect(calls).toEqual(["assertAdmin", `profile:${PAGE_ID}`, `links:${PAGE_ID}`]);
  });

  it("returns null without querying links when the page does not exist", async () => {
    const { deps, calls } = makeDeps({ profile: null });
    await expect(
      readAdminCreatorPageDetail(deps, { creatorProfileId: PAGE_ID }),
    ).resolves.toBeNull();
    expect(calls).toEqual(["assertAdmin", `profile:${PAGE_ID}`]);
  });

  it("maps database failures safely and refuses a silently truncated link list", async () => {
    const raw = "relation public.creator_profiles does not exist at internal/path";
    const failed = makeDeps({ profileError: { code: "XX000", message: raw } });
    await expect(
      readAdminCreatorPageDetail(failed.deps, { creatorProfileId: PAGE_ID }),
    ).rejects.toThrow("Creator page data could not be loaded. Please try again.");
    await expect(
      readAdminCreatorPageDetail(failed.deps, { creatorProfileId: PAGE_ID }),
    ).rejects.not.toThrow(raw);

    const overflow = makeDeps({ links: Array.from({ length: 201 }, () => link) });
    await expect(
      readAdminCreatorPageDetail(overflow.deps, { creatorProfileId: PAGE_ID }),
    ).rejects.toThrow(/too many links/);

    const linkFailure = makeDeps({ linkError: { code: "XX000", message: raw } });
    await expect(
      readAdminCreatorPageDetail(linkFailure.deps, { creatorProfileId: PAGE_ID }),
    ).rejects.toThrow("Creator page data could not be loaded. Please try again.");
  });
});

describe("admin creator-page audit read", () => {
  it("asserts admin, applies the default bound, and maps history", async () => {
    const { deps, calls, auditArgs } = makeDeps();
    await expect(
      readAdminCreatorPageAuditHistory(deps, { creatorProfileId: PAGE_ID }),
    ).resolves.toEqual([expect.objectContaining({ id: AUDIT_ID, action: "creator_page.created" })]);
    expect(calls).toEqual(["assertAdmin", `audit:${PAGE_ID}`]);
    expect(auditArgs).toEqual([{ creatorProfileId: PAGE_ID, limit: 50 }]);
  });

  it("rejects invalid limits and non-admins before the RPC", async () => {
    const invalid = makeDeps();
    await expect(
      readAdminCreatorPageAuditHistory(invalid.deps, { creatorProfileId: PAGE_ID, limit: 101 }),
    ).rejects.toThrow(/between 1 and 100/);
    expect(invalid.calls).toEqual([]);

    const denied = makeDeps({ admin: false });
    await expect(
      readAdminCreatorPageAuditHistory(denied.deps, { creatorProfileId: PAGE_ID, limit: 25 }),
    ).rejects.toThrow(/Admin access/);
    expect(denied.calls).toEqual(["assertAdmin"]);
  });

  it("slices defensively and maps RPC errors without raw diagnostics", async () => {
    const bounded = makeDeps({ audits: [audit, { ...audit, id: LINK_ID }] });
    await expect(
      readAdminCreatorPageAuditHistory(bounded.deps, { creatorProfileId: PAGE_ID, limit: 1 }),
    ).resolves.toHaveLength(1);

    const failed = makeDeps({ auditError: { code: "XX000", message: "private SQL stack" } });
    await expect(
      readAdminCreatorPageAuditHistory(failed.deps, { creatorProfileId: PAGE_ID }),
    ).rejects.toThrow("Creator page data could not be loaded. Please try again.");
  });
});

function executableSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("read-layer source invariants", () => {
  const source = executableSource("src/lib/admin-creator-page-read-actions.ts");

  it("uses caller auth plus explicit server admin authorization", () => {
    expect(source).toContain("attachSupabaseToken");
    expect(source).toContain("requireSupabaseAuth");
    expect(source).toContain("assertAdmin");
    expect(source).toContain('.from("user_roles")');
    expect(source).toContain('.eq("role", "admin")');
  });

  it("uses explicit bounded, deterministic reads and the audit RPC", () => {
    expect(source).toContain("ADMIN_CREATOR_PAGE_DETAIL_SELECT");
    expect(source).toContain("ADMIN_CREATOR_PAGE_LINK_SELECT");
    expect(source).toContain("ADMIN_CREATOR_PAGE_AUDIT_SELECT");
    expect(source).toContain("admin_get_creator_page_audit_history");
    expect(source).toContain('.order("position"');
    expect(source).toContain(".limit(ADMIN_CREATOR_PAGE_LINK_LIMIT + 1)");
    expect(source).toContain(".limit(limit)");
  });

  it("does not use auth.users, service role, email, or audit request metadata", () => {
    expect(source).not.toContain("auth.users");
    expect(source).not.toContain("supabaseAdmin");
    expect(source).not.toContain("SERVICE_ROLE");
    expect(source).not.toContain("email");
    expect(source).not.toContain("actor_user_id");
    expect(source).not.toContain("ip_address");
    expect(source).not.toContain("user_agent");
    expect(source).not.toContain("request_id");
  });
});
