// ============================================================================
// CABANA — tus transport adapter for Cloudflare Stream (Checkpoint 5A.2)
// ----------------------------------------------------------------------------
// The ONLY module that touches `tus-js-client`. It wraps one resumable upload
// behind the minimal `StreamUploadTransport` interface the 5A.2 hook drives —
// components never import tus directly, and nothing here runs on the server
// (server code creates the upload via `stream-cloudflare.server.ts`; the
// browser only PATCHes the one-time direct-upload URL from the ticket).
//
// Trust boundaries:
//   * NO secrets: the transport receives only the tokenized `uploadUrl` that
//     `createStreamUploadTicket` returned — never a Cloudflare account id,
//     API token, or signing key.
//   * NO hidden retry policy: tus's internal retries are DISABLED
//     (`retryDelays: null`); the 5A.1 state machine's per-category retry
//     budget is the only retry authority.
//   * SAFE errors only: tus failures are collapsed to a stable
//     `UploadErrorCode` — response bodies, upstream messages, and URLs are
//     never copied into anything a caller can render.
//   * Resumable offsets are preserved: `pause()` is `abort(false)` (the
//     server keeps the offset) and `resume()`/retry re-`start()` the same
//     Upload, which HEADs the upload URL and continues where it left off.
// ============================================================================
import { Upload } from "tus-js-client";
import { isValidTusChunkSize } from "@/lib/cabana-stream";
import type { UploadErrorCode } from "@/lib/cabana-stream-upload";

// ─────────────────────────────── Safe errors ────────────────────────────────

/** The only failure shape the adapter emits — a stable code, nothing else. */
export type SafeTransportError = { code: UploadErrorCode };

/**
 * Map an HTTP status (or its absence) to the state machine's error taxonomy.
 * `null` means the request never got a response — a network-level failure.
 */
export function classifyTusStatus(status: number | null): UploadErrorCode {
  if (status === null) return "network";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 408) return "timeout";
  if (status === 429) return "quota_exceeded";
  if (status >= 500) return "server_unavailable";
  if (status >= 400) return "validation_failed";
  return "unknown";
}

/**
 * Collapse whatever tus threw into a `SafeTransportError`. Only the numeric
 * HTTP status is read (defensively — a throwing/absent `getStatus` counts as
 * no response); the error's message, response body, and request URL are
 * deliberately never touched.
 */
export function toSafeTransportError(error: unknown): SafeTransportError {
  let status: number | null = null;
  if (error !== null && typeof error === "object" && "originalResponse" in error) {
    const response = (error as { originalResponse: unknown }).originalResponse;
    if (
      response !== null &&
      typeof response === "object" &&
      typeof (response as { getStatus?: unknown }).getStatus === "function"
    ) {
      try {
        const raw = (response as { getStatus: () => unknown }).getStatus();
        if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) status = raw;
      } catch {
        status = null;
      }
    }
  }
  return { code: classifyTusStatus(status) };
}

// ─────────────────────────────── Transport shape ────────────────────────────

export type TusTransportCallbacks = {
  /** Cumulative bytes accepted by the server for this upload. */
  onProgress: (bytesSent: number) => void;
  onSuccess: () => void;
  onError: (error: SafeTransportError) => void;
};

export type StreamUploadTransport = {
  start(): void;
  /** Stop traffic, keep the server-side offset — `resume()` continues it. */
  pause(): void;
  /** Re-start the same upload; tus HEADs the URL and resumes from the offset. */
  resume(): void;
  /**
   * Local terminal stop: halts traffic AND suppresses every later callback.
   * Remote deletion is NOT this layer's job — the hook owes that through
   * `deleteStreamVideo` per the state machine's cleanup debt.
   */
  abort(): void;
};

export type CreateTransportInput = {
  file: Blob;
  /** The one-time tokenized direct-upload URL from `createStreamUploadTicket`. */
  uploadUrl: string;
  /** Must already be a valid tus chunk size (`selectTusChunkSize` output). */
  chunkSizeBytes: number;
  callbacks: TusTransportCallbacks;
};

export type StreamUploadTransportFactory = (input: CreateTransportInput) => StreamUploadTransport;

// ─────────────────────────────── tus injection seam ─────────────────────────

/** The subset of tus `UploadOptions` this adapter ever sets. */
export type TusUploadOptionsSubset = {
  uploadUrl: string;
  chunkSize: number;
  retryDelays: null;
  storeFingerprintForResuming: boolean;
  onProgress: (bytesSent: number, bytesTotal: number) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
};

export type TusUploadLike = {
  start(): void;
  abort(shouldTerminate?: boolean): Promise<void>;
};

/** Constructor seam so tests inject a fake Upload — no network, no Cloudflare. */
export type TusUploadConstructorLike = new (
  file: Blob,
  options: TusUploadOptionsSubset,
) => TusUploadLike;

// ─────────────────────────────── Factory ────────────────────────────────────

/**
 * Build a transport factory around a tus Upload constructor (the real
 * `tus-js-client` Upload by default; a fake in tests). Throws with STATIC
 * messages on contract violations — the URL/chunk inputs come from our own
 * ticket flow and pure chunk selector, so a violation is a programmer error.
 */
export function createTusTransportFactory(
  UploadImpl: TusUploadConstructorLike = Upload,
): StreamUploadTransportFactory {
  return function createTransport(input: CreateTransportInput): StreamUploadTransport {
    if (typeof input.uploadUrl !== "string" || !/^https:\/\//.test(input.uploadUrl)) {
      throw new Error("A https upload URL is required.");
    }
    if (!isValidTusChunkSize(input.chunkSizeBytes)) {
      throw new Error("chunkSizeBytes must be a valid tus chunk size.");
    }

    // After abort() nothing may reach the caller again — pause() keeps
    // forwarding (a trailing callback is harmless; the state machine drops it).
    let stopped = false;

    const upload = new UploadImpl(input.file, {
      uploadUrl: input.uploadUrl,
      chunkSize: input.chunkSizeBytes,
      // The 5A.1 retry policy is the ONLY retry authority — tus must not
      // retry (or reorder failures) on its own.
      retryDelays: null,
      // Resume is in-memory via this instance; never persist fingerprints.
      storeFingerprintForResuming: false,
      onProgress: (bytesSent) => {
        if (!stopped) input.callbacks.onProgress(bytesSent);
      },
      onSuccess: () => {
        if (!stopped) input.callbacks.onSuccess();
      },
      onError: (error) => {
        if (!stopped) input.callbacks.onError(toSafeTransportError(error));
      },
    });

    // abort(false) keeps the server-side offset; its promise only reports the
    // stop itself, so a rejection is swallowed rather than surfaced as a fake
    // upload failure.
    const stopTraffic = () => {
      upload.abort(false).catch(() => {});
    };

    return {
      start: () => upload.start(),
      pause: stopTraffic,
      resume: () => upload.start(),
      abort: () => {
        stopped = true;
        stopTraffic();
      },
    };
  };
}

/** The production factory (real tus-js-client). Browser-only code path. */
export const createTusStreamTransport: StreamUploadTransportFactory = (input) =>
  createTusTransportFactory()(input);
