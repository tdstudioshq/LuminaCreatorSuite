import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreatorPageLinks, CreatorPagePrimaryLink } from "./CreatorPageLinks";
import { CreatorPageSurface } from "./CreatorPageSurface";
import { creatorPageSurfaceStyle } from "./creator-page-style";
import type { CabanaLink, CabanaProfile } from "@/lib/cabana-creator-page-view";

const PROFILE: CabanaProfile = {
  id: "profile-1",
  name: "Aurora",
  handle: "aurora",
  bio: "",
  avatar: "",
  banner: "",
  theme: "rose",
  plan: "free",
  headline: "",
  accentColor: "#ff00aa",
  buttonStyle: "pill",
  pageStatus: "published",
  fontFamily: "serif",
  backgroundStyle: "gradient",
};

function link(overrides: Partial<CabanaLink> = {}): CabanaLink {
  return {
    id: "link-a",
    title: "Website",
    url: "https://example.com",
    icon: "globe",
    clicks: 0,
    ctr: "0%",
    position: 0,
    kind: "link",
    isVisible: true,
    ...overrides,
  };
}

describe("CreatorPageSurface", () => {
  it("renders closed theme, lifecycle, font, and background tokens", () => {
    const html = renderToStaticMarkup(
      <CreatorPageSurface profile={PROFILE}>
        <span>Creator content</span>
      </CreatorPageSurface>,
    );

    expect(html).toContain('data-cabana-theme="rose"');
    expect(html).toContain('data-creator-page-status="published"');
    expect(html).toContain('data-creator-page-font="serif"');
    expect(html).toContain('data-creator-page-background="gradient"');
    expect(html).toContain("Creator content");
    expect(html).toContain("Georgia");
    expect(html).toContain("linear-gradient");
    expect(html).toContain("social-app-shell");
  });

  it("does not create CSS values for default tokens", () => {
    expect(creatorPageSurfaceStyle("default", "default")).toEqual({});
  });
});

describe("CreatorPageLinks", () => {
  const links = [
    link({ id: "hidden", title: "Secret", position: 0, isVisible: false }),
    link({ id: "header", title: "Featured", position: 1, kind: "header" }),
    link({ id: "social", title: "Social", position: 2, kind: "social" }),
    link({ id: "embed", title: "Watch", position: 3, kind: "embed" }),
    link({ id: "unsafe", title: "Unsafe", position: 4, url: "javascript:alert(1)" }),
  ];

  it("hides invisible rows and renders each safe kind with appropriate semantics", () => {
    const html = renderToStaticMarkup(
      <CreatorPageLinks links={links} accentColor="#ff00aa" buttonStyle="pill" />,
    );

    expect(html).not.toContain("Secret");
    expect(html).toContain('role="heading"');
    expect(html).toContain('data-link-kind="header"');
    expect(html).toContain('data-link-kind="social"');
    expect(html).toContain('data-link-kind="embed"');
    expect(html).toContain("Media");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('aria-disabled="true"');
  });

  it("uses the first visible actionable link for the profile hero", () => {
    const html = renderToStaticMarkup(<CreatorPagePrimaryLink links={links} />);
    expect(html).toContain('data-link-kind="social"');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("Featured");
  });
});

describe("public query invariants", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/cabana-store.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("requires a published page and visible links even for authenticated sessions", () => {
    expect(source).toContain('.eq(MIGRATION_37_PAGE_STATUS_COLUMN, "published")');
    expect(source).toContain("linksQuery.eq(MIGRATION_37_LINK_VISIBILITY_COLUMN, true)");
    expect(source).toContain("visibleLinksOnly: true");
  });

  it("keeps pre-migration previews healthy only for a confirmed missing-column error", () => {
    expect(source).toContain('!["42703", "PGRST204"].includes');
    expect(source).toContain("LEGACY_PUBLIC_CREATOR_PROFILE_COLUMNS");
    expect(source).toContain("LEGACY_PUBLIC_CREATOR_LINK_COLUMNS");
    expect(source).toContain("isMigration37Unavailable(profileResult.error)");
    expect(source).toContain("isMigration37Unavailable(linksRes.error)");
  });

  it("does not issue secondary handle reads until publication is confirmed", () => {
    const route = readFileSync(join(process.cwd(), "src/routes/$username.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(route).toContain(
      'const publishedUsername = data?.profile.pageStatus === "published" ? username : ""',
    );
    expect(route).toContain("useFollow(publishedUsername)");
    expect(route).toContain("useCreatorTiers(publishedUsername)");
  });

  it("selects the public migration fields without selecting user_id", () => {
    const profileColumns = source.match(
      /PUBLIC_CREATOR_PROFILE_COLUMNS:\s*string\s*=\s*"([^"]+)"/,
    )?.[1];
    const linkColumns = source.match(/PUBLIC_CREATOR_LINK_COLUMNS:\s*string\s*=\s*"([^"]+)"/)?.[1];
    expect(profileColumns).toContain("page_status");
    expect(profileColumns).toContain("font_family");
    expect(profileColumns).toContain("background_style");
    expect(profileColumns).not.toContain("user_id");
    expect(linkColumns).toContain("kind");
    expect(linkColumns).toContain("is_visible");
  });

  it("orders links deterministically by position and id", () => {
    expect(source).toMatch(
      /linksQuery\s*\.order\("position"[\s\S]*?\.order\("id", \{ ascending: true \}\)/,
    );
  });
});
