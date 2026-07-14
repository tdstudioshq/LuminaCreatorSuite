import { describe, expect, it, vi } from "vitest";
import {
  type BeforeUnloadLike,
  type ComposerGateInput,
  VIDEO_ACCEPT_ATTRIBUTE,
  acceptedVideoLabel,
  bindBeforeUnloadGuard,
  canAddImages,
  canSelectVideo,
  composerHasContent,
  describeCleanupDebt,
  describeUploadPhase,
  describeUploadProgress,
  evaluateComposerDraft,
  evaluateComposerPublish,
  formatUploadBytes,
  preflightRejectionCopy,
  readyRemovalBlockedReason,
  resolveVideoControls,
  shouldWarnBeforeUnload,
  uploadErrorCopy,
  uploadFileName,
  videoOccupiesPost,
} from "@/lib/cabana-composer-media";
import { MEDIA_PER_POST_MAX } from "@/lib/cabana-posts";
import {
  UPLOAD_ERROR_CODES,
  UPLOAD_RETRY_LIMITS,
  type UploadErrorCode,
  type UploadFailureCategory,
  type UploadSession,
} from "@/lib/cabana-stream-upload";

// ─────────────────────────────── Fixtures ───────────────────────────────────

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

const exhaustedError: UploadSession = {
  ...retryableError,
  attempt: UPLOAD_RETRY_LIMITS.upload,
} as UploadSession;

const terminalError: UploadSession = {
  phase: "error",
  code: "unauthorized",
  category: "attach",
  recoverable: false,
  attempt: 1,
  resume: { phase: "attaching", streamVideoId: "v1", postId: "p1" },
};

const ticketError: UploadSession = {
  phase: "error",
  code: "timeout",
  category: "ticket",
  recoverable: true,
  attempt: 1,
  resume: { phase: "ticketing", fileName: "clip.mp4", totalBytes: 1_000 },
};

const processingError: UploadSession = {
  phase: "error",
  code: "processing_failed",
  category: "processing",
  recoverable: false,
  attempt: 1,
  resume: { phase: "processing", streamVideoId: "v1", postId: "p1" },
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

const ALL_SESSIONS: readonly (readonly [string, UploadSession])[] = [
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

function gate(overrides: Partial<ComposerGateInput> = {}): ComposerGateInput {
  return {
    captionLength: 5,
    imageCount: 0,
    session: idle,
    priceValid: true,
    subscribersUnsellable: false,
    busy: false,
    ...overrides,
  };
}

// ─────────────────────────────── Occupancy / mode ───────────────────────────

describe("videoOccupiesPost", () => {
  it("is false only for idle and a fully settled cancel", () => {
    expect(videoOccupiesPost(idle)).toBe(false);
    expect(videoOccupiesPost(canceledClean)).toBe(false);
  });

  it("is true for every live phase and every cancel that still owes something", () => {
    for (const session of [
      ticketing,
      uploading,
      paused,
      attaching,
      processing,
      ready,
      retryableError,
      terminalError,
      canceledSettling,
      canceledDetach,
    ]) {
      expect(videoOccupiesPost(session)).toBe(true);
    }
  });
});

// ─────────────────────────────── XOR selection gates ────────────────────────

describe("canSelectVideo — images block video", () => {
  it("refuses while any image is attached", () => {
    const decision = canSelectVideo({ imageCount: 1, session: idle });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/only media/i);
  });

  it("allows on a genuinely empty post", () => {
    expect(canSelectVideo({ imageCount: 0, session: idle })).toEqual({ allowed: true });
  });

  it("refuses while another video already occupies the post", () => {
    const decision = canSelectVideo({ imageCount: 0, session: uploading });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/already has a video/i);
  });

  it("refuses a canceled session with outstanding debt", () => {
    const decision = canSelectVideo({ imageCount: 0, session: canceledSettling });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/finish removing/i);
  });

  it("refuses a settled cancel until the card is removed", () => {
    const decision = canSelectVideo({ imageCount: 0, session: canceledClean });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/remove the canceled upload/i);
  });
});

