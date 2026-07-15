import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminCreatorPageAuditItem,
  AdminCreatorPageDetail,
} from "@/lib/cabana-admin-creator-page-detail";

const state = vi.hoisted(() => ({
  detail: {} as Record<string, unknown>,
  audit: {} as Record<string, unknown>,
  mutation: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) =>
      React.createElement("a", { ...props, href: to }, children),
    useNavigate: () => vi.fn(),
    useBlocker: vi.fn(),
  };
});

vi.mock("@/lib/admin-creator-page-actions", () => ({
  adminCreateCreatorPage: vi.fn(),
}));

vi.mock("@/lib/use-admin-creator-page", () => ({
  useAdminCreatorPageDetail: () => state.detail,
  useAdminCreatorPageAuditHistory: () => state.audit,
}));

vi.mock("@/lib/use-admin-creator-page-mutations", () => ({
  useAdminCreatorPageMutations: () => ({
    updatePage: { mutateAsync: state.mutation },
    setStatus: { mutateAsync: state.mutation },
    transfer: { mutateAsync: state.mutation },
    upsertLink: { mutateAsync: state.mutation },
    setLinkVisibility: { mutateAsync: state.mutation },
    reorderLinks: { mutateAsync: state.mutation },
    deleteLink: { mutateAsync: state.mutation },
  }),
}));

const { AdminCreatorPageCreateForm } =
  await import("@/components/cabana/admin-creators/AdminCreatorPageCreateForm");
const { AdminCreatorPageEditor } =
  await import("@/components/cabana/admin-creators/AdminCreatorPageEditor");

const DETAIL: AdminCreatorPageDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  claimed: true,
  handle: "aurora",
  displayName: "Aurora Vale",
  bio: "Ambient composer",
  headline: "Sound design studio",
  avatarUrl: null,
  bannerUrl: null,
  theme: "iridescent",
  accentColor: "#7c3aed",
  buttonStyle: "pill",
  fontFamily: "display",
  backgroundStyle: "gradient",
  pageStatus: "draft",
  plan: "free",
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T11:00:00.000Z",
  links: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      title: "Official site",
      url: "https://example.com",
      icon: "globe",
      featured: true,
      scheduled: null,
      position: 0,
      kind: "link",
      isVisible: true,
      createdAt: "2026-07-14T10:05:00.000Z",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      title: "Private draft link",
      url: "https://example.com/private",
      icon: "link",
      featured: false,
      scheduled: null,
      position: 1,
      kind: "social",
      isVisible: false,
      createdAt: "2026-07-14T10:06:00.000Z",
    },
  ],
};

const AUDIT: AdminCreatorPageAuditItem = {
  id: "55555555-5555-4555-8555-555555555555",
  actorRole: "admin",
  action: "creator_page.updated",
  targetType: "creator_profile",
  targetId: DETAIL.id,
  before: { headline: "Old headline" },
  after: { headline: "Sound design studio" },
  reason: "Brand refresh",
  createdAt: "2026-07-14T12:00:00.000Z",
};

