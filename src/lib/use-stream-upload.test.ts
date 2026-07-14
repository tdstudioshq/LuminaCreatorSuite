// ============================================================================
// CABANA — upload-controller orchestration tests (Checkpoint 5A.2)
// ----------------------------------------------------------------------------
// Exercises `createStreamUploadController` (the framework-free core of
// useStreamUpload) with FAKE server actions, a FAKE transport factory, and
// fake timers — no React render, no network, no Cloudflare, no real upload.
// The 5A.1 state machine itself is covered by cabana-stream-upload.test.ts;
// these tests pin the WIRING: ticket races, transport lifecycles, retry
// consumption, the polling fallback budget, and cleanup-debt honesty.
// ============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TUS_MIN_CHUNK_BYTES,
  TUS_RECOMMENDED_CHUNK_BYTES,
  type StreamVideoStatus,
} from "@/lib/cabana-stream";
import {
  UPLOAD_RETRY_LIMITS,
  type ChunkSelectionHints,
  type UploadErrorCode,
  type UploadSession,
} from "@/lib/cabana-stream-upload";
import type { CreateTransportInput } from "@/lib/stream-tus-client";
import {
  type StreamUploadFile,
  type StreamUploadServerActions,
  createStreamUploadController,
  defaultClassifyActionError,
  deriveUploadFlags,
} from "@/lib/use-stream-upload";

// ─────────────────────────────── Harness ────────────────────────────────────

const FILE_SIZE = 104_857_600; // 100 MiB
const POLL_MS = 1_000;
const TICKET = {
  streamVideoId: "sv-1",
  uploadUrl: "https://upload.cloudflarestream.com/tus/abc",
  recommendedChunkSizeBytes: TUS_RECOMMENDED_CHUNK_BYTES,
};