describe("canAddImages — video blocks images", () => {
  it("refuses while a video occupies the post", () => {
    for (const session of [ticketing, uploading, paused, attaching, processing, ready]) {
      const decision = canAddImages({ imageCount: 0, session });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toMatch(/can't mix video and images/i);
    }
  });

  it("refuses while a canceled video still owes a detach", () => {
    const decision = canAddImages({ imageCount: 0, session: canceledDetach });
    expect(decision.allowed).toBe(false);
  });

  it("refuses a settled cancel until the card is removed", () => {
    const decision = canAddImages({ imageCount: 0, session: canceledClean });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/remove the canceled upload/i);
  });

  it("enforces the image cap", () => {
    const decision = canAddImages({ imageCount: MEDIA_PER_POST_MAX, session: idle });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain(String(MEDIA_PER_POST_MAX));
  });

  it("allows below the cap on an empty session", () => {
    expect(canAddImages({ imageCount: 1, session: idle })).toEqual({ allowed: true });
  });

  it("offers BOTH options on an empty post — the XOR binds once media is chosen", () => {
    expect(canAddImages({ imageCount: 0, session: idle }).allowed).toBe(true);
    expect(canSelectVideo({ imageCount: 0, session: idle }).allowed).toBe(true);
  });

  it("never permits both once either kind of media exists", () => {
    // A video in any live phase closes the image path…
    for (const [, session] of ALL_SESSIONS.filter(([name]) => name !== "idle")) {
      const images = canAddImages({ imageCount: 0, session });
      const video = canSelectVideo({ imageCount: 0, session });
      expect(images.allowed && video.allowed).toBe(false);
    }
    // …and an image closes the video path.
    expect(canSelectVideo({ imageCount: 1, session: idle }).allowed).toBe(false);
    expect(canAddImages({ imageCount: 1, session: idle }).allowed).toBe(true);
  });
});

// ─────────────────────────────── Safe copy ──────────────────────────────────

describe("uploadErrorCopy", () => {
  it("has stable, non-empty copy for every code and category", () => {
    const categories: UploadFailureCategory[] = [
      "ticket",
      "upload",
      "attach",
      "processing",
      "polling",
      "cleanup",
    ];
    for (const code of UPLOAD_ERROR_CODES) {
      for (const category of categories) {
        const copy = uploadErrorCopy(code, category);
        expect(copy.title.length).toBeGreaterThan(0);
        expect(copy.detail.length).toBeGreaterThan(0);
        expect(copy.stage.length).toBeGreaterThan(0);
      }
    }
  });

  it("never echoes a raw code or upstream text into the title", () => {
    for (const code of UPLOAD_ERROR_CODES) {
      const copy = uploadErrorCopy(code as UploadErrorCode, "upload");
      expect(copy.title).not.toContain("_");
      expect(copy.title).not.toContain(code);
    }
  });
});

describe("preflightRejectionCopy", () => {
  it("states the real policy — MP4/MOV/WebM only, never a format we reject", () => {
    const copy = preflightRejectionCopy("unsupported_mime_type");
    expect(copy).toContain("MP4");
    expect(copy).toContain("MOV");
    expect(copy).toContain("WebM");
    expect(copy).not.toMatch(/mkv/i);
  });

  it("quotes the real size and duration caps", () => {
    expect(preflightRejectionCopy("too_large")).toContain("1 GB");
    expect(preflightRejectionCopy("too_long")).toContain("10 minutes");
  });

  it("has copy for an unreadable file", () => {
    expect(preflightRejectionCopy("invalid_size")).toMatch(/empty or unreadable/i);
  });
});

describe("acceptedVideoLabel", () => {
  it("renders the default allowlist in prose", () => {
    expect(acceptedVideoLabel()).toBe("MP4, MOV, or WebM");
  });

  it("degrades unknown MIME types to the raw type instead of lying", () => {
    expect(acceptedVideoLabel(["video/mp4", "video/x-matroska"])).toBe("MP4, or video/x-matroska");
  });

  it("handles single and empty lists", () => {
    expect(acceptedVideoLabel(["video/webm"])).toBe("WebM");
    expect(acceptedVideoLabel([])).toBe("");
  });

  it("exposes the allowlist as the file input's accept attribute", () => {
    expect(VIDEO_ACCEPT_ATTRIBUTE).toBe("video/mp4,video/quicktime,video/webm");
  });
});

