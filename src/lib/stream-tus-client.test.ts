// ============================================================================
// CABANA — tus transport adapter tests (Checkpoint 5A.2)
// ----------------------------------------------------------------------------
// The tus Upload constructor is INJECTED as a fake — no tus network stack is
// ever exercised, no request leaves the process, and no Cloudflare URL is
// contacted. What's under test: option wiring (retries disabled, fingerprints
// off), pause/resume/abort semantics, callback suppression after abort, and
// the safe-error mapping (statuses → stable codes, bodies never copied).
// ============================================================================
import { describe, expect, it } from "vitest";
import { TUS_MIN_CHUNK_BYTES, TUS_RECOMMENDED_CHUNK_BYTES } from "@/lib/cabana-stream";
import {
  type CreateTransportInput,
  type SafeTransportError,
  type TusUploadOptionsSubset,
  classifyTusStatus,
  createTusTransportFactory,
  toSafeTransportError,
} from "@/lib/stream-tus-client";

// ─────────────────────────────── Fakes ──────────────────────────────────────

class FakeUpload {
  static instances: FakeUpload[] = [];
  file: Blob;
  options: TusUploadOptionsSubset;
  startCalls = 0;
  abortCalls: boolean[] = [];
  abortResult: Promise<void> = Promise.resolve();

  constructor(file: Blob, options: TusUploadOptionsSubset) {
    this.file = file;
    this.options = options;
    FakeUpload.instances.push(this);
  }

  start(): void {
    this.startCalls += 1;
  }

  abort(shouldTerminate?: boolean): Promise<void> {
    this.abortCalls.push(shouldTerminate === true);
    return this.abortResult;
  }
}

function buildInput(overrides: Partial<CreateTransportInput> = {}): {
  input: CreateTransportInput;
  progress: number[];
  successes: number[];
  errors: SafeTransportError[];
} {
  const progress: number[] = [];
  const successes: number[] = [];
  const errors: SafeTransportError[] = [];
  const input: CreateTransportInput = {
    file: { size: 123, type: "video/mp4" } as unknown as Blob,
    uploadUrl: "https://upload.cloudflarestream.com/tus/abc123",
    chunkSizeBytes: TUS_RECOMMENDED_CHUNK_BYTES,
    callbacks: {
      onProgress: (bytesSent) => progress.push(bytesSent),
      onSuccess: () => successes.push(1),
      onError: (error) => errors.push(error),
    },
    ...overrides,
  };
  return { input, progress, successes, errors };
}

function makeTransport(overrides: Partial<CreateTransportInput> = {}) {
  FakeUpload.instances = [];
  const factory = createTusTransportFactory(FakeUpload);
  const built = buildInput(overrides);
  const transport = factory(built.input);
  return { transport, upload: FakeUpload.instances[0], ...built };
}

/** A tus DetailedError-shaped object; `body`/`message` must never surface. */
function detailedError(status: number | null): Error {
  const error = new Error("SECRET raw tus message with response body");
  Object.assign(error, {
    originalResponse:
      status === null
        ? null
        : {
            getStatus: () => status,
            getBody: () => "SECRET response body",
          },
  });
  return error;
}

// ─────────────────────────────── Factory contract ───────────────────────────