function fakeFile(
  overrides: Partial<{ name: string; type: string; size: number }> = {},
): StreamUploadFile {
  return {
    name: "clip.mp4",
    type: "video/mp4",
    size: FILE_SIZE,
    ...overrides,
  } as unknown as StreamUploadFile;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

class FakeTransport {
  startCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;
  abortCalls = 0;
  constructor(public input: CreateTransportInput) {}
  start(): void {
    this.startCalls += 1;
  }
  pause(): void {
    this.pauseCalls += 1;
  }
  resume(): void {
    this.resumeCalls += 1;
  }
  abort(): void {
    this.abortCalls += 1;
  }
}

function makeHarness(
  overrides: {
    actions?: Partial<StreamUploadServerActions>;
    classifyActionError?: (error: unknown) => UploadErrorCode;
    chunkHints?: () => ChunkSelectionHints;
    pollIntervalMs?: number;
  } = {},
) {
  const actions: StreamUploadServerActions = {
    createTicket: vi.fn(async () => ({ ...TICKET })),
    attachVideo: vi.fn(async () => ({})),
    getVideoStatus: vi.fn(async () => ({ status: "processing" as const })),
    deleteVideo: vi.fn(async () => ({})),
    ...overrides.actions,
  };
  const transports: FakeTransport[] = [];
  const controller = createStreamUploadController({
    actions,
    createTransport: (input) => {
      const transport = new FakeTransport(input);
      transports.push(transport);
      return transport;
    },
    classifyActionError: overrides.classifyActionError,
    chunkHints: overrides.chunkHints ?? (() => ({})),
    pollIntervalMs: overrides.pollIntervalMs ?? POLL_MS,
  });
  const session = () => controller.getSnapshot().session;
  return { controller, actions, transports, session };
}

type Harness = ReturnType<typeof makeHarness>;

async function startUploading(h: Harness): Promise<FakeTransport> {
  expect(h.controller.beginUpload(fakeFile(), "post-1").ok).toBe(true);
  await flushMicrotasks();
  expect(h.session().phase).toBe("uploading");
  return h.transports[0];
}

async function startProcessing(h: Harness): Promise<FakeTransport> {
  const transport = await startUploading(h);
  transport.input.callbacks.onSuccess();
  await flushMicrotasks();
  expect(h.session().phase).toBe("processing");
  return transport;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────── Begin & preflight ──────────────────────────

describe("beginUpload preflight", () => {
  it("rejects an unsupported file locally — no server call, session stays idle", () => {
    const h = makeHarness();
    const result = h.controller.beginUpload(fakeFile({ type: "video/x-msvideo" }), "post-1");
    expect(result).toMatchObject({ ok: false, reason: "unsupported_mime_type" });
    expect(h.actions.createTicket).not.toHaveBeenCalled();
    expect(h.session().phase).toBe("idle");
    expect(h.controller.getSnapshot().preflightRejection?.reason).toBe("unsupported_mime_type");
  });

  it("rejects an oversized file locally", () => {
    const h = makeHarness();
    const result = h.controller.beginUpload(fakeFile({ size: 1_073_741_825 }), "post-1");
    expect(result).toMatchObject({ ok: false, reason: "too_large" });
    expect(h.actions.createTicket).not.toHaveBeenCalled();
  });

  it("rejects a second beginUpload while a session is active", async () => {
    const h = makeHarness();
    expect(h.controller.beginUpload(fakeFile(), "post-1").ok).toBe(true);
    const second = h.controller.beginUpload(fakeFile(), "post-2");
    expect(second).toMatchObject({ ok: false, reason: "not_idle" });
    await flushMicrotasks();
    expect(h.actions.createTicket).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────── Ticket lifecycle ───────────────────────────

describe("ticket lifecycle", () => {
  it("ticket success starts one transport on the ticket URL with the selected chunk size", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    expect(h.actions.createTicket).toHaveBeenCalledWith({
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      sizeBytes: FILE_SIZE,
      durationHintSeconds: null,
      postId: "post-1",
    });
    expect(h.transports).toHaveLength(1);
    expect(transport.startCalls).toBe(1);
    expect(transport.input.uploadUrl).toBe(TICKET.uploadUrl);
    expect(transport.input.chunkSizeBytes).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
  });

  it("consumes chunk hints (saveData → minimum chunk)", async () => {
    const h = makeHarness({ chunkHints: () => ({ saveData: true }) });
    const transport = await startUploading(h);
    expect(transport.input.chunkSizeBytes).toBe(TUS_MIN_CHUNK_BYTES);
  });

  it("ticket failure becomes a classified error state", async () => {
    const h = makeHarness({
      actions: { createTicket: vi.fn(async () => Promise.reject(new Error("boom"))) },
      classifyActionError: () => "server_unavailable",
    });
    h.controller.beginUpload(fakeFile(), "post-1");
    await flushMicrotasks();
    expect(h.session()).toMatchObject({
      phase: "error",
      code: "server_unavailable",
      category: "ticket",
      recoverable: true,
      attempt: 1,
    });
  });

  it("the default classifier fails closed (unknown, non-retryable)", async () => {
    const h = makeHarness({
      actions: { createTicket: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    h.controller.beginUpload(fakeFile(), "post-1");
    await flushMicrotasks();
    expect(h.session()).toMatchObject({ phase: "error", code: "unknown", recoverable: false });
    expect(h.controller.retry()).toBe(false);
    expect(defaultClassifyActionError(new TypeError("failed to fetch"))).toBe("network");
    expect(defaultClassifyActionError(new Error("anything"))).toBe("unknown");
  });

  it("retry re-requests a ticket up to the category cap", async () => {
    const createTicket = vi.fn(async () => Promise.reject<never>(new Error("down")));
    const h = makeHarness({
      actions: { createTicket },
      classifyActionError: () => "network",
    });
    h.controller.beginUpload(fakeFile(), "post-1");
    await flushMicrotasks();
    for (let attempt = 1; attempt < UPLOAD_RETRY_LIMITS.ticket; attempt += 1) {
      expect(h.controller.retry()).toBe(true);
      await flushMicrotasks();
    }
    expect(createTicket).toHaveBeenCalledTimes(UPLOAD_RETRY_LIMITS.ticket);
    expect(h.session()).toMatchObject({ phase: "error", attempt: UPLOAD_RETRY_LIMITS.ticket });
    expect(h.controller.retry()).toBe(false);
    expect(createTicket).toHaveBeenCalledTimes(UPLOAD_RETRY_LIMITS.ticket);
  });
});

// ─────────────────────────────── Cancel racing the ticket ───────────────────

describe("cancel racing the ticket", () => {
  it("cancel before the ticket resolves cancels locally with no debt", async () => {
    const gate = deferred<typeof TICKET>();
    const h = makeHarness({ actions: { createTicket: vi.fn(() => gate.promise) } });
    h.controller.beginUpload(fakeFile(), "post-1");
    expect(h.controller.cancel()).toBe(true);
    expect(h.session()).toMatchObject({
      phase: "canceled",
      cleanupRequired: false,
      detachRequired: false,
    });
    expect(h.transports).toHaveLength(0);
  });

  it("a late ticket after cancel records the debt and pays it with a remote delete", async () => {
    const gate = deferred<typeof TICKET>();
    const h = makeHarness({ actions: { createTicket: vi.fn(() => gate.promise) } });
    h.controller.beginUpload(fakeFile(), "post-1");
    h.controller.cancel();
    expect(h.controller.reset()).toBe(true); // no debt yet — but see next test for the reset race
    expect(h.controller.getSnapshot().session.phase).toBe("idle");

    // Re-run WITHOUT the reset to observe the canceled-session debt path.
    const gate2 = deferred<typeof TICKET>();
    vi.mocked(h.actions.createTicket).mockImplementation(() => gate2.promise);
    h.controller.beginUpload(fakeFile(), "post-1");
    h.controller.cancel();
    gate2.resolve({ ...TICKET });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.actions.deleteVideo).toHaveBeenCalledWith({ streamVideoId: "sv-1" });
    expect(h.session()).toMatchObject({
      phase: "canceled",
      cleanupRequired: false,
      streamVideoId: "sv-1",
    });
    expect(h.transports).toHaveLength(0); // the upload never started
    expect(h.controller.reset()).toBe(true);
  });

  it("a ticket rejecting after cancel leaves no debt and triggers no delete", async () => {
    const gate = deferred<typeof TICKET>();
    const h = makeHarness({ actions: { createTicket: vi.fn(() => gate.promise) } });
    h.controller.beginUpload(fakeFile(), "post-1");
    h.controller.cancel();
    gate.reject(new Error("too late"));
    await flushMicrotasks();
    expect(h.session()).toMatchObject({ phase: "canceled", cleanupRequired: false });
    expect(h.actions.deleteVideo).not.toHaveBeenCalled();
  });

  it("a ticket resolving after a debt-free cancel + reset is best-effort deleted without touching the new session", async () => {
    const gate = deferred<typeof TICKET>();
    const h = makeHarness({ actions: { createTicket: vi.fn(() => gate.promise) } });
    h.controller.beginUpload(fakeFile(), "post-1");
    h.controller.cancel();
    expect(h.controller.reset()).toBe(true);
    gate.resolve({ ...TICKET });
    await flushMicrotasks();
    expect(h.actions.deleteVideo).toHaveBeenCalledWith({ streamVideoId: "sv-1" });
    expect(h.session().phase).toBe("idle");
  });

  it("a failing late-ticket delete keeps the debt visible and blocks reset", async () => {
    const gate = deferred<typeof TICKET>();
    const h = makeHarness({
      actions: {
        createTicket: vi.fn(() => gate.promise),
        deleteVideo: vi.fn(async () => Promise.reject(new Error("cf down"))),
      },
    });
    h.controller.beginUpload(fakeFile(), "post-1");
    h.controller.cancel();
    gate.resolve({ ...TICKET });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(120_000); // exhaust the cleanup budget
    expect(h.actions.deleteVideo).toHaveBeenCalledTimes(UPLOAD_RETRY_LIMITS.cleanup);
    expect(h.session()).toMatchObject({ phase: "canceled", cleanupRequired: true });
    expect(h.controller.reset()).toBe(false); // debt is never silently forgotten
  });
});

// ─────────────────────────────── Progress ───────────────────────────────────

describe("upload progress", () => {
  it("updates bytes and derived percent monotonically", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    transport.input.callbacks.onProgress(1_048_576);
    expect(h.session()).toMatchObject({ bytesSent: 1_048_576, progressPercent: 1 });
    transport.input.callbacks.onProgress(52_428_800);
    expect(h.session()).toMatchObject({ bytesSent: 52_428_800, progressPercent: 50 });
  });

  it("drops regressive and overflowing ticks", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    transport.input.callbacks.onProgress(52_428_800);
    transport.input.callbacks.onProgress(41_943_040); // regression → dropped
    expect(h.session()).toMatchObject({ bytesSent: 52_428_800, progressPercent: 50 });
    transport.input.callbacks.onProgress(FILE_SIZE + 1); // overflow → dropped
    expect(h.session()).toMatchObject({ bytesSent: 52_428_800 });
  });

  it("ignores stale progress after pause", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    transport.input.callbacks.onProgress(10_485_760);
    h.controller.pause();
    transport.input.callbacks.onProgress(62_914_560); // in-flight PATCH landing late
    expect(h.session()).toMatchObject({ phase: "paused", bytesSent: 10_485_760 });
  });
});

// ─────────────────────────────── Pause / resume ─────────────────────────────

describe("pause and resume", () => {
  it("pause aborts the transport (offset kept); resume re-starts the SAME transport", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    transport.input.callbacks.onProgress(10_485_760);
    expect(h.controller.pause()).toBe(true);
    expect(transport.pauseCalls).toBe(1);
    expect(h.session().phase).toBe("paused");
    expect(h.controller.resume()).toBe(true);
    expect(transport.resumeCalls).toBe(1);
    expect(h.transports).toHaveLength(1); // never rebuilt — offset preserved
    expect(h.session()).toMatchObject({ phase: "uploading", bytesSent: 10_485_760 });
    transport.input.callbacks.onProgress(20_971_520); // continues past the offset
    expect(h.session()).toMatchObject({ bytesSent: 20_971_520 });
  });

  it("pause/resume are rejected outside their phases", async () => {
    const h = makeHarness();
    expect(h.controller.pause()).toBe(false);
    expect(h.controller.resume()).toBe(false);
    await startUploading(h);
    expect(h.controller.resume()).toBe(false);
  });

  it("an upload error racing a pause is dropped — the pause wins", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    h.controller.pause();
    transport.input.callbacks.onError({ code: "network" });
    expect(h.session().phase).toBe("paused");
    expect(h.controller.resume()).toBe(true);
    expect(h.session().phase).toBe("uploading");
  });
});

// ─────────────────────────────── Upload retry ───────────────────────────────

describe("upload errors and retry", () => {
  it("a retryable error resumes the same transport from the recorded offset", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    transport.input.callbacks.onProgress(52_428_800);
    transport.input.callbacks.onError({ code: "network" });
    expect(h.session()).toMatchObject({
      phase: "error",
      category: "upload",
      recoverable: true,
      attempt: 1,
    });
    expect(h.controller.retry()).toBe(true);
    expect(h.session()).toMatchObject({
      phase: "uploading",
      bytesSent: 52_428_800,
      progressPercent: 50,
      uploadAttempt: 2,
    });
    expect(transport.resumeCalls).toBe(1);
    expect(h.transports).toHaveLength(1);
  });

  it("never retries a non-retryable category (authorization)", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    transport.input.callbacks.onError({ code: "unauthorized" });
    expect(h.session()).toMatchObject({ phase: "error", recoverable: false });
    expect(h.controller.retry()).toBe(false);
    expect(h.session().phase).toBe("error");
  });

  it("enforces the upload attempt cap", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    transport.input.callbacks.onError({ code: "network" });
    for (let attempt = 1; attempt < UPLOAD_RETRY_LIMITS.upload; attempt += 1) {
      expect(h.controller.retry()).toBe(true);
      transport.input.callbacks.onError({ code: "network" });
    }
    expect(h.session()).toMatchObject({ phase: "error", attempt: UPLOAD_RETRY_LIMITS.upload });
    expect(h.controller.retry()).toBe(false);
  });
});