// ─────────────────────────────── Phase presentation ─────────────────────────

describe("describeUploadPhase", () => {
  it("gives every session a non-empty title and detail", () => {
    for (const [, session] of ALL_SESSIONS) {
      const view = describeUploadPhase(session);
      expect(view.title.length).toBeGreaterThan(0);
      expect(view.detail.length).toBeGreaterThan(0);
    }
  });

  it("maps each phase to its own key", () => {
    expect(describeUploadPhase(idle).key).toBe("idle");
    expect(describeUploadPhase(ticketing).key).toBe("ticketing");
    expect(describeUploadPhase(uploading).key).toBe("uploading");
    expect(describeUploadPhase(paused).key).toBe("paused");
    expect(describeUploadPhase(attaching).key).toBe("attaching");
    expect(describeUploadPhase(processing).key).toBe("processing");
    expect(describeUploadPhase(ready).key).toBe("ready");
    expect(describeUploadPhase(retryableError).key).toBe("error");
  });

  it("splits cancel three ways so it never claims a lie", () => {
    expect(describeUploadPhase(canceledClean).key).toBe("canceled");
    expect(describeUploadPhase(canceledSettling).key).toBe("canceled_settling");
    expect(describeUploadPhase(canceledDetach).key).toBe("canceled_detach_required");
    // A settling cancel must not say it is done.
    expect(describeUploadPhase(canceledSettling).busy).toBe(true);
    expect(describeUploadPhase(canceledClean).detail).toMatch(/nothing was kept/i);
  });

  it("tones a recoverable error as a warning and a terminal one as danger", () => {
    expect(describeUploadPhase(retryableError).tone).toBe("warning");
    expect(describeUploadPhase(terminalError).tone).toBe("danger");
    expect(describeUploadPhase(canceledDetach).tone).toBe("danger");
    expect(describeUploadPhase(ready).tone).toBe("success");
  });

  it("marks only genuinely in-flight phases busy", () => {
    expect(describeUploadPhase(ticketing).busy).toBe(true);
    expect(describeUploadPhase(uploading).busy).toBe(true);
    expect(describeUploadPhase(attaching).busy).toBe(true);
    expect(describeUploadPhase(processing).busy).toBe(true);
    expect(describeUploadPhase(paused).busy).toBe(false);
    expect(describeUploadPhase(ready).busy).toBe(false);
    expect(describeUploadPhase(retryableError).busy).toBe(false);
  });

  it("carries the failure stage into the error detail", () => {
    expect(describeUploadPhase(ticketError).detail).toMatch(/preparing the upload/i);
    expect(describeUploadPhase(processingError).detail).toMatch(/being processed/i);
  });

  it("tells the creator processing continues without them", () => {
    expect(describeUploadPhase(processing).detail).toMatch(/save a draft/i);
  });
});

// ─────────────────────────────── Controls ───────────────────────────────────

describe("resolveVideoControls", () => {
  it("offers a file picker only while idle", () => {
    expect(resolveVideoControls(idle).canChooseFile).toBe(true);
    for (const [, session] of ALL_SESSIONS.filter(([name]) => name !== "idle")) {
      expect(resolveVideoControls(session).canChooseFile).toBe(false);
    }
  });

  it("pairs pause with uploading and resume with paused", () => {
    expect(resolveVideoControls(uploading).canPause).toBe(true);
    expect(resolveVideoControls(uploading).canResume).toBe(false);
    expect(resolveVideoControls(paused).canResume).toBe(true);
    expect(resolveVideoControls(paused).canPause).toBe(false);
  });

  it("offers retry only for a recoverable, un-exhausted error", () => {
    expect(resolveVideoControls(retryableError).canRetry).toBe(true);
    expect(resolveVideoControls(terminalError).canRetry).toBe(false);
    expect(resolveVideoControls(exhaustedError).canRetry).toBe(false);
    expect(resolveVideoControls(uploading).canRetry).toBe(false);
  });

  it("offers cancel through every in-flight phase and from an error", () => {
    for (const session of [ticketing, uploading, paused, attaching, processing, retryableError]) {
      expect(resolveVideoControls(session).canCancel).toBe(true);
    }
    for (const session of [idle, ready, canceledClean, canceledSettling]) {
      expect(resolveVideoControls(session).canCancel).toBe(false);
    }
  });

  it("permits removal ONLY once a cancel is fully settled", () => {
    expect(resolveVideoControls(canceledClean).canRemove).toBe(true);
    expect(resolveVideoControls(canceledSettling).canRemove).toBe(false);
    expect(resolveVideoControls(canceledDetach).canRemove).toBe(false);
  });

  it("never offers removal of a READY video — it is attached (5A.4 detach flow)", () => {
    expect(resolveVideoControls(ready).canRemove).toBe(false);
    expect(readyRemovalBlockedReason(ready)).toMatch(/attached/i);
    expect(readyRemovalBlockedReason(idle)).toBeNull();
    expect(readyRemovalBlockedReason(canceledClean)).toBeNull();
  });

  it("never offers removal from an error — the exit is cancel → cleanup → remove", () => {
    expect(resolveVideoControls(retryableError).canRemove).toBe(false);
    expect(resolveVideoControls(terminalError).canRemove).toBe(false);
  });
});

