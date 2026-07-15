// ============================================================================
// CreatorDirectory — render + invariant tests (Phase 1).
//
// Rendered with `react-dom/server`: the repo's vitest is `environment: "node"`
// and jsdom / @testing-library are not dependencies (see CLAUDE.md). SSR reaches
// everything that matters here — which rows render, the claimed/unclaimed badge,
// the pager, the empty/loading/error states, and (critically) that no email and
// no write control ever reaches the markup.
//
// Interaction (typing, paging) is not dispatchable without a DOM, so the
// BEHAVIOR behind each control is covered where it lives: the pure module
// (`summarizeAdminCreatorsPage`, `normalizeAdminCreatorsQuery`, `buildSearchFilter`)
// in cabana-admin-creators.test.ts.
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_CREATOR_SELECT,
  type AdminCreatorRow,
  type AdminCreatorsPage,
} from "@/lib/cabana-admin-creators";

const state = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({
      to,
      params,
      children,
      ...props
    }: {
      to: string;
      params?: Record<string, string>;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => {
      const href = params
        ? Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
        : to;
      return React.createElement("a", { ...props, href }, children);
    },
  };
});

vi.mock("@/lib/use-admin-creators", () => ({
  useAdminCreators: () => state.result,
}));

const { CreatorDirectory } = await import("@/components/cabana/admin-creators/CreatorDirectory");

const CLAIMED: AdminCreatorRow = {
  id: "p1",
  handle: "aurora",
  displayName: "Aurora Vale",
  excerpt: "Sound design studio",
  avatarUrl: null,
  theme: "iridescent",
  buttonStyle: "pill",
  accentColor: "#ff00aa",
  plan: "free",
  pageStatus: "published",
  claimed: true,
  linkCount: 3,
  createdAt: "2026-03-04T12:00:00.000Z",
  publicPath: "/aurora",
  publicUrl: "cabanagrp.com/aurora",
};

const UNCLAIMED = {
  ...CLAIMED,
  id: "p2",
  handle: "mira",
  displayName: "Mira Solène",
  excerpt: "",
  claimed: false,
  linkCount: 0,
  publicPath: "/mira",
  publicUrl: "cabanagrp.com/mira",
};

function page(over: Partial<AdminCreatorsPage> = {}): AdminCreatorsPage {
  return { rows: [CLAIMED, UNCLAIMED], total: 2, page: 0, pageSize: 25, ...over };
}

function loaded(data: AdminCreatorsPage) {
  return { data, isPending: false, isError: false, isFetching: false, refetch: vi.fn() };
}

function render() {
  return renderToStaticMarkup(<CreatorDirectory />);
}

beforeEach(() => {
  state.result = loaded(page());
});

describe("rows", () => {
  it("renders live creator rows", () => {
    const html = render();
    expect(html).toContain("Aurora Vale");
    expect(html).toContain("Mira Solène");
    expect(html).toContain("cabanagrp.com/aurora");
    expect(html).toContain("Sound design studio");
  });

  it("links to the creator's real public page", () => {
    expect(render()).toContain('href="/aurora"');
  });

  it("shows the link count and the created date", () => {
    const html = render();
    expect(html).toContain("Mar 4, 2026");
    expect(html).toContain(">3</div>");
  });

  it("distinguishes claimed from unclaimed", () => {
    const html = render();
    expect(html).toContain("Claimed");
    expect(html).toContain("Unclaimed");
  });

  it("shows the current creator-page lifecycle state", () => {
    expect(render()).toContain('data-page-status="published"');
    expect(render()).toContain("All lifecycle states");
  });

  it("renders an avatar fallback rather than a broken image", () => {
    expect(render()).not.toContain("<img");
  });
});

