import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StreamVideoPlayer } from "./StreamVideoPlayer";
import type { StreamPlaybackItem } from "@/lib/stream-actions";

// vitest runs in node with no DOM, so these assert what SSR emits: the RESTING
// state. That is the load-bearing case — it is all a feed ever renders, and the
// "no player until the viewer asks" invariant is exactly a statement about it.
// The playing branch is behind a click and cannot be reached without a DOM.

const SUBDOMAIN = "customer-testcode123.cloudflarestream.com";
// A signed token stands in for the real JWT; the point is that it is the token,
// not the video uid, that appears in URLs.
const TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.c2lnbmF0dXJl";
const UID = "6b9e68b07dfee8cc2d116e4c51d6a957";

function item(overrides: Partial<StreamPlaybackItem> = {}): StreamPlaybackItem {
  return {
    mediaId: "media-1",
    position: 0,
    width: 1920,
    height: 1080,
    durationSeconds: 65,
    urls: {
      iframe: `https://${SUBDOMAIN}/${TOKEN}/iframe`,
      hls: `https://${SUBDOMAIN}/${TOKEN}/manifest/video.m3u8`,
      dash: `https://${SUBDOMAIN}/${TOKEN}/manifest/video.mpd`,
      thumbnail: `https://${SUBDOMAIN}/${TOKEN}/thumbnails/thumbnail.jpg`,
    },
    ...overrides,
  };
}

describe("StreamVideoPlayer (resting state)", () => {
  it("mounts NO iframe until the viewer asks — nothing autoplays", () => {
    const html = renderToStaticMarkup(<StreamVideoPlayer item={item()} />);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("autoplay");
  });

  it("renders the signed thumbnail as the poster", () => {
    const html = renderToStaticMarkup(<StreamVideoPlayer item={item()} />);
    expect(html).toContain(`https://${SUBDOMAIN}/${TOKEN}/thumbnails/thumbnail.jpg`);
    expect(html).toContain('loading="lazy"');
  });

  it("exposes a labelled play control", () => {
    const html = renderToStaticMarkup(<StreamVideoPlayer item={item()} />);
    expect(html).toContain('aria-label="Play video"');
    expect(html).toContain('type="button"');
  });

  it("never leaks the Cloudflare video uid — only the signed token appears", () => {
    const html = renderToStaticMarkup(<StreamVideoPlayer item={item()} />);
    expect(html).not.toContain(UID);
  });

  it("shows the duration badge, and omits it when duration is unknown", () => {
    expect(renderToStaticMarkup(<StreamVideoPlayer item={item()} />)).toContain("1:05");
    const unknown = renderToStaticMarkup(
      <StreamVideoPlayer item={item({ durationSeconds: null })} />,
    );
    expect(unknown).not.toContain("1:05");
  });

  it("uses the real aspect ratio, falling back to 16/9 when dimensions are unknown", () => {
    expect(renderToStaticMarkup(<StreamVideoPlayer item={item()} />)).toContain("1920 / 1080");
    const noDims = renderToStaticMarkup(
      <StreamVideoPlayer item={item({ width: null, height: null })} />,
    );
    expect(noDims).toContain("16 / 9");
  });

  it("drops the corner radius in flush mode (edge-to-edge inside a card)", () => {
    expect(renderToStaticMarkup(<StreamVideoPlayer item={item()} />)).toContain("rounded-2xl");
    expect(renderToStaticMarkup(<StreamVideoPlayer item={item()} flush />)).not.toContain(
      "rounded-2xl",
    );
  });
});