// ─────────────────────────────── Cleanup debt ───────────────────────────────

describe("describeCleanupDebt", () => {
  it("reports no debt for a settled or live session", () => {
    for (const session of [idle, uploading, ready, canceledClean]) {
      const debt = describeCleanupDebt(session);
      expect(debt.outstanding).toBe(false);
      expect(debt.steps).toEqual([]);
      expect(debt.blockedReason).toBeNull();
    }
  });

  it("reports a delete-only debt for a settling cancel", () => {
    const debt = describeCleanupDebt(canceledSettling);
    expect(debt.outstanding).toBe(true);
    expect(debt.detachRequired).toBe(false);
    expect(debt.steps).toEqual(["delete_remote_video"]);
    expect(debt.blockedReason).toBeNull();
  });

  it("orders detach BEFORE delete and blocks with an honest reason", () => {
    const debt = describeCleanupDebt(canceledDetach);
    expect(debt.outstanding).toBe(true);
    expect(debt.detachRequired).toBe(true);
    expect(debt.steps).toEqual(["detach_post_media", "delete_remote_video"]);
    expect(debt.blockedReason).toMatch(/attached/i);
  });
});

// ─────────────────────────────── Progress ───────────────────────────────────

describe("formatUploadBytes", () => {
  it("scales through the decimal units", () => {
    expect(formatUploadBytes(0)).toBe("0 B");
    expect(formatUploadBytes(999)).toBe("999 B");
    expect(formatUploadBytes(1_000)).toBe("1 KB");
    expect(formatUploadBytes(1_500)).toBe("1.5 KB");
    expect(formatUploadBytes(1_500_000)).toBe("1.5 MB");
    expect(formatUploadBytes(2_400_000_000)).toBe("2.4 GB");
  });

  it("refuses to render nonsense as a size", () => {
    expect(formatUploadBytes(-1)).toBe("0 B");
    expect(formatUploadBytes(Number.NaN)).toBe("0 B");
  });
});

describe("describeUploadProgress", () => {
  it("reports real bytes and percent while uploading", () => {
    const view = describeUploadProgress(uploading);
    expect(view.percent).toBe(25);
    expect(view.label).toBe("250 B of 1 KB · 25%");
  });

  it("keeps the byte counts while paused", () => {
    expect(describeUploadProgress(paused).percent).toBe(25);
  });

  it("is honestly indeterminate where no percentage exists", () => {
    expect(describeUploadProgress(ticketing).percent).toBeNull();
    expect(describeUploadProgress(attaching).percent).toBeNull();
    expect(describeUploadProgress(processing).percent).toBeNull();
    expect(describeUploadProgress(ticketing).label).toMatch(/preparing/i);
  });

  it("reports a complete upload at 100%", () => {
    expect(describeUploadProgress(ready)).toEqual({ percent: 100, label: "Upload complete" });
  });

  it("renders no progress at all for idle, error, and canceled", () => {
    for (const session of [idle, retryableError, canceledClean]) {
      expect(describeUploadProgress(session)).toEqual({ percent: null, label: "" });
    }
  });
});

