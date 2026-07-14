// ============================================================================
// CABANA — cabana-stream-upload unit tests (Checkpoint 5A.1)
// ----------------------------------------------------------------------------
// Pure state-machine, preflight, chunk-selection, and retry-policy coverage.
// No network, no browser, no React — every scenario is a deterministic
// function of (state, event) or plain inputs.
// ============================================================================
import { describe, expect, it } from "vitest";
import {
  STREAM_MAX_DURATION_SECONDS,
  STREAM_MAX_SIZE_BYTES,
  TUS_MIN_CHUNK_BYTES,
  TUS_RECOMMENDED_CHUNK_BYTES,
  isValidTusChunkSize,
} from "@/lib/cabana-stream";
import {
  type UploadErrorCode,
  type UploadSession,
  type UploadSessionEvent,
  type UploadTransitionResult,
  STREAM_CONSTRAINED_CHUNK_BYTES,
  UPLOAD_ERROR_CODES,
  UPLOAD_RETRY_LIMITS,
  UPLOAD_RETRY_MAX_DELAY_MS,
  canRetryUploadSession,
  computeUploadProgressPercent,
  computeUploadRetryDelayMs,
  createIdleUploadSession,
  isRetryableUploadErrorCode,
  normalizeUploadFileName,
  preflightUploadFile,
  requiredCleanupSteps,
  selectTusChunkSize,
  transitionUploadSession,
} from "@/lib/cabana-stream-upload";

const TOTAL = 1_000;

/** Assert a transition succeeded and hand back the new session. */
function must(result: UploadTransitionResult): UploadSession {
  if (!result.ok) throw new Error(`expected ok transition, got denial ${result.denial}`);
  return result.session;
}

function step(session: UploadSession, event: UploadSessionEvent): UploadSession {
  return must(transitionUploadSession(session, event));
}

function expectDenied(
  session: UploadSession,
  event: UploadSessionEvent,
  denial: string,
): UploadTransitionResult {
  const result = transitionUploadSession(session, event);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.denial).toBe(denial);
  return result;
}

// Canonical sessions along the happy path.
const idle = createIdleUploadSession();
const ticketing = () =>
  step(idle, { type: "ticket_requested", fileName: "clip.mp4", totalBytes: TOTAL });
const uploading = () => step(ticketing(), { type: "ticket_received", streamVideoId: "sv-1" });
const midUpload = () => step(uploading(), { type: "upload_progress", bytesSent: 333 });
const paused = () => step(midUpload(), { type: "upload_paused" });
const attaching = () => step(midUpload(), { type: "upload_completed", postId: "post-1" });
const processing = () => step(attaching(), { type: "attachment_completed" });
const ready = () => step(processing(), { type: "status_ready" });

function errorFrom(
  base: UploadSession,
  event: UploadSessionEvent,
): Extract<UploadSession, { phase: "error" }> {
  const next = step(base, event);
  expect(next.phase).toBe("error");
  return next as Extract<UploadSession, { phase: "error" }>;
}

describe("upload session — happy path", () => {
  it("walks idle → ticketing → uploading → attaching → processing → ready", () => {
    const t = ticketing();
    expect(t).toEqual({
      phase: "ticketing",
      fileName: "clip.mp4",
      totalBytes: TOTAL,
      ticketAttempt: 1,
    });

    const u = uploading();
    expect(u).toEqual({
      phase: "uploading",
      streamVideoId: "sv-1",
      fileName: "clip.mp4",
      totalBytes: TOTAL,
      bytesSent: 0,
      progressPercent: 0,
      uploadAttempt: 1,
    });

    const a = attaching();
    expect(a).toEqual({
      phase: "attaching",
      streamVideoId: "sv-1",
      postId: "post-1",
      attachAttempt: 1,
    });

    const p = processing();
    expect(p).toEqual({ phase: "processing", streamVideoId: "sv-1", postId: "post-1" });

    expect(ready()).toEqual({ phase: "ready", streamVideoId: "sv-1", postId: "post-1" });
  });

  it("normalizes the file name when the ticket is requested", () => {
    const name = "  cl" + String.fromCharCode(0, 31, 127) + "ip.mp4  ";
    const t = step(idle, { type: "ticket_requested", fileName: name, totalBytes: TOTAL });
    expect(t).toMatchObject({ fileName: "clip.mp4" });
  });

  it("status_processing is an idempotent no-op while processing", () => {
    const p = processing();
    expect(step(p, { type: "status_processing" })).toEqual(p);
  });
});