// ─────────────────────────────── Attach ─────────────────────────────────────

describe("attach", () => {
  it("upload completion attaches to the post and begins polling", async () => {
    const h = makeHarness();
    await startProcessing(h);
    expect(h.actions.attachVideo).toHaveBeenCalledWith({
      postId: "post-1",
      streamVideoId: "sv-1",
    });
    expect(h.actions.getVideoStatus).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(h.actions.getVideoStatus).toHaveBeenCalledWith({ streamVideoId: "sv-1" });
  });

  it("attach failure is a classified error and retry re-attaches", async () => {
    const attachVideo = vi.fn(async () => ({})).mockRejectedValueOnce(new Error("supabase hiccup"));
    const h = makeHarness({
      actions: { attachVideo },
      classifyActionError: () => "server_unavailable",
    });
    const transport = await startUploading(h);
    transport.input.callbacks.onSuccess();
    await flushMicrotasks();
    expect(h.session()).toMatchObject({ phase: "error", category: "attach", recoverable: true });
    expect(h.controller.retry()).toBe(true);
    await flushMicrotasks();
    expect(attachVideo).toHaveBeenCalledTimes(2);
    expect(h.session().phase).toBe("processing");
  });
});

// ─────────────────────────────── Polling fallback ───────────────────────────

describe("status polling", () => {
  it("keeps polling while processing and stops the moment the video is ready", async () => {
    const getVideoStatus = vi
      .fn(async (): Promise<{ status: StreamVideoStatus }> => ({ status: "ready" }))
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "processing" });
    const h = makeHarness({ actions: { getVideoStatus } });
    await startProcessing(h);
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(getVideoStatus).toHaveBeenCalledTimes(3);
    expect(h.session()).toMatchObject({ phase: "ready", streamVideoId: "sv-1", postId: "post-1" });
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(getVideoStatus).toHaveBeenCalledTimes(3); // terminal → polling stopped
  });

  it("a terminal processing error stops polling and is not retryable", async () => {
    const h = makeHarness({
      actions: { getVideoStatus: vi.fn(async () => ({ status: "error" as const })) },
    });
    await startProcessing(h);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(h.session()).toMatchObject({
      phase: "error",
      code: "processing_failed",
      recoverable: false,
    });
    expect(h.controller.retry()).toBe(false);
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(h.actions.getVideoStatus).toHaveBeenCalledTimes(1);
  });

  it("tolerates a stale compare-and-set result (pending_upload) and keeps waiting", async () => {
    const getVideoStatus = vi
      .fn(async (): Promise<{ status: StreamVideoStatus }> => ({ status: "ready" }))
      .mockResolvedValueOnce({ status: "pending_upload" });
    const h = makeHarness({ actions: { getVideoStatus } });
    await startProcessing(h);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(getVideoStatus).toHaveBeenCalledTimes(2);
    expect(h.session().phase).toBe("ready");
  });

  it("never overlaps polls — a hung request blocks the next tick", async () => {
    const h = makeHarness({
      actions: { getVideoStatus: vi.fn(() => new Promise<never>(() => {})) },
    });
    await startProcessing(h);
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(h.actions.getVideoStatus).toHaveBeenCalledTimes(1);
  });

  it("applies the polling retry budget with backoff, then stops honestly", async () => {
    const h = makeHarness({
      actions: { getVideoStatus: vi.fn(async () => Promise.reject(new Error("flaky"))) },
    });
    await startProcessing(h);
    await vi.advanceTimersByTimeAsync(500_000);
    expect(h.actions.getVideoStatus).toHaveBeenCalledTimes(UPLOAD_RETRY_LIMITS.polling);
    // The session stays `processing` — the webhook remains the primary driver.
    expect(h.session().phase).toBe("processing");
    await vi.advanceTimersByTimeAsync(500_000);
    expect(h.actions.getVideoStatus).toHaveBeenCalledTimes(UPLOAD_RETRY_LIMITS.polling);
  });

  it("a successful poll resets the failure budget", async () => {
    const getVideoStatus = vi
      .fn(async () => Promise.reject<{ status: "processing" }>(new Error("flaky")))
      .mockRejectedValueOnce(new Error("flaky"))
      .mockRejectedValueOnce(new Error("flaky"))
      .mockResolvedValueOnce({ status: "processing" as const });
    const h = makeHarness({ actions: { getVideoStatus } });
    await startProcessing(h);
    await vi.advanceTimersByTimeAsync(1_000_000);
    // 2 failures + 1 success (budget reset) + a fresh budget of 5 failures.
    expect(getVideoStatus).toHaveBeenCalledTimes(2 + 1 + UPLOAD_RETRY_LIMITS.polling);
    expect(h.session().phase).toBe("processing");
  });

  it("cancel during processing stops polling immediately", async () => {
    const h = makeHarness();
    await startProcessing(h);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(h.actions.getVideoStatus).toHaveBeenCalledTimes(1);
    expect(h.controller.cancel()).toBe(true);
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(h.actions.getVideoStatus).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────── Cancellation & cleanup debt ────────────────

describe("cancellation and cleanup debt", () => {
  it("cancel during upload aborts the transport and deletes the remote asset", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    expect(h.controller.cancel()).toBe(true);
    expect(transport.abortCalls).toBe(1);
    expect(h.session()).toMatchObject({
      phase: "canceled",
      cleanupRequired: true,
      detachRequired: false,
      streamVideoId: "sv-1",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.actions.deleteVideo).toHaveBeenCalledWith({ streamVideoId: "sv-1" });
    expect(h.session()).toMatchObject({ phase: "canceled", cleanupRequired: false });
    expect(h.controller.reset()).toBe(true);
    expect(h.session().phase).toBe("idle");
  });

  it("cancel after attach reports detach-required and NEVER deletes the remote asset", async () => {
    const h = makeHarness();
    await startProcessing(h);
    expect(h.controller.cancel()).toBe(true);
    expect(h.session()).toMatchObject({
      phase: "canceled",
      cleanupRequired: true,
      detachRequired: true,
      streamVideoId: "sv-1",
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.actions.deleteVideo).not.toHaveBeenCalled();
    expect(h.controller.reset()).toBe(false); // debt stays until detach + delete
  });

  it("cancel racing an in-flight attach records detach debt conservatively", async () => {
    const gate = deferred<object>();
    const h = makeHarness({ actions: { attachVideo: vi.fn(() => gate.promise) } });
    const transport = await startUploading(h);
    transport.input.callbacks.onSuccess();
    expect(h.session().phase).toBe("attaching");
    expect(h.controller.cancel()).toBe(true);
    gate.resolve({}); // the attach actually landed — too late
    await flushMicrotasks();
    expect(h.session()).toMatchObject({
      phase: "canceled",
      cleanupRequired: true,
      detachRequired: true,
    });
    expect(h.actions.deleteVideo).not.toHaveBeenCalled();
  });

  it("a failed delete keeps cleanupRequired true and retries within the budget", async () => {
    const deleteVideo = vi.fn(async () => ({})).mockRejectedValueOnce(new Error("cf down"));
    const h = makeHarness({ actions: { deleteVideo } });
    await startUploading(h);
    h.controller.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.session()).toMatchObject({ phase: "canceled", cleanupRequired: true });
    expect(h.controller.reset()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000); // backoff → second, successful attempt
    expect(deleteVideo).toHaveBeenCalledTimes(2);
    expect(h.session()).toMatchObject({ phase: "canceled", cleanupRequired: false });
    expect(h.controller.reset()).toBe(true);
  });

  it("cancel from a recoverable upload error still owes the remote delete", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    transport.input.callbacks.onError({ code: "network" });
    expect(h.controller.cancel()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.actions.deleteVideo).toHaveBeenCalledWith({ streamVideoId: "sv-1" });
    expect(h.session()).toMatchObject({ phase: "canceled", cleanupRequired: false });
  });

  it("cancel is rejected on terminal sessions", async () => {
    const h = makeHarness({
      actions: { getVideoStatus: vi.fn(async () => ({ status: "ready" as const })) },
    });
    await startProcessing(h);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(h.session().phase).toBe("ready");
    expect(h.controller.cancel()).toBe(false);
  });
});

// ─────────────────────────────── Reset & lifecycle ──────────────────────────

describe("reset and full-cycle reuse", () => {
  it("reset after ready returns to idle and a fresh upload uses a new transport", async () => {
    const h = makeHarness({
      actions: { getVideoStatus: vi.fn(async () => ({ status: "ready" as const })) },
    });
    await startProcessing(h);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(h.session().phase).toBe("ready");
    expect(h.controller.beginUpload(fakeFile(), "post-2").ok).toBe(false);
    expect(h.controller.reset()).toBe(true);
    expect(h.controller.beginUpload(fakeFile(), "post-2").ok).toBe(true);
    await flushMicrotasks();
    expect(h.transports).toHaveLength(2);
  });

  it("notifies subscribers on every state change and honors unsubscribe", async () => {
    const h = makeHarness();
    const listener = vi.fn();
    const unsubscribe = h.controller.subscribe(listener);
    await startUploading(h);
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    unsubscribe();
    h.controller.cancel();
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});

// ─────────────────────────────── Unmount / dispose ──────────────────────────

describe("dispose (unmount)", () => {
  it("aborts the active transport and silences late callbacks", async () => {
    const h = makeHarness();
    const transport = await startUploading(h);
    const listener = vi.fn();
    h.controller.subscribe(listener);
    h.controller.dispose();
    expect(transport.abortCalls).toBe(1);
    transport.input.callbacks.onProgress(52_428_800);
    transport.input.callbacks.onSuccess();
    transport.input.callbacks.onError({ code: "network" });
    expect(listener).not.toHaveBeenCalled();
    expect(h.session()).toMatchObject({ phase: "uploading", bytesSent: 0 }); // frozen
    expect(h.actions.attachVideo).not.toHaveBeenCalled();
  });

  it("stops the poll timer — no further status calls after unmount", async () => {
    const h = makeHarness();
    await startProcessing(h);
    h.controller.dispose();
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(h.actions.getVideoStatus).not.toHaveBeenCalled();
  });

  it("best-effort deletes a ticket that resolves after unmount", async () => {
    const gate = deferred<typeof TICKET>();
    const h = makeHarness({ actions: { createTicket: vi.fn(() => gate.promise) } });
    h.controller.beginUpload(fakeFile(), "post-1");
    h.controller.dispose();
    gate.resolve({ ...TICKET });
    await flushMicrotasks();
    expect(h.actions.deleteVideo).toHaveBeenCalledWith({ streamVideoId: "sv-1" });
    expect(h.transports).toHaveLength(0);
  });

  it("rejects commands while disposed and re-arms via activate (StrictMode)", async () => {
    const h = makeHarness();
    h.controller.dispose();
    expect(h.controller.beginUpload(fakeFile(), "post-1").ok).toBe(false);
    expect(h.controller.cancel()).toBe(false);
    expect(h.controller.reset()).toBe(false);
    h.controller.activate();
    expect(h.controller.beginUpload(fakeFile(), "post-1").ok).toBe(true);
    await flushMicrotasks();
    expect(h.session().phase).toBe("uploading");
  });
});

// ─────────────────────────────── Safety ─────────────────────────────────────

describe("error safety", () => {
  it("no upstream error text ever reaches the snapshot", async () => {
    const h = makeHarness({
      actions: {
        createTicket: vi.fn(async () =>
          Promise.reject(new Error("SECRET cloudflare response body https://api.cloudflare.com")),
        ),
      },
    });
    h.controller.beginUpload(fakeFile(), "post-1");
    await flushMicrotasks();
    const serialized = JSON.stringify(h.controller.getSnapshot());
    expect(h.session().phase).toBe("error");
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("cloudflare.com");
  });
});

// ─────────────────────────────── Derived flags ──────────────────────────────

describe("deriveUploadFlags", () => {
  const uploading: UploadSession = {
    phase: "uploading",
    streamVideoId: "sv-1",
    fileName: "clip.mp4",
    totalBytes: 100,
    bytesSent: 10,
    progressPercent: 10,
    uploadAttempt: 1,
  };

  it("maps each phase to its capabilities", () => {
    expect(deriveUploadFlags({ phase: "idle" })).toEqual({
      isUploading: false,
      canPause: false,
      canResume: false,
      canRetry: false,
      cleanupRequired: false,
      detachRequired: false,
    });
    expect(deriveUploadFlags(uploading)).toMatchObject({ isUploading: true, canPause: true });
    expect(deriveUploadFlags({ ...uploading, phase: "paused" })).toMatchObject({
      isUploading: false,
      canResume: true,
    });
    expect(
      deriveUploadFlags({
        phase: "ticketing",
        fileName: "clip.mp4",
        totalBytes: 100,
        ticketAttempt: 1,
      }),
    ).toMatchObject({ isUploading: true });
    expect(
      deriveUploadFlags({
        phase: "attaching",
        streamVideoId: "sv-1",
        postId: "p-1",
        attachAttempt: 1,
      }),
    ).toMatchObject({ isUploading: true });
    expect(
      deriveUploadFlags({ phase: "processing", streamVideoId: "sv-1", postId: "p-1" }),
    ).toMatchObject({ isUploading: false });
  });

  it("exposes retryability and cleanup debt honestly", () => {
    const recoverable: UploadSession = {
      phase: "error",
      code: "network",
      category: "upload",
      recoverable: true,
      attempt: 1,
      resume: {
        phase: "uploading",
        streamVideoId: "sv-1",
        fileName: "f",
        totalBytes: 100,
        bytesSent: 0,
      },
    };
    expect(deriveUploadFlags(recoverable).canRetry).toBe(true);
    expect(
      deriveUploadFlags({ ...recoverable, attempt: UPLOAD_RETRY_LIMITS.upload }).canRetry,
    ).toBe(false);
    expect(deriveUploadFlags({ ...recoverable, recoverable: false }).canRetry).toBe(false);
    expect(
      deriveUploadFlags({
        phase: "canceled",
        cleanupRequired: true,
        detachRequired: true,
        streamVideoId: "sv-1",
      }),
    ).toMatchObject({ cleanupRequired: true, detachRequired: true });
  });
});