describe("uploadFileName", () => {
  it("surfaces the name in the phases that carry one", () => {
    expect(uploadFileName(ticketing)).toBe("clip.mp4");
    expect(uploadFileName(uploading)).toBe("clip.mp4");
    expect(uploadFileName(paused)).toBe("clip.mp4");
  });

  it("recovers the name from an error's resume snapshot", () => {
    expect(uploadFileName(retryableError)).toBe("clip.mp4");
    expect(uploadFileName(ticketError)).toBe("clip.mp4");
  });

  it("has no name once the file is past the transport", () => {
    expect(uploadFileName(terminalError)).toBeNull();
    expect(uploadFileName(processingError)).toBeNull();
    expect(uploadFileName(attaching)).toBeNull();
    expect(uploadFileName(ready)).toBeNull();
    expect(uploadFileName(idle)).toBeNull();
  });
});

// ─────────────────────────────── Draft gate ─────────────────────────────────

describe("composerHasContent", () => {
  it("counts a caption, an image, or any live video session", () => {
    expect(composerHasContent({ captionLength: 1, imageCount: 0, session: idle })).toBe(true);
    expect(composerHasContent({ captionLength: 0, imageCount: 1, session: idle })).toBe(true);
    expect(composerHasContent({ captionLength: 0, imageCount: 0, session: uploading })).toBe(true);
    expect(composerHasContent({ captionLength: 0, imageCount: 0, session: idle })).toBe(false);
  });
});