describe("honesty invariants", () => {
  it("never renders an email, anywhere", () => {
    const html = render();
    expect(html.toLowerCase()).not.toContain("@vale");
    expect(html.toLowerCase()).not.toContain("mailto:");
    // The column does not exist, and the surface says why.
    expect(html).not.toMatch(/>\s*Email\s*</);
    expect(html).toContain("Email isn’t shown");
  });

  it("links to real create and management routes without fake moderation controls", () => {
    const html = render().toLowerCase();
    expect(html).toContain("new page");
    expect(html).toContain("manage");
    expect(html).toContain('href="/admin/creators/new"');
    expect(html).toContain('href="/admin/creators/p1"');
    for (const word of ["suspend", "approve", "invite"]) expect(html).not.toContain(`>${word}`);
  });

  it("never leaks a user_id / auth uuid", () => {
    state.result = loaded(page());
    const html = render();
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe("pager", () => {
  it("summarizes the page and offers Previous/Next", () => {
    state.result = loaded(page({ rows: [CLAIMED], total: 84, page: 0 }));
    const html = render();
    expect(html).toContain("1–1 of 84");
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
  });

  it("disables Previous on the first page", () => {
    const html = render();
    const prev = html.slice(html.indexOf("Previous") - 200, html.indexOf("Previous"));
    expect(prev).toContain("disabled");
  });

  it("hides the pager entirely when the page is empty", () => {
    state.result = loaded(page({ rows: [], total: 0 }));
    const html = render();
    expect(html).not.toContain("Previous");
  });
});

describe("states", () => {
  it("renders a loading skeleton, not fake rows", () => {
    state.result = {
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      refetch: vi.fn(),
    };
    const html = render();
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Aurora Vale");
  });

  it("renders an error card and NO fabricated data on failure", () => {
    state.result = {
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      refetch: vi.fn(),
    };
    const html = render();
    expect(html).toContain("Couldn’t load creators");
    // Zero rows, zero counts — a failed query must never render business data.
    // (The search box and claim-filter tabs DO remain, so the admin can retry a
    // different query; only the data region is withheld.)
    expect(html).not.toContain("Aurora Vale");
    expect(html).not.toContain("cabanagrp.com/aurora");
    expect(html).not.toContain("0 of 0");
    expect(html).not.toContain("Previous");
  });

  it("renders a genuine empty state for zero rows", () => {
    state.result = loaded(page({ rows: [], total: 0 }));
    const html = render();
    expect(html).toContain("No creators yet");
  });
});

// ── Source-level invariants ──────────────────────────────────────────────────
// These assert on CODE, not prose. The modules' own comments say things like
// "`supabaseAdmin` is NEVER imported here" and "not `.limit()`-capped", so a
// naive substring check over the raw file would match the very words that
// document the invariant. Comments are stripped first.

const RAW = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Strip block and line comments so an assertion sees executable code only. */
function code(path: string): string {
  return RAW(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const ACTIONS = "src/lib/admin-creator-actions.ts";
const PURE = "src/lib/cabana-admin-creators.ts";

describe("source invariants", () => {
  it("the comment stripper actually works (guards the assertions below)", () => {
    // The raw file documents the invariant; the stripped code must not contain it.
    expect(RAW(ACTIONS)).toContain("supabaseAdmin");
    expect(code(ACTIONS)).not.toContain("supabaseAdmin");
  });

  it("the server action never imports the service-role client", () => {
    const src = code(ACTIONS);
    expect(src).not.toContain("supabaseAdmin");
    expect(src).not.toContain("client.server");
    expect(src).not.toContain("SERVICE_ROLE");
  });

  it("the server action runs under the caller's RLS", () => {
    const src = code(ACTIONS);
    expect(src).toContain("attachSupabaseToken");
    expect(src).toContain("requireSupabaseAuth");
  });

  it("admin authority comes from user_roles — never a hardcoded email", () => {
    const src = code(ACTIONS);
    expect(src).toContain('.from("user_roles")');
    expect(src).toContain('.eq("role", "admin")');
    expect(src).not.toMatch(/[\w.]+@[\w.]+\.\w+/);
  });

  it("paginates profiles and explicitly bounds the per-page link-count read", () => {
    const src = code(ACTIONS);
    expect(src).toContain(".range(from, to)");
    expect(src).toContain(".limit(linkReadLimit + 1)");
    expect(src).toContain("links ?? []).length > linkReadLimit");
  });

  it("does not forward raw query diagnostics to the browser", () => {
    const src = code(ACTIONS);
    expect(src).not.toContain("error.message");
    expect(src).not.toContain("linkError.message");
  });

  it("never selects an email column", () => {
    // The real invariant lives in the SELECT list, not in prose.
    expect(ADMIN_CREATOR_SELECT).not.toContain("email");
    expect(code(ACTIONS)).not.toContain("email");
    // `profiles` (which holds email) is never read — only `creator_profiles`.
    expect(code(ACTIONS)).not.toMatch(/\.from\("profiles"\)/);
  });

  it("the route is behind the admin-only gate and is noindex", () => {
    const src = code("src/routes/admin.creators.tsx");
    expect(src).toContain("AdminGate");
    expect(src).not.toContain("StaffGate"); // moderators must not reach creator management
    expect(src).toContain("noindex, nofollow");
  });

  it("the fabricated Users table is gone from the admin console", () => {
    const src = RAW("src/routes/admin.tsx");
    expect(src).not.toContain("UsersPanel");
    expect(src).not.toContain("aurora@vale.studio");
    expect(src).toContain("/admin/creators");
  });

  it("touches no Stream file", () => {
    const src = code(ACTIONS) + code(PURE);
    expect(src.toLowerCase()).not.toContain("stream");
  });
});