describe("createTusTransportFactory", () => {
  it("constructs the upload with retries disabled and fingerprints off", () => {
    const { upload, input } = makeTransport();
    expect(upload.file).toBe(input.file);
    expect(upload.options.uploadUrl).toBe(input.uploadUrl);
    expect(upload.options.chunkSize).toBe(TUS_RECOMMENDED_CHUNK_BYTES);
    expect(upload.options.retryDelays).toBeNull();
    expect(upload.options.storeFingerprintForResuming).toBe(false);
  });

  it("accepts the minimum valid chunk size", () => {
    const { upload } = makeTransport({ chunkSizeBytes: TUS_MIN_CHUNK_BYTES });
    expect(upload.options.chunkSize).toBe(TUS_MIN_CHUNK_BYTES);
  });

  it("rejects a non-https upload URL", () => {
    expect(() =>
      makeTransport({ uploadUrl: "http://upload.cloudflarestream.com/tus/abc" }),
    ).toThrow("A https upload URL is required.");
    expect(() => makeTransport({ uploadUrl: "" })).toThrow("A https upload URL is required.");
  });

  it("rejects an invalid tus chunk size", () => {
    expect(() => makeTransport({ chunkSizeBytes: 1234 })).toThrow(
      "chunkSizeBytes must be a valid tus chunk size.",
    );
  });

  it("start() starts the underlying upload exactly once per call", () => {
    const { transport, upload } = makeTransport();
    transport.start();
    expect(upload.startCalls).toBe(1);
  });

  it("pause() aborts WITHOUT terminate so the offset survives", () => {
    const { transport, upload } = makeTransport();
    transport.start();
    transport.pause();
    expect(upload.abortCalls).toEqual([false]);
  });

  it("resume() re-starts the same upload instance (offset-preserving)", () => {
    const { transport, upload } = makeTransport();
    transport.start();
    transport.pause();
    transport.resume();
    expect(upload.startCalls).toBe(2);
    expect(FakeUpload.instances).toHaveLength(1);
  });

  it("abort() never passes terminate=true (remote delete is the server action's job)", () => {
    const { transport, upload } = makeTransport();
    transport.start();
    transport.abort();
    expect(upload.abortCalls).toEqual([false]);
  });

  it("swallows an abort rejection instead of surfacing a fake failure", async () => {
    const { transport, upload, errors } = makeTransport();
    upload.abortResult = Promise.reject(new Error("SECRET abort failure"));
    transport.pause();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toEqual([]);
  });

  it("forwards progress and success callbacks", () => {
    const { transport, upload, progress, successes } = makeTransport();
    transport.start();
    upload.options.onProgress(1_000, 123_000);
    upload.options.onProgress(2_000, 123_000);
    upload.options.onSuccess();
    expect(progress).toEqual([1_000, 2_000]);
    expect(successes).toHaveLength(1);
  });

  it("maps errors to safe codes and never forwards the raw error", () => {
    const { transport, upload, errors } = makeTransport();
    transport.start();
    upload.options.onError(detailedError(503));
    expect(errors).toEqual([{ code: "server_unavailable" }]);
    expect(JSON.stringify(errors)).not.toContain("SECRET");
  });

  it("keeps forwarding after pause (the state machine drops stale events)", () => {
    const { transport, upload, progress } = makeTransport();
    transport.start();
    transport.pause();
    upload.options.onProgress(5_000, 123_000);
    expect(progress).toEqual([5_000]);
  });

  it("suppresses every callback after abort()", () => {
    const { transport, upload, progress, successes, errors } = makeTransport();
    transport.start();
    transport.abort();
    upload.options.onProgress(5_000, 123_000);
    upload.options.onSuccess();
    upload.options.onError(detailedError(500));
    expect(progress).toEqual([]);
    expect(successes).toEqual([]);
    expect(errors).toEqual([]);
  });
});

// ─────────────────────────────── Error mapping ──────────────────────────────

describe("classifyTusStatus", () => {
  it("maps statuses to the state machine's taxonomy", () => {
    expect(classifyTusStatus(null)).toBe("network");
    expect(classifyTusStatus(401)).toBe("unauthorized");
    expect(classifyTusStatus(403)).toBe("unauthorized");
    expect(classifyTusStatus(408)).toBe("timeout");
    expect(classifyTusStatus(429)).toBe("quota_exceeded");
    expect(classifyTusStatus(500)).toBe("server_unavailable");
    expect(classifyTusStatus(502)).toBe("server_unavailable");
    expect(classifyTusStatus(504)).toBe("server_unavailable");
    expect(classifyTusStatus(400)).toBe("validation_failed");
    expect(classifyTusStatus(404)).toBe("validation_failed");
    expect(classifyTusStatus(413)).toBe("validation_failed");
    expect(classifyTusStatus(415)).toBe("validation_failed");
    expect(classifyTusStatus(200)).toBe("unknown");
    expect(classifyTusStatus(302)).toBe("unknown");
  });
});

describe("toSafeTransportError", () => {
  it("classifies a response-carrying tus error by status only", () => {
    expect(toSafeTransportError(detailedError(401))).toEqual({ code: "unauthorized" });
    expect(toSafeTransportError(detailedError(429))).toEqual({ code: "quota_exceeded" });
    expect(toSafeTransportError(detailedError(422))).toEqual({ code: "validation_failed" });
  });

  it("treats no response as a network failure", () => {
    expect(toSafeTransportError(detailedError(null))).toEqual({ code: "network" });
    expect(toSafeTransportError(new Error("SECRET plain error"))).toEqual({ code: "network" });
    expect(toSafeTransportError(undefined)).toEqual({ code: "network" });
    expect(toSafeTransportError("string error")).toEqual({ code: "network" });
  });

  it("fails to network when getStatus throws or returns garbage", () => {
    const throwing = new Error("SECRET");
    Object.assign(throwing, {
      originalResponse: {
        getStatus: () => {
          throw new Error("SECRET status failure");
        },
      },
    });
    expect(toSafeTransportError(throwing)).toEqual({ code: "network" });

    const garbage = new Error("SECRET");
    Object.assign(garbage, { originalResponse: { getStatus: () => "500" } });
    expect(toSafeTransportError(garbage)).toEqual({ code: "network" });

    const nonCallable = new Error("SECRET");
    Object.assign(nonCallable, { originalResponse: { getStatus: 500 } });
    expect(toSafeTransportError(nonCallable)).toEqual({ code: "network" });
  });

  it("emits ONLY the code — no message, body, or URL fields", () => {
    const safe = toSafeTransportError(detailedError(500));
    expect(Object.keys(safe)).toEqual(["code"]);
    expect(JSON.stringify(safe)).not.toContain("SECRET");
  });
});