describe("evaluateComposerDraft", () => {
  it("stays available through the whole upload — that is the point of a draft", () => {
    for (const session of [ticketing, uploading, paused, attaching, processing]) {
      expect(evaluateComposerDraft(gate({ session, captionLength: 0 }))).toEqual({ allowed: true });
    }
  });

  it("blocks an empty composer", () => {
    const result = evaluateComposerDraft(gate({ captionLength: 0 }));
    expect(result.allowed).toBe(false);
  });

  it("blocks an invalid unlock price", () => {
    const result = evaluateComposerDraft(gate({ priceValid: false }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/unlock price/i);
  });

  it("blocks while a mutation is already in flight", () => {
    expect(evaluateComposerDraft(gate({ busy: true })).allowed).toBe(false);
  });

  it("allows a subscribers-only draft with no tier (only publish is blocked)", () => {
    expect(evaluateComposerDraft(gate({ subscribersUnsellable: true }))).toEqual({ allowed: true });
  });
});

// ─────────────────────────────── Publish gate ───────────────────────────────

describe("evaluateComposerPublish", () => {
  it("allows a caption-only post with no video", () => {
    expect(evaluateComposerPublish(gate())).toEqual({ allowed: true });
  });

  it("allows publishing once the video is ready", () => {
    expect(evaluateComposerPublish(gate({ session: ready, captionLength: 0 }))).toEqual({
      allowed: true,
    });
  });

  it("blocks every phase where the video is not ready, with a reason", () => {
    const blocked: readonly UploadSession[] = [
      ticketing,
      uploading,
      paused,
      attaching,
      processing,
      retryableError,
      terminalError,
      canceledClean,
      canceledSettling,
      canceledDetach,
    ];
    for (const session of blocked) {
      const result = evaluateComposerPublish(gate({ session }));
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("names the specific blocker so the creator can act", () => {
    const reasonFor = (session: UploadSession) => {
      const result = evaluateComposerPublish(gate({ session }));
      return result.allowed ? "" : result.reason;
    };
    expect(reasonFor(uploading)).toMatch(/finish uploading/i);
    expect(reasonFor(paused)).toMatch(/resume/i);
    expect(reasonFor(processing)).toMatch(/still processing/i);
    expect(reasonFor(retryableError)).toMatch(/error/i);
    expect(reasonFor(canceledDetach)).toMatch(/still attached/i);
    expect(reasonFor(canceledSettling)).toMatch(/being removed/i);
    expect(reasonFor(canceledClean)).toMatch(/remove the canceled upload/i);
    expect(reasonFor(ticketing)).toMatch(/wait for/i);
    expect(reasonFor(attaching)).toMatch(/attaching/i);
  });

  it("blocks a subscribers-only post with no active tier", () => {
    const result = evaluateComposerPublish(gate({ subscribersUnsellable: true }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/subscription tier/i);
  });

  it("blocks an empty composer, a bad price, and a busy mutation", () => {
    expect(evaluateComposerPublish(gate({ captionLength: 0 })).allowed).toBe(false);
    expect(evaluateComposerPublish(gate({ priceValid: false })).allowed).toBe(false);
    expect(evaluateComposerPublish(gate({ busy: true })).allowed).toBe(false);
  });

  it("checks the video before the tier, so the nearer blocker wins", () => {
    const result = evaluateComposerPublish(
      gate({ session: uploading, subscribersUnsellable: true }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/uploading/i);
  });
});

// ─────────────────────────────── Unload guard ───────────────────────────────

describe("shouldWarnBeforeUnload", () => {
  it("warns while bytes are in flight or a ticket is pending", () => {
    expect(shouldWarnBeforeUnload(ticketing)).toBe(true);
    expect(shouldWarnBeforeUnload(uploading)).toBe(true);
    expect(shouldWarnBeforeUnload(paused)).toBe(true);
    expect(shouldWarnBeforeUnload(attaching)).toBe(true);
  });

  it("warns while a canceled session still owes cleanup or a detach", () => {
    expect(shouldWarnBeforeUnload(canceledSettling)).toBe(true);
    expect(shouldWarnBeforeUnload(canceledDetach)).toBe(true);
  });

  it("does NOT warn while processing — encoding survives the tab closing", () => {
    expect(shouldWarnBeforeUnload(processing)).toBe(false);
  });

  it("does not warn when nothing is at risk", () => {
    expect(shouldWarnBeforeUnload(idle)).toBe(false);
    expect(shouldWarnBeforeUnload(ready)).toBe(false);
    expect(shouldWarnBeforeUnload(canceledClean)).toBe(false);
    expect(shouldWarnBeforeUnload(retryableError)).toBe(false);
  });
});

describe("bindBeforeUnloadGuard", () => {
  function fakeTarget() {
    const listeners: ((event: BeforeUnloadLike) => void)[] = [];
    return {
      listeners,
      addEventListener: vi.fn((_type: "beforeunload", listener: (e: BeforeUnloadLike) => void) => {
        listeners.push(listener);
      }),
      removeEventListener: vi.fn(
        (_type: "beforeunload", listener: (e: BeforeUnloadLike) => void) => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        },
      ),
    };
  }

  it("registers exactly one beforeunload listener", () => {
    const target = fakeTarget();
    bindBeforeUnloadGuard(target, () => true);
    expect(target.addEventListener).toHaveBeenCalledTimes(1);
    expect(target.addEventListener.mock.calls[0][0]).toBe("beforeunload");
    expect(target.listeners).toHaveLength(1);
  });

  it("removes the exact listener it registered", () => {
    const target = fakeTarget();
    const dispose = bindBeforeUnloadGuard(target, () => true);
    const registered = target.listeners[0];
    dispose();
    expect(target.removeEventListener).toHaveBeenCalledTimes(1);
    expect(target.removeEventListener.mock.calls[0][1]).toBe(registered);
    expect(target.listeners).toHaveLength(0);
  });

  it("prompts only when the predicate says something is at risk", () => {
    const target = fakeTarget();
    bindBeforeUnloadGuard(target, () => true);
    const event: BeforeUnloadLike = { preventDefault: vi.fn() };
    target.listeners[0](event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe("");
  });

  it("stays silent when nothing is at risk", () => {
    const target = fakeTarget();
    bindBeforeUnloadGuard(target, () => false);
    const event: BeforeUnloadLike = { preventDefault: vi.fn() };
    target.listeners[0](event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();
  });

  it("reads the predicate at EVENT time, so one binding tracks a live session", () => {
    const target = fakeTarget();
    let session: UploadSession = idle;
    bindBeforeUnloadGuard(target, () => shouldWarnBeforeUnload(session));

    const first: BeforeUnloadLike = { preventDefault: vi.fn() };
    target.listeners[0](first);
    expect(first.preventDefault).not.toHaveBeenCalled();

    session = uploading;
    const second: BeforeUnloadLike = { preventDefault: vi.fn() };
    target.listeners[0](second);
    expect(second.preventDefault).toHaveBeenCalledTimes(1);
  });
});
