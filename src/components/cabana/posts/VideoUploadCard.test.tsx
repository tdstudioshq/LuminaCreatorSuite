// ============================================================================
// VideoUploadCard — render tests.
//
// The repo's vitest runs in `environment: "node"` and jsdom / @testing-library
// are NOT dependencies (adding them is out of scope for 5A.3). So the card is
// rendered with `react-dom/server` (already a dependency), which needs no DOM
// and still exercises the real component: every phase's markup, its ARIA, which
// controls are present/enabled, and — critically — that no raw error text, no
// player, and no transport ever reach the output.
//
// Click dispatch needs a DOM, so the *behavior* behind each control is covered
// where it lives: `resolveVideoControls` (which control is live per phase, in
// cabana-composer-media.test.ts) and the 5A.2 controller tests (what pause /
// resume / retry / cancel actually do). See use-stream-upload.test.ts.
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VideoUploadCard } from "@/components/cabana/posts/VideoUploadCard";
import type { UploadSession } from "@/lib/cabana-stream-upload";

const noop = () => {};

function render(
  session: UploadSession,
  rejection: Parameters<typeof VideoUploadCard>[0]["rejection"] = null,
) {
  return renderToStaticMarkup(
    <VideoUploadCard
      session={session}
      rejection={rejection}
      onChooseFile={noop}
      onPause={noop}
      onResume={noop}
      onRetry={noop}
      onCancel={noop}
      onRemove={noop}
      onDetach={noop}
      onDismiss={noop}
    />,
  );
}

const idle: UploadSession = { phase: "idle" };
const ticketing: UploadSession = {
  phase: "ticketing",
  fileName: "clip.mp4",
  totalBytes: 1_000,
  ticketAttempt: 1,
};
const uploading: UploadSession = {
  phase: "uploading",
  streamVideoId: "v1",
  fileName: "clip.mp4",
  totalBytes: 1_000,
  bytesSent: 250,
  progressPercent: 25,
  uploadAttempt: 1,
};
const paused: UploadSession = { ...uploading, phase: "paused" };
const attaching: UploadSession = {
  phase: "attaching",
  streamVideoId: "v1",
  postId: "p1",
  attachAttempt: 1,
};
const processing: UploadSession = { phase: "processing", streamVideoId: "v1", postId: "p1" };
const ready: UploadSession = { phase: "ready", streamVideoId: "v1", postId: "p1" };
const retryableError: UploadSession = {
  phase: "error",
  code: "network",
  category: "upload",
  recoverable: true,
  attempt: 1,
  resume: {
    phase: "uploading",
    streamVideoId: "v1",
    fileName: "clip.mp4",
    totalBytes: 1_000,
    bytesSent: 250,
  },
};
const terminalError: UploadSession = {
  phase: "error",
  code: "unauthorized",
  category: "attach",
  recoverable: false,
  attempt: 1,
  resume: { phase: "attaching", streamVideoId: "v1", postId: "p1" },
};
const canceledClean: UploadSession = {
  phase: "canceled",
  cleanupRequired: false,
  detachRequired: false,
  streamVideoId: null,
};
const canceledSettling: UploadSession = {
  phase: "canceled",
  cleanupRequired: true,
  detachRequired: false,
  streamVideoId: "v1",
};
const canceledDetach: UploadSession = {
  phase: "canceled",
  cleanupRequired: true,
  detachRequired: true,
  streamVideoId: "v1",
};

const ALL: readonly (readonly [string, UploadSession])[] = [
  ["idle", idle],
  ["ticketing", ticketing],
  ["uploading", uploading],
  ["paused", paused],
  ["attaching", attaching],
  ["processing", processing],
  ["ready", ready],
  ["error(retryable)", retryableError],
  ["error(terminal)", terminalError],
  ["canceled(clean)", canceledClean],
  ["canceled(settling)", canceledSettling],
  ["canceled(detach)", canceledDetach],
];

/** Buttons whose label matches, with their surrounding markup, for state checks. */
function buttons(html: string): string[] {
  return html.match(/<button[^>]*>.*?<\/button>/gs) ?? [];
}

function buttonFor(html: string, label: string): string | undefined {
  return buttons(html).find((b) => b.includes(label));
}

/**
 * The real `disabled` ATTRIBUTE. A substring check can't be used: every Button
 * carries Tailwind's `disabled:pointer-events-none disabled:opacity-60` classes,
 * so "disabled" appears in the class list of enabled buttons too.
 */
function isDisabled(buttonHtml: string | undefined): boolean {
  if (buttonHtml === undefined) return false;
  const openTag = buttonHtml.slice(0, buttonHtml.indexOf(">") + 1);
  return /\sdisabled(=""|\s|>)/.test(openTag);
}