describe("upload session — payload validation", () => {
  it.each([0, -5, 2.5, Number.NaN])("rejects ticket_requested with totalBytes %p", (bytes) => {
    expectDenied(
      idle,
      { type: "ticket_requested", fileName: "a.mp4", totalBytes: bytes },
      "invalid_payload",
    );
  });

  it.each(["", "   "])("rejects ticket_received with blank streamVideoId %p", (id) => {
    expectDenied(ticketing(), { type: "ticket_received", streamVideoId: id }, "invalid_payload");
  });

  it("rejects upload_completed with a blank postId", () => {
    expectDenied(midUpload(), { type: "upload_completed", postId: " " }, "invalid_payload");
  });

  it.each([-1, 1.5])("rejects upload_progress with bytesSent %p", (bytes) => {
    expectDenied(midUpload(), { type: "upload_progress", bytesSent: bytes }, "invalid_payload");
  });

  it("rejects unknown error codes on failure events", () => {
    const bogus = "boom" as UploadErrorCode;
    expectDenied(ticketing(), { type: "ticket_failed", code: bogus }, "invalid_payload");
    expectDenied(midUpload(), { type: "upload_failed", code: bogus }, "invalid_payload");
    expectDenied(attaching(), { type: "attachment_failed", code: bogus }, "invalid_payload");
  });

  it("payload denial messages never echo the offending input", () => {
    const result = transitionUploadSession(idle, {
      type: "ticket_requested",
      fileName: "super-secret-name.mp4",
      totalBytes: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("super-secret-name");
  });
});

describe("upload session — progress rules", () => {
  it("applies monotonic progress and derives the percent", () => {
    const u = midUpload();
    expect(u).toMatchObject({ bytesSent: 333, progressPercent: 33 });
    const more = step(u, { type: "upload_progress", bytesSent: 999 });
    expect(more).toMatchObject({ bytesSent: 999, progressPercent: 99 });
    const done = step(more, { type: "upload_progress", bytesSent: TOTAL });
    expect(done).toMatchObject({ bytesSent: TOTAL, progressPercent: 100 });
  });

  it("allows an equal (replayed) progress report", () => {
    const u = midUpload();
    expect(step(u, { type: "upload_progress", bytesSent: 333 })).toEqual(u);
  });

  it("rejects decreasing progress within an attempt", () => {
    expectDenied(midUpload(), { type: "upload_progress", bytesSent: 100 }, "progress_regression");
  });

  it("rejects bytesSent above totalBytes", () => {
    expectDenied(
      midUpload(),
      { type: "upload_progress", bytesSent: TOTAL + 1 },
      "progress_overflow",
    );
  });

  it("computeUploadProgressPercent floors and validates", () => {
    expect(computeUploadProgressPercent(0, TOTAL)).toBe(0);
    expect(computeUploadProgressPercent(999, TOTAL)).toBe(99);
    expect(computeUploadProgressPercent(TOTAL, TOTAL)).toBe(100);
    expect(() => computeUploadProgressPercent(1, 0)).toThrow(/positive integer/);
    expect(() => computeUploadProgressPercent(-1, TOTAL)).toThrow(/within/);
    expect(() => computeUploadProgressPercent(TOTAL + 1, TOTAL)).toThrow(/within/);
    expect(() => computeUploadProgressPercent(0.5, TOTAL)).toThrow(/within/);
  });
});

describe("upload session — pause and resume", () => {
  it("pauses only from uploading and preserves progress", () => {
    const p = paused();
    expect(p).toMatchObject({
      phase: "paused",
      bytesSent: 333,
      progressPercent: 33,
      uploadAttempt: 1,
    });
  });

  it("resumes only from paused, back to uploading unchanged", () => {
    const resumed = step(paused(), { type: "upload_resumed" });
    expect(resumed).toMatchObject({ phase: "uploading", bytesSent: 333, uploadAttempt: 1 });
  });

  it("rejects pause when not uploading and resume when not paused", () => {
    expectDenied(paused(), { type: "upload_paused" }, "invalid_transition");
    expectDenied(midUpload(), { type: "upload_resumed" }, "invalid_transition");
    expectDenied(idle, { type: "upload_paused" }, "invalid_transition");
  });

  it("rejects progress reports while paused", () => {
    expectDenied(paused(), { type: "upload_progress", bytesSent: 400 }, "invalid_transition");
  });
});

describe("upload session — failures and retry", () => {
  it("ticket failure carries category, attempt, recoverability, and resume", () => {
    const e = errorFrom(ticketing(), { type: "ticket_failed", code: "network" });
    expect(e).toEqual({
      phase: "error",
      code: "network",
      category: "ticket",
      recoverable: true,
      attempt: 1,
      resume: { phase: "ticketing", fileName: "clip.mp4", totalBytes: TOTAL },
    });
    expect(canRetryUploadSession(e)).toBe(true);
  });

  it("upload failure snapshots the byte offset for resume", () => {
    const e = errorFrom(midUpload(), { type: "upload_failed", code: "timeout" });
    expect(e.resume).toEqual({
      phase: "uploading",
      streamVideoId: "sv-1",
      fileName: "clip.mp4",
      totalBytes: TOTAL,
      bytesSent: 333,
    });
    const retried = step(e, { type: "retry_requested" });
    expect(retried).toMatchObject({
      phase: "uploading",
      bytesSent: 333,
      progressPercent: 33,
      uploadAttempt: 2,
    });
  });

  it("retry re-enters ticketing and attaching with an incremented attempt", () => {
    const t = errorFrom(ticketing(), { type: "ticket_failed", code: "server_unavailable" });
    expect(step(t, { type: "retry_requested" })).toMatchObject({
      phase: "ticketing",
      ticketAttempt: 2,
    });

    const a = errorFrom(attaching(), { type: "attachment_failed", code: "network" });
    expect(step(a, { type: "retry_requested" })).toMatchObject({
      phase: "attaching",
      attachAttempt: 2,
    });
  });

  it("non-recoverable codes cannot be retried", () => {
    for (const code of [
      "unauthorized",
      "validation_failed",
      "quota_exceeded",
      "unknown",
    ] as const) {
      const e = errorFrom(ticketing(), { type: "ticket_failed", code });
      expect(e.recoverable).toBe(false);
      expect(canRetryUploadSession(e)).toBe(false);
      expectDenied(e, { type: "retry_requested" }, "retry_not_recoverable");
    }
  });

  it("caps retries per category (upload: 5 total attempts)", () => {
    let session: UploadSession = midUpload();
    for (let attempt = 1; attempt < UPLOAD_RETRY_LIMITS.upload; attempt++) {
      const e = errorFrom(session, { type: "upload_failed", code: "network" });
      expect(e.attempt).toBe(attempt);
      session = step(e, { type: "retry_requested" });
      expect(session).toMatchObject({ phase: "uploading", uploadAttempt: attempt + 1 });
    }
    const finalError = errorFrom(session, { type: "upload_failed", code: "network" });
    expect(finalError.attempt).toBe(UPLOAD_RETRY_LIMITS.upload);
    expect(canRetryUploadSession(finalError)).toBe(false);
    expectDenied(finalError, { type: "retry_requested" }, "retry_exhausted");
  });

  it("a Cloudflare terminal processing error is never retryable in-session", () => {
    const e = errorFrom(processing(), { type: "status_error" });
    expect(e).toEqual({
      phase: "error",
      code: "processing_failed",
      category: "processing",
      recoverable: false,
      attempt: 1,
      resume: { phase: "processing", streamVideoId: "sv-1", postId: "post-1" },
    });
    expect(UPLOAD_RETRY_LIMITS.processing).toBe(0);
    expect(canRetryUploadSession(e)).toBe(false);
    expectDenied(e, { type: "retry_requested" }, "retry_not_recoverable");
  });

  it("fails closed on a hand-built recoverable error with a processing resume", () => {
    const impossible: UploadSession = {
      phase: "error",
      code: "network",
      category: "polling",
      recoverable: true,
      attempt: 1,
      resume: { phase: "processing", streamVideoId: "sv-1", postId: "post-1" },
    };
    expectDenied(impossible, { type: "retry_requested" }, "retry_not_recoverable");
  });

  it("retry is invalid outside the error phase; error states carry no free text", () => {
    expectDenied(midUpload(), { type: "retry_requested" }, "invalid_transition");
    const e = errorFrom(ticketing(), { type: "ticket_failed", code: "network" });
    expect("message" in e).toBe(false);
    expect(canRetryUploadSession(midUpload())).toBe(false);
  });
});

describe("upload session — attachment ordering", () => {
  it("attachment cannot begin before upload completion", () => {
    expectDenied(ticketing(), { type: "upload_completed", postId: "post-1" }, "invalid_transition");
    expectDenied(paused(), { type: "upload_completed", postId: "post-1" }, "invalid_transition");
    expectDenied(midUpload(), { type: "attachment_completed" }, "invalid_transition");
    expectDenied(idle, { type: "attachment_failed", code: "network" }, "invalid_transition");
  });

  it("status events are only valid while processing", () => {
    expectDenied(midUpload(), { type: "status_ready" }, "invalid_transition");
    expectDenied(attaching(), { type: "status_processing" }, "invalid_transition");
    expectDenied(idle, { type: "status_error" }, "invalid_transition");
  });
});

describe("upload session — cancellation and cleanup", () => {
  it("cancel before any ticket leaves no cleanup debt", () => {
    expect(step(idle, { type: "cancel_requested" })).toEqual({
      phase: "canceled",
      cleanupRequired: false,
      detachRequired: false,
      streamVideoId: null,
    });
    expect(step(ticketing(), { type: "cancel_requested" })).toMatchObject({
      cleanupRequired: false,
    });
  });

  it("a ticket landing after cancellation flips the cleanup debt on", () => {
    const c = step(ticketing(), { type: "cancel_requested" });
    const late = step(c, { type: "ticket_received", streamVideoId: "sv-late" });
    expect(late).toEqual({
      phase: "canceled",
      cleanupRequired: true,
      detachRequired: false,
      streamVideoId: "sv-late",
    });
    expect(requiredCleanupSteps(late)).toEqual(["delete_remote_video"]);
  });

  it("cancel during upload (or pause) requires remote deletion only", () => {
    for (const base of [midUpload(), paused()]) {
      const c = step(base, { type: "cancel_requested" });
      expect(c).toEqual({
        phase: "canceled",
        cleanupRequired: true,
        detachRequired: false,
        streamVideoId: "sv-1",
      });
      expect(requiredCleanupSteps(c)).toEqual(["delete_remote_video"]);
    }
  });

  it("cancel after attachment demands detach BEFORE remote deletion", () => {
    for (const base of [attaching(), processing()]) {
      const c = step(base, { type: "cancel_requested" });
      expect(c).toMatchObject({
        cleanupRequired: true,
        detachRequired: true,
        streamVideoId: "sv-1",
      });
      expect(requiredCleanupSteps(c)).toEqual(["detach_post_media", "delete_remote_video"]);
    }
  });

  it("cancel from error scales cleanup to what the failure left behind", () => {
    const ticketError = errorFrom(ticketing(), { type: "ticket_failed", code: "network" });
    expect(step(ticketError, { type: "cancel_requested" })).toMatchObject({
      cleanupRequired: false,
      streamVideoId: null,
    });

    const uploadError = errorFrom(midUpload(), { type: "upload_failed", code: "network" });
    expect(step(uploadError, { type: "cancel_requested" })).toMatchObject({
      cleanupRequired: true,
      detachRequired: false,
      streamVideoId: "sv-1",
    });

    const attachError = errorFrom(attaching(), { type: "attachment_failed", code: "network" });
    expect(step(attachError, { type: "cancel_requested" })).toMatchObject({
      cleanupRequired: true,
      detachRequired: true,
    });

    const cfError = errorFrom(processing(), { type: "status_error" });
    expect(step(cfError, { type: "cancel_requested" })).toMatchObject({
      cleanupRequired: true,
      detachRequired: true,
    });
  });

  it("cleanup_completed clears the debt and keeps the id for the record", () => {
    const c = step(midUpload(), { type: "cancel_requested" });
    const cleaned = step(c, { type: "cleanup_completed" });
    expect(cleaned).toEqual({
      phase: "canceled",
      cleanupRequired: false,
      detachRequired: false,
      streamVideoId: "sv-1",
    });
    expect(requiredCleanupSteps(cleaned)).toEqual([]);
  });

  it("cleanup_completed is invalid without pending cleanup", () => {
    const clean = step(idle, { type: "cancel_requested" });
    expectDenied(clean, { type: "cleanup_completed" }, "invalid_transition");
    expectDenied(midUpload(), { type: "cleanup_completed" }, "invalid_transition");
  });

  it("cancel is invalid from ready and from canceled", () => {
    expectDenied(ready(), { type: "cancel_requested" }, "invalid_transition");
    const c = step(idle, { type: "cancel_requested" });
    expectDenied(c, { type: "cancel_requested" }, "invalid_transition");
  });

  it("requiredCleanupSteps is empty for non-canceled sessions", () => {
    expect(requiredCleanupSteps(idle)).toEqual([]);
    expect(requiredCleanupSteps(midUpload())).toEqual([]);
    expect(requiredCleanupSteps(ready())).toEqual([]);
  });
});

describe("upload session — terminal states and reset", () => {
  it("ready is inert except for reset", () => {
    const r = ready();
    expectDenied(r, { type: "upload_progress", bytesSent: 1 }, "invalid_transition");
    expectDenied(r, { type: "status_ready" }, "invalid_transition");
    expectDenied(r, { type: "retry_requested" }, "invalid_transition");
    expect(step(r, { type: "reset" })).toEqual({ phase: "idle" });
  });

  it("canceled is inert except for cleanup, late ticket, and reset", () => {
    const c = step(midUpload(), { type: "cancel_requested" });
    expectDenied(c, { type: "upload_paused" }, "invalid_transition");
    expectDenied(c, { type: "upload_progress", bytesSent: 400 }, "invalid_transition");
  });

  it("reset is blocked while cleanup is pending — the debt is never forgotten", () => {
    const c = step(midUpload(), { type: "cancel_requested" });
    expectDenied(c, { type: "reset" }, "cleanup_pending");
    const cleaned = step(c, { type: "cleanup_completed" });
    expect(step(cleaned, { type: "reset" })).toEqual({ phase: "idle" });
  });

  it("reset is invalid from non-terminal phases and from error", () => {
    expectDenied(midUpload(), { type: "reset" }, "invalid_transition");
    expectDenied(ticketing(), { type: "reset" }, "invalid_transition");
    const e = errorFrom(ticketing(), { type: "ticket_failed", code: "network" });
    expectDenied(e, { type: "reset" }, "invalid_transition");
  });

  it("rejects restarting a session that is already past idle", () => {
    expectDenied(
      midUpload(),
      { type: "ticket_requested", fileName: "b.mp4", totalBytes: 5 },
      "invalid_transition",
    );
    expectDenied(idle, { type: "ticket_received", streamVideoId: "sv-1" }, "invalid_transition");
    expectDenied(idle, { type: "upload_failed", code: "network" }, "invalid_transition");
    expectDenied(uploading(), { type: "ticket_failed", code: "network" }, "invalid_transition");
  });
});

describe("file preflight", () => {
  const valid = { fileName: "clip.mp4", mimeType: "video/mp4", sizeBytes: 1_024 };

  it("accepts a valid file and normalizes the metadata", () => {
    const result = preflightUploadFile({ ...valid, mimeType: "  VIDEO/MP4 " });
    expect(result).toEqual({
      ok: true,
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1_024,
      durationHintSeconds: null,
    });
  });

  it("passes through an explicit duration hint and treats null as absent", () => {
    const withHint = preflightUploadFile({ ...valid, durationHintSeconds: 42 });
    expect(withHint).toMatchObject({ ok: true, durationHintSeconds: 42 });
    const withNull = preflightUploadFile({ ...valid, durationHintSeconds: null });
    expect(withNull).toMatchObject({ ok: true, durationHintSeconds: null });
  });

  it("rejects unsupported and missing MIME types with stable codes", () => {
    expect(preflightUploadFile({ ...valid, mimeType: "video/x-msvideo" })).toMatchObject({
      ok: false,
      reason: "unsupported_mime_type",
    });
    expect(preflightUploadFile({ ...valid, mimeType: 42 })).toMatchObject({
      ok: false,
      reason: "unsupported_mime_type",
    });
  });

  it("rejects zero-byte and non-integer sizes", () => {
    expect(preflightUploadFile({ ...valid, sizeBytes: 0 })).toMatchObject({
      ok: false,
      reason: "invalid_size",
    });
    expect(preflightUploadFile({ ...valid, sizeBytes: 10.5 })).toMatchObject({
      ok: false,
      reason: "invalid_size",
    });
  });

  it("applies the inclusive size boundary", () => {
    expect(preflightUploadFile({ ...valid, sizeBytes: STREAM_MAX_SIZE_BYTES })).toMatchObject({
      ok: true,
    });
    expect(preflightUploadFile({ ...valid, sizeBytes: STREAM_MAX_SIZE_BYTES + 1 })).toMatchObject({
      ok: false,
      reason: "too_large",
    });
  });

  it("applies the inclusive duration boundary and rejects invalid hints", () => {
    expect(
      preflightUploadFile({ ...valid, durationHintSeconds: STREAM_MAX_DURATION_SECONDS }),
    ).toMatchObject({ ok: true });
    expect(
      preflightUploadFile({ ...valid, durationHintSeconds: STREAM_MAX_DURATION_SECONDS + 1 }),
    ).toMatchObject({ ok: false, reason: "too_long" });
    expect(preflightUploadFile({ ...valid, durationHintSeconds: -3 })).toMatchObject({
      ok: false,
      reason: "too_long",
    });
  });

  it("respects an injected policy override", () => {
    const tiny = {
      allowedMimeTypes: ["video/webm"],
      maxSizeBytes: 100,
      maxDurationSeconds: 5,
      maxActiveUploads: 1,
      maxUploadsPerDay: 1,
    };
    expect(preflightUploadFile({ ...valid, sizeBytes: 101 }, tiny)).toMatchObject({
      ok: false,
      reason: "unsupported_mime_type",
    });
    expect(
      preflightUploadFile({ fileName: "a.webm", mimeType: "video/webm", sizeBytes: 101 }, tiny),
    ).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("normalizes file names: control chars, length, and fallbacks", () => {
    expect(normalizeUploadFileName("  a" + String.fromCharCode(7) + "b.mp4 ")).toBe("ab.mp4");
    expect(normalizeUploadFileName("x".repeat(300))).toHaveLength(200);
    expect(normalizeUploadFileName("")).toBe("video");
    expect(normalizeUploadFileName(String.fromCharCode(0, 1, 2))).toBe("video");
    expect(normalizeUploadFileName(12345)).toBe("video");
    expect(preflightUploadFile({ ...valid, fileName: undefined })).toMatchObject({
      ok: true,
      fileName: "video",
    });
  });
});

describe("chunk selection", () => {
  it("defaults to the server-recommended chunk with no hints", () => {
    expect(selectTusChunkSize()).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
    expect(selectTusChunkSize({})).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
    expect(selectTusChunkSize({ effectiveConnectionType: null, saveData: null })).toBe(
      TUS_RECOMMENDED_CHUNK_BYTES,
    );
  });

  it("uses the minimum chunk for saveData and 2g-class connections", () => {
    expect(selectTusChunkSize({ saveData: true })).toBe(TUS_MIN_CHUNK_BYTES);
    expect(selectTusChunkSize({ effectiveConnectionType: "2g" })).toBe(TUS_MIN_CHUNK_BYTES);
    expect(selectTusChunkSize({ effectiveConnectionType: "slow-2g" })).toBe(TUS_MIN_CHUNK_BYTES);
    expect(selectTusChunkSize({ effectiveConnectionType: " 2G " })).toBe(TUS_MIN_CHUNK_BYTES);
  });

  it("uses the constrained chunk for 3g and low-memory devices", () => {
    expect(selectTusChunkSize({ effectiveConnectionType: "3g" })).toBe(
      STREAM_CONSTRAINED_CHUNK_BYTES,
    );
    expect(selectTusChunkSize({ deviceMemoryGb: 2 })).toBe(STREAM_CONSTRAINED_CHUNK_BYTES);
    expect(selectTusChunkSize({ deviceMemoryGb: 1 })).toBe(STREAM_CONSTRAINED_CHUNK_BYTES);
  });

  it("ignores unknown or invalid hints", () => {
    expect(selectTusChunkSize({ effectiveConnectionType: "4g" })).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
    expect(selectTusChunkSize({ effectiveConnectionType: "warp" })).toBe(
      TUS_RECOMMENDED_CHUNK_BYTES,
    );
    expect(selectTusChunkSize({ deviceMemoryGb: 8 })).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
    expect(selectTusChunkSize({ deviceMemoryGb: 0 })).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
    expect(selectTusChunkSize({ deviceMemoryGb: Number.NaN })).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
    expect(selectTusChunkSize({ totalBytes: -1 })).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
    expect(selectTusChunkSize({ totalBytes: 10.5 })).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
  });

  it("drops to the minimum chunk when the whole file fits in one", () => {
    expect(selectTusChunkSize({ totalBytes: TUS_MIN_CHUNK_BYTES })).toBe(TUS_MIN_CHUNK_BYTES);
    expect(selectTusChunkSize({ totalBytes: TUS_MIN_CHUNK_BYTES + 1 })).toBe(
      TUS_RECOMMENDED_CHUNK_BYTES,
    );
    // Tiny-file rule wins even on a fast connection hint.
    expect(
      selectTusChunkSize({ totalBytes: 1_024, effectiveConnectionType: "4g", deviceMemoryGb: 16 }),
    ).toBe(TUS_MIN_CHUNK_BYTES);
  });

  it("saveData outranks a fast effective connection", () => {
    expect(selectTusChunkSize({ saveData: true, effectiveConnectionType: "4g" })).toBe(
      TUS_MIN_CHUNK_BYTES,
    );
  });

  it("every selectable size is a valid tus chunk within [min, recommended]", () => {
    for (const size of [
      TUS_MIN_CHUNK_BYTES,
      STREAM_CONSTRAINED_CHUNK_BYTES,
      TUS_RECOMMENDED_CHUNK_BYTES,
    ]) {
      expect(isValidTusChunkSize(size)).toBe(true);
      expect(size).toBeGreaterThanOrEqual(TUS_MIN_CHUNK_BYTES);
      expect(size).toBeLessThanOrEqual(TUS_RECOMMENDED_CHUNK_BYTES);
    }
  });
});

describe("retry policy", () => {
  it("grows exponentially per category from its base", () => {
    expect(computeUploadRetryDelayMs("upload", 1)).toBe(2_000);
    expect(computeUploadRetryDelayMs("upload", 2)).toBe(4_000);
    expect(computeUploadRetryDelayMs("upload", 3)).toBe(8_000);
    expect(computeUploadRetryDelayMs("ticket", 1)).toBe(1_000);
    expect(computeUploadRetryDelayMs("attach", 2)).toBe(2_000);
    expect(computeUploadRetryDelayMs("polling", 1)).toBe(4_000);
    expect(computeUploadRetryDelayMs("cleanup", 1)).toBe(2_000);
  });

  it("caps the delay", () => {
    expect(computeUploadRetryDelayMs("upload", 10)).toBe(UPLOAD_RETRY_MAX_DELAY_MS);
    expect(computeUploadRetryDelayMs("polling", 30)).toBe(UPLOAD_RETRY_MAX_DELAY_MS);
  });

  it("treats sub-1 or fractional attempts as the first attempt", () => {
    expect(computeUploadRetryDelayMs("upload", 0)).toBe(2_000);
    expect(computeUploadRetryDelayMs("upload", -4)).toBe(2_000);
    expect(computeUploadRetryDelayMs("upload", 1.9)).toBe(2_000);
  });

  it("applies only injected, deterministic jitter", () => {
    expect(computeUploadRetryDelayMs("upload", 1, 0)).toBe(2_000);
    expect(computeUploadRetryDelayMs("upload", 1, 0.5)).toBe(2_250);
    expect(computeUploadRetryDelayMs("upload", 1, 0.5)).toBe(
      computeUploadRetryDelayMs("upload", 1, 0.5),
    );
    expect(() => computeUploadRetryDelayMs("upload", 1, 1)).toThrow(/jitter01/);
    expect(() => computeUploadRetryDelayMs("upload", 1, -0.1)).toThrow(/jitter01/);
    expect(() => computeUploadRetryDelayMs("upload", 1, Number.NaN)).toThrow(/jitter01/);
  });

  it("classifies every error code's retryability", () => {
    const expected: Record<UploadErrorCode, boolean> = {
      network: true,
      timeout: true,
      server_unavailable: true,
      unauthorized: false,
      validation_failed: false,
      quota_exceeded: false,
      processing_failed: false,
      unknown: false,
    };
    for (const code of UPLOAD_ERROR_CODES) {
      expect(isRetryableUploadErrorCode(code)).toBe(expected[code]);
    }
  });
});
