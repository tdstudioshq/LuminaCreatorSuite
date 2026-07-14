// ============================================================================
// PostComposer — video integration tests (Checkpoint 5A.3).
//
// Rendered with `react-dom/server` (see VideoUploadCard.test.tsx for why: the
// repo's vitest is `environment: "node"` and jsdom / @testing-library are not
// dependencies). That covers everything the composer RENDERS from a given
// upload session: the Video option, the XOR disabling, the publish gate and its
// reason, and the video card's presence.
//
// What SSR cannot reach: `files` is internal state that only a real file-input
// change event can populate, so the images-block-video direction of the XOR is
// covered by `canSelectVideo` in cabana-composer-media.test.ts (the function the
// composer binds to the button's `disabled`), not from here.
// ============================================================================
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamUploadApi } from "@/lib/use-stream-upload";
import type { UploadSession } from "@/lib/cabana-stream-upload";

const state = vi.hoisted(() => ({ upload: null as unknown as StreamUploadApi }));

vi.mock("@/lib/use-stream-upload", () => ({
  useStreamUpload: () => state.upload,
}));

vi.mock("@/lib/use-posts", () => ({
  useCreatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadPostMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePublishPost: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/use-subscriptions", () => ({
  useMyTiers: () => ({ data: [], isSuccess: true }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: React.ReactNode }) => (
    <a href={to ?? "#"}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { PostComposer } = await import("@/components/cabana/posts/PostComposer");

function fakeUpload(session: UploadSession): StreamUploadApi {
  return {
    session,
    preflightRejection: null,
    isUploading: false,
    canPause: false,
    canResume: false,
    canRetry: false,
    cleanupRequired: false,
    detachRequired: false,
    beginUpload: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
  } as unknown as StreamUploadApi;
}

function render(session: UploadSession): string {
  state.upload = fakeUpload(session);
  return renderToStaticMarkup(<PostComposer />);
}

function buttons(html: string): string[] {
  return html.match(/<button[^>]*>.*?<\/button>/gs) ?? [];
}

function buttonFor(html: string, label: string): string | undefined {
  return buttons(html).find((b) => b.includes(`> ${label}`) || b.includes(`>${label}<`));
}

/** The real `disabled` attribute — Tailwind's `disabled:` classes are not it. */
function isDisabled(buttonHtml: string | undefined): boolean {
  if (buttonHtml === undefined) return false;
  const openTag = buttonHtml.slice(0, buttonHtml.indexOf(">") + 1);
  return /\sdisabled(=""|\s|>)/.test(openTag);
}

function titleOf(buttonHtml: string | undefined): string {
  const match = buttonHtml?.match(/title="([^"]*)"/);
  return match?.[1] ?? "";
}

const idle: UploadSession = { phase: "idle" };
const uploading: UploadSession = {
  phase: "uploading",
  streamVideoId: "vid-abc",
  fileName: "clip.mp4",
  totalBytes: 1_000,
  bytesSent: 250,
  progressPercent: 25,
  uploadAttempt: 1,
};
const processing: UploadSession = { phase: "processing", streamVideoId: "vid-abc", postId: "p1" };
const ready: UploadSession = { phase: "ready", streamVideoId: "vid-abc", postId: "p1" };
const canceledDetach: UploadSession = {
  phase: "canceled",
  cleanupRequired: true,
  detachRequired: true,
  streamVideoId: "vid-abc",
};

beforeEach(() => {
  state.upload = fakeUpload(idle);
});

// ─────────────────────────────── The Video option ───────────────────────────

describe("the Video option", () => {
  it("is offered to creators beside Image", () => {
    const html = render(idle);
    expect(buttonFor(html, "Image")).toBeDefined();
    expect(buttonFor(html, "Video")).toBeDefined();
  });

  it("accepts only the Stream allowlist on its file input", () => {
    const html = render(idle);
    expect(html).toContain('accept="video/mp4,video/quicktime,video/webm"');
  });

  it("is enabled on an empty post", () => {
    const html = render(idle);
    expect(isDisabled(buttonFor(html, "Video"))).toBe(false);
    expect(isDisabled(buttonFor(html, "Image"))).toBe(false);
  });

  it("shows no video card until a video is chosen", () => {
    expect(render(idle)).not.toContain('aria-label="Video upload"');
  });
});

// ─────────────────────────────── XOR wiring ─────────────────────────────────

describe("one-video-XOR-images", () => {
  it("disables Image while a video occupies the post, with a reason", () => {
    for (const session of [uploading, processing, ready]) {
      const html = render(session);
      const image = buttonFor(html, "Image");
      expect(isDisabled(image)).toBe(true);
      expect(titleOf(image)).toMatch(/can&#x27;t mix video and images|can't mix video and images/);
    }
  });

  it("disables a second Video while one is already in flight", () => {
    const html = render(uploading);
    const video = buttonFor(html, "Video");
    expect(isDisabled(video)).toBe(true);
    expect(titleOf(video)).toMatch(/already has a video/i);
  });

  it("keeps Image blocked while a canceled video still owes a detach", () => {
    const html = render(canceledDetach);
    expect(isDisabled(buttonFor(html, "Image"))).toBe(true);
  });
});

// ─────────────────────────────── The upload card ────────────────────────────

describe("the upload card", () => {
  it("renders once a session exists", () => {
    const html = render(uploading);
    expect(html).toContain('aria-label="Video upload"');
    expect(html).toContain('data-phase="uploading"');
    expect(html).toContain("250 B of 1 KB · 25%");
  });

  it("surfaces the detach-required state instead of pretending removal worked", () => {
    const html = render(canceledDetach);
    expect(html).toContain('data-phase="canceled_detach_required"');
    expect(html).toContain("Video still attached");
  });
});

// ─────────────────────────────── Publish / draft gates ──────────────────────

describe("publish button state", () => {
  it("is disabled while the video is uploading, with a visible reason", () => {
    const html = render(uploading);
    const publish = buttonFor(html, "Publish");
    expect(isDisabled(publish)).toBe(true);
    expect(html).toMatch(/Wait for the video to finish uploading/i);
  });

  it("is disabled while the video is processing, and says a draft is still possible", () => {
    const html = render(processing);
    expect(isDisabled(buttonFor(html, "Publish"))).toBe(true);
    expect(html).toMatch(/still processing/i);
  });

  it("is disabled while a canceled video is still attached", () => {
    const html = render(canceledDetach);
    expect(isDisabled(buttonFor(html, "Publish"))).toBe(true);
    expect(html).toMatch(/still attached to this post/i);
  });

  it("is ENABLED once the video is ready", () => {
    const html = render(ready);
    expect(isDisabled(buttonFor(html, "Publish"))).toBe(false);
  });

  it("is disabled on an empty composer (no caption, no media)", () => {
    const html = render(idle);
    expect(isDisabled(buttonFor(html, "Publish"))).toBe(true);
  });
});

describe("draft button state", () => {
  it("stays ENABLED right through the upload — the draft is the point", () => {
    for (const session of [uploading, processing]) {
      const html = render(session);
      expect(isDisabled(buttonFor(html, "Save draft"))).toBe(false);
    }
  });

  it("is disabled on an empty composer", () => {
    expect(isDisabled(buttonFor(render(idle), "Save draft"))).toBe(true);
  });
});

// ─────────────────────────────── Scope invariants ───────────────────────────

describe("scope invariants", () => {
  it("renders no player anywhere in the composer", () => {
    for (const session of [idle, uploading, processing, ready, canceledDetach]) {
      const html = render(session);
      expect(html).not.toContain("<video");
      expect(html).not.toContain("autoplay");
      expect(html).not.toContain("cloudflarestream.com");
    }
  });

  it("never renders a raw error code or a stream id", () => {
    for (const session of [uploading, processing, ready, canceledDetach]) {
      const html = render(session);
      expect(html).not.toContain("vid-abc");
      expect(html).not.toContain("upload_failed");
    }
  });
});