function loaded(detail: AdminCreatorPageDetail = DETAIL) {
  state.detail = {
    data: detail,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  state.audit = {
    data: [AUDIT],
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function renderEditor() {
  return renderToStaticMarkup(
    <AdminCreatorPageEditor creatorProfileId="11111111-1111-4111-8111-111111111111" />,
  );
}

beforeEach(() => {
  loaded();
  state.mutation.mockClear();
});

describe("new creator page", () => {
  it("renders a real ownerless-draft form with cancel navigation", () => {
    const html = renderToStaticMarkup(<AdminCreatorPageCreateForm />);
    expect(html).toContain("New pages are intentionally ownerless and saved as drafts");
    expect(html).toContain('name="handle"');
    expect(html).toContain('name="displayName"');
    expect(html).toContain("Create draft page");
    expect(html).toContain('href="/admin/creators"');
    expect(html.toLowerCase()).not.toContain("invite");
  });
});

describe("creator-page editor", () => {
  it("renders supported identity and appearance fields from live detail data", () => {
    const html = renderEditor();
    expect(html).toContain("Aurora Vale");
    expect(html).toContain("Sound design studio");
    expect(html).toContain("Avatar URL");
    expect(html).toContain("Banner URL");
    expect(html).toContain("Font family");
    expect(html).toContain("Background");
    expect(html).toContain("Accent color");
  });

  it("offers only valid draft lifecycle transitions and marks the page unpublished", () => {
    const html = renderEditor();
    expect(html).toContain("Publish");
    expect(html).toContain("Archive");
    expect(html).not.toContain(">Unpublish<");
    expect(html).not.toContain("Restore to draft");
    expect(html).toContain("This draft page is not publicly visible");
  });

  it("clearly distinguishes archived pages and offers restore", () => {
    loaded({ ...DETAIL, pageStatus: "archived" });
    const html = renderEditor();
    expect(html).toContain("This creator page is archived and hidden publicly");
    expect(html).toContain("Restore to draft");
    expect(html).not.toContain(">Publish<");
  });

  it("uses exact UUID ownership without exposing account email", () => {
    const html = renderEditor();
    expect(html).toContain("assignment requires an exact");
    expect(html).toContain("22222222-2222-4222-8222-222222222222");
    expect(html.toLowerCase()).toContain("email and auth-user data are never exposed");
    expect(html).not.toContain("mailto:");
    expect(html).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  });

  it("requires confirmation before ownership assignment or transfer", () => {
    const ownership = code("src/components/cabana/admin-creators/AdminCreatorPageOwnership.tsx");
    expect(ownership).toContain("Transfer page ownership?");
    expect(ownership).toContain("Transfer ownership");
    expect(ownership).toContain("confirmTarget");
  });

  it("renders deterministic positions and accessible link actions", () => {
    const html = renderEditor();
    expect(html).toContain('aria-label="Position 1"');
    expect(html).toContain('aria-label="Move Official site down"');
    expect(html).toContain('aria-label="Hide Official site"');
    expect(html).toContain('aria-label="Show Private draft link"');
    expect(html).toContain('aria-label="Delete Official site"');
  });

  it("renders mobile/desktop shared-seam preview and bounded audit history", () => {
    const html = renderEditor();
    expect(html).toContain("Mobile");
    expect(html).toContain("Desktop");
    expect(html).toContain('data-creator-page-font="display"');
    expect(html).toContain("Creator-page audit history");
    expect(html).toContain("Latest 50 relevant page and link changes");
    expect(html).toContain("Brand refresh");
    expect(html).toContain("headline");
  });

  it("keeps public URL actions on the persisted handle while previewing a draft handle", () => {
    const preview = code("src/components/cabana/admin-creators/AdminCreatorPagePreview.tsx");
    expect(preview).toContain("publicHandle");
    expect(preview).toContain("Copy and Open still use the saved");
    expect(preview).toContain("href={`/${publicHandle}`}");
  });

  it("does not fabricate detail data on loading, failure, or not-found", () => {
    state.detail = { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
    expect(renderEditor()).toContain("Loading creator page");

    state.detail = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    expect(renderEditor()).toContain("Couldn’t load this creator page");

    state.detail = { data: null, isPending: false, isError: false, refetch: vi.fn() };
    expect(renderEditor()).toContain("Creator page not found");
  });

  it("blocks in-app and unload navigation while identity edits are unsaved", () => {
    const source = code("src/components/cabana/admin-creators/AdminCreatorPageIdentityForm.tsx");
    expect(source).toContain("useBlocker");
    expect(source).toContain("enableBeforeUnload: dirty");
    expect(source).toContain("Discard your unsaved creator-page changes?");
  });

  it("preserves the active draft across unrelated detail refetches", () => {
    const editor = code("src/components/cabana/admin-creators/AdminCreatorPageEditor.tsx");
    const form = code("src/components/cabana/admin-creators/AdminCreatorPageIdentityForm.tsx");
    expect(editor).toContain("editedPreviewDraft ?? initialDraft");
    expect(form).not.toContain("setDraft(initialValue)");
  });
});

function code(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("route and security invariants", () => {
  it("puts both editor routes behind AdminGate and noindex", () => {
    for (const route of [
      "src/routes/admin.creators.new.tsx",
      "src/routes/admin.creators.$creatorProfileId.tsx",
    ]) {
      const source = code(route);
      expect(source).toContain("AdminGate");
      expect(source).not.toContain("StaffGate");
      expect(source).toContain("noindex, nofollow");
    }
  });

  it("contains no invite, auth.users, service-role, email lookup, or direct table mutation", () => {
    const source = [
      "src/components/cabana/admin-creators/AdminCreatorPageEditor.tsx",
      "src/lib/use-admin-creator-page-mutations.ts",
    ]
      .map(code)
      .join("\n")
      .toLowerCase();
    expect(source).not.toContain("invite");
    expect(source).not.toContain("auth.users");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("service-role");
    expect(source).not.toContain("supabaseadmin");
    expect(source).not.toContain(".from(");
    expect(source).not.toContain("email");
  });
});