/** SSR escapes text, so `isn't` renders as `isn&#x27;t`. Decode before matching. */
function text(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

// ─────────────────────────────── Every phase renders ────────────────────────

describe("VideoUploadCard — phases", () => {
  it.each(ALL)("renders %s with a labelled region and a live status", (_name, session) => {
    const html = render(session);
    expect(html).toContain('aria-label="Video upload"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("tags each phase with a stable data-phase hook", () => {
    expect(render(idle)).toContain('data-phase="idle"');
    expect(render(uploading)).toContain('data-phase="uploading"');
    expect(render(paused)).toContain('data-phase="paused"');
    expect(render(ready)).toContain('data-phase="ready"');
    expect(render(canceledSettling)).toContain('data-phase="canceled_settling"');
    expect(render(canceledDetach)).toContain('data-phase="canceled_detach_required"');
    expect(render(canceledClean)).toContain('data-phase="canceled"');
  });
});

// ─────────────────────────────── Idle / file selection ──────────────────────

describe("idle — select a file", () => {
  it("offers a file picker and states the real policy", () => {
    const html = render(idle);
    expect(html).toContain("Choose video");
    expect(html).toContain("MP4, MOV, or WebM");
    expect(html).not.toMatch(/mkv/i);
    expect(html).toContain("1 GB");
    expect(html).toContain("10 minutes");
  });

  it("can be dismissed", () => {
    expect(render(idle)).toContain('aria-label="Cancel adding a video"');
  });

  it("shows no progress bar before a file exists", () => {
    expect(render(idle)).not.toContain('role="progressbar"');
  });
});

// ─────────────────────────────── Progress semantics ─────────────────────────

describe("uploading — progress", () => {
  it("renders a determinate progressbar with the real percentage", () => {
    const html = render(uploading);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain('aria-label="Video upload progress"');
  });

  it("shows bytes sent, total, and percent", () => {
    const html = render(uploading);
    expect(html).toContain("250 B of 1 KB · 25%");
    expect(html).toContain('aria-valuetext="250 B of 1 KB · 25%"');
  });

  it("names the file being uploaded", () => {
    expect(render(uploading)).toContain("clip.mp4");
  });

  it("offers Pause and Cancel, but not Resume", () => {
    const html = render(uploading);
    expect(buttonFor(html, "Pause")).toBeDefined();
    expect(buttonFor(html, "Cancel upload")).toBeDefined();
    expect(buttonFor(html, "Resume")).toBeUndefined();
  });

  it("is honestly indeterminate where no percentage exists", () => {
    for (const session of [ticketing, attaching, processing]) {
      const html = render(session);
      expect(html).toContain('role="progressbar"');
      expect(html).not.toContain("aria-valuenow");
    }
  });
});

describe("paused", () => {
  it("offers Resume and Cancel, but not Pause", () => {
    const html = render(paused);
    expect(buttonFor(html, "Resume")).toBeDefined();
    expect(buttonFor(html, "Cancel upload")).toBeDefined();
    expect(buttonFor(html, "Pause")).toBeUndefined();
  });

  it("keeps the byte counts while paused", () => {
    expect(render(paused)).toContain("250 B of 1 KB · 25%");
  });
});

// ─────────────────────────────── Attaching / processing / ready ─────────────

describe("attaching, processing, ready", () => {
  it("says the upload finished while attaching", () => {
    expect(render(attaching)).toContain("Attaching to your post");
  });

  it("tells the creator processing continues without them", () => {
    expect(render(processing)).toMatch(/save a draft/i);
  });

  it("reports a ready video", () => {
    expect(render(ready)).toContain("Video ready");
  });
});

// ─────────────────────────────── Errors ─────────────────────────────────────

describe("errors", () => {
  it("offers Retry on a recoverable failure", () => {
    const html = render(retryableError);
    expect(buttonFor(html, "Retry")).toBeDefined();
    expect(buttonFor(html, "Cancel upload")).toBeDefined();
  });

  it("offers NO Retry on a terminal failure — only a way out", () => {
    const html = render(terminalError);
    expect(buttonFor(html, "Retry")).toBeUndefined();
    expect(buttonFor(html, "Cancel upload")).toBeDefined();
  });

  it("shows safe copy, never a raw code or upstream message", () => {
    const html = render(retryableError);
    expect(html).toContain("Connection lost");
    expect(html).not.toContain("network");
    expect(html).not.toContain("upload_failed");
    expect(html).not.toContain("v1"); // no stream video id leaks into the UI
  });

  it("renders a local file rejection as an alert with stable copy", () => {
    const html = render(idle, { reason: "too_large" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("1 GB");
    expect(html).not.toContain("too_large");
  });
});

// ─────────────────────────────── Cancel / cleanup / detach ──────────────────

describe("cancellation and cleanup", () => {
  it("does NOT claim completion while cleanup is still settling", () => {
    const html = render(canceledSettling);
    expect(html).toContain("Canceling");
    expect(html).not.toContain("Upload canceled");
    const remove = buttonFor(html, "Remove");
    expect(remove).toBeDefined();
    expect(isDisabled(remove)).toBe(true);
  });

  it("enables Remove only once the cancel has fully settled", () => {
    const html = render(canceledClean);
    expect(html).toContain("Upload canceled");
    expect(html).toMatch(/nothing was kept/i);
    const remove = buttonFor(html, "Remove");
    expect(remove).toBeDefined();
    expect(isDisabled(remove)).toBe(false);
  });

  it("still reports a detach-required cancel rather than pretending it is gone", () => {
    const html = render(canceledDetach);
    expect(html).toContain("Video still attached");
    // The detach control is live now, so this cancel has a way out.
    expect(isDisabled(buttonFor(html, "Remove video"))).toBe(false);
  });

  it("offers a live removal for a ready video, warning that it deletes the upload", () => {
    const html = render(ready);
    const remove = buttonFor(html, "Remove video");
    expect(remove).toBeDefined();
    expect(isDisabled(remove)).toBe(false);
    expect(text(remove ?? "")).toMatch(/deletes the uploaded file/i);
  });

  it("disables removal while a detach is in flight, so it cannot be double-fired", () => {
    const html = renderToStaticMarkup(
      <VideoUploadCard
        session={ready}
        rejection={null}
        onChooseFile={noop}
        onPause={noop}
        onResume={noop}
        onRetry={noop}
        onCancel={noop}
        onRemove={noop}
        onDetach={noop}
        detaching
        onDismiss={noop}
      />,
    );
    expect(isDisabled(buttonFor(html, "Removing"))).toBe(true);
  });
});

// ─────────────────────────────── Scope + a11y invariants ────────────────────

describe("scope invariants", () => {
  it("renders NO player in any phase — 5A.3 is upload-only", () => {
    for (const [, session] of ALL) {
      const html = render(session);
      expect(html).not.toContain("<video");
      expect(html).not.toContain("autoplay");
      expect(html).not.toContain("<source");
      expect(html).not.toContain(".m3u8");
      expect(html).not.toContain("cloudflarestream.com");
    }
  });

  it("never leaks an upload URL or a token", () => {
    for (const [, session] of ALL) {
      const html = render(session);
      // Icon SVGs legitimately carry the w3.org namespace — anything else is a leak.
      const urls = (html.match(/https?:\/\/[^\s"']+/g) ?? []).filter(
        (url) => !url.startsWith("http://www.w3.org/"),
      );
      expect(urls).toEqual([]);
      expect(html).not.toMatch(/token/i);
    }
  });

  it("never renders the stream video id or the post id", () => {
    // Distinctive sentinels: a short id like "v1" collides with SVG path data.
    const UID = "SENTINELSTREAMUID9f3a";
    const PID = "SENTINELPOSTID7b2c";
    const sessions: readonly UploadSession[] = [
      {
        phase: "uploading",
        streamVideoId: UID,
        fileName: "clip.mp4",
        totalBytes: 1_000,
        bytesSent: 250,
        progressPercent: 25,
        uploadAttempt: 1,
      },
      { phase: "attaching", streamVideoId: UID, postId: PID, attachAttempt: 1 },
      { phase: "processing", streamVideoId: UID, postId: PID },
      { phase: "ready", streamVideoId: UID, postId: PID },
      { phase: "canceled", cleanupRequired: true, detachRequired: true, streamVideoId: UID },
    ];
    for (const session of sessions) {
      const html = render(session);
      expect(html).not.toContain(UID);
      expect(html).not.toContain(PID);
    }
  });

  it("gives every interactive target a 44px minimum on BOTH axes", () => {
    // The icon variant is 40×40, so width needs the floor as much as height.
    for (const [, session] of ALL) {
      for (const button of buttons(render(session))) {
        expect(button).toContain("min-h-11");
        expect(button).toContain("min-w-11");
      }
    }
  });

  it("labels every icon-only control", () => {
    // The dismiss control is the only icon-only button; it must carry a name.
    const html = render(idle);
    expect(html).toContain('aria-label="Cancel adding a video"');
  });

  it("imports no transport, no Cloudflare client, and no server module", () => {
    // Scan the IMPORT SPECIFIERS, not the raw text — the file's own header
    // comment names tus-js-client while explaining that it must never be imported.
    const forbidden = [
      "tus-js-client",
      "stream-tus-client",
      "stream-cloudflare",
      "stream-actions",
      "stream-webhook",
      ".server",
      "supabase",
    ];
    for (const file of ["VideoUploadCard.tsx", "PostComposer.tsx"]) {
      const source = readFileSync(join(process.cwd(), "src/components/cabana/posts", file), "utf8");
      const specifiers = [...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)"/gms)].map(
        (match) => match[1],
      );
      expect(specifiers.length).toBeGreaterThan(0);
      for (const specifier of specifiers) {
        for (const banned of forbidden) {
          expect(specifier).not.toContain(banned);
        }
      }
    }
  });
});
