import { describe, expect, it } from "vitest";
import {
  compactCreatorLinkLabel,
  mapCreatorLink,
  mapCreatorProfile,
  orderedVisibleCreatorLinks,
  safeCreatorLinkHref,
  type CabanaLink,
  type CreatorLinkViewRow,
  type CreatorProfileViewRow,
} from "@/lib/cabana-creator-page-view";

const PROFILE_ROW: CreatorProfileViewRow = {
  id: "profile-1",
  handle: "aurora",
  name: "Aurora",
  bio: "Sound and light",
  avatar_url: null,
  banner_url: null,
  theme: "rose",
  plan: "free",
  headline: "Studio",
  accent_color: "#ff00aa",
  button_style: "pill",
  page_status: "published",
  font_family: "serif",
  background_style: "gradient",
};

const LINK_ROW: CreatorLinkViewRow = {
  id: "link-1",
  profile_id: "profile-1",
  title: "Listen",
  url: "https://example.com/listen",
  icon: "music",
  featured: true,
  scheduled: null,
  position: 1,
  clicks: 25,
  kind: "embed",
  is_visible: false,
};

function link(overrides: Partial<CabanaLink> = {}): CabanaLink {
  return {
    id: "link-a",
    title: "Link",
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

describe("migration-37 row mapping", () => {
  it("maps lifecycle and appearance fields onto the public profile", () => {
    expect(mapCreatorProfile(PROFILE_ROW)).toMatchObject({
      pageStatus: "published",
      fontFamily: "serif",
      backgroundStyle: "gradient",
      theme: "rose",
      buttonStyle: "pill",
    });
  });

  it("falls back to closed presentation tokens for malformed or pre-migration rows", () => {
    expect(
      mapCreatorProfile({
        ...PROFILE_ROW,
        theme: "custom-css",
        button_style: "circle",
        page_status: "unknown",
        font_family: "remote-font",
        background_style: "url(javascript:bad)",
      }),
    ).toMatchObject({
      theme: "iridescent",
      buttonStyle: "rounded",
      pageStatus: "published",
      fontFamily: "default",
      backgroundStyle: "default",
    });
  });

  it("maps link kind and visibility without inventing click data", () => {
    expect(mapCreatorLink(LINK_ROW, 100)).toMatchObject({
      kind: "embed",
      isVisible: false,
      icon: "music",
      ctr: "25.0%",
    });
  });
});

describe("public link policy", () => {
  it("filters hidden links and deterministically breaks position ties by id", () => {
    const input = [
      link({ id: "z", position: 1 }),
      link({ id: "hidden", position: 0, isVisible: false }),
      link({ id: "a", position: 1 }),
    ];
    expect(orderedVisibleCreatorLinks(input).map(({ id }) => id)).toEqual(["a", "z"]);
    expect(input.map(({ id }) => id)).toEqual(["z", "hidden", "a"]);
  });

  it("normalizes legacy bare hosts and accepts only HTTP(S)", () => {
    expect(safeCreatorLinkHref("example.com/path")).toBe("https://example.com/path");
    expect(safeCreatorLinkHref("HTTP://example.com")).toBe("HTTP://example.com");
    expect(safeCreatorLinkHref("javascript:alert(1)")).toBeNull();
    expect(safeCreatorLinkHref("data:text/html,bad")).toBeNull();
    expect(safeCreatorLinkHref("https://")).toBeNull();
  });

  it("compacts safe public labels", () => {
    expect(compactCreatorLinkLabel("https://example.com/")).toBe("example.com");
  });
});
