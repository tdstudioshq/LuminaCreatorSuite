// ============================================================================
// CABANA — creator upload-session domain model (Checkpoint 5A.1, PURE)
// ----------------------------------------------------------------------------
// The client-side lifecycle of ONE video upload, from file selection to a
// ready (or abandoned) Cloudflare Stream asset. This module is deliberately
// pure: no React, no browser globals, no process.env, no fetch, no Supabase,
// no tus-js-client — the 5A.2 hook drives tus and the Checkpoint 3 server
// actions, and feeds their outcomes in as events. Everything here is a
// deterministic function of (state, event), so the entire upload UX is
// unit-testable without a network. In the 95% coverage set.
//
// Shape of the machine (states → see `UploadSession`):
//
//   idle → ticketing → uploading ⇄ paused
//                          │ upload_completed(postId)
//                          ▼
//                      attaching → processing → ready (terminal)
//
//   Any in-flight phase can fail into `error` (safe code + recoverability +
//   the prior phase's resume snapshot) or be canceled into `canceled` (which
//   records whether remote cleanup — and a post_media detach FIRST — is still
//   owed). `ready` and `canceled` are terminal unless `reset`; a canceled
//   session may only reset once cleanup is no longer required, so the model
//   can never pretend a Cloudflare asset was deleted (`cleanup_completed` is
//   the only event that clears the debt).
//
// Deletion-order invariant (release direction, July 13 2026): cleanup of an
// attached video must DETACH post_media BEFORE deleting the Cloudflare asset —
// `requiredCleanupSteps` returns the steps in that order.
// ============================================================================
import {
  type StreamUploadPolicy,
  type UploadDenialReason,
  DEFAULT_STREAM_UPLOAD_POLICY,
  TUS_MIN_CHUNK_BYTES,
  TUS_RECOMMENDED_CHUNK_BYTES,
  evaluateUploadTicketRequest,
} from "@/lib/cabana-stream";

// ─────────────────────────────── Error taxonomy ─────────────────────────────

/** Stable, user-safe failure codes. Never carry free text from a response. */
export const UPLOAD_ERROR_CODES = [
  "network",
  "timeout",
  "server_unavailable",
  "unauthorized",
  "validation_failed",
  "quota_exceeded",
  "processing_failed",
  "unknown",
] as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

/**
 * Only transient transport/service failures are retryable. Authorization,
 * validation, and quota failures need a different user action, a Cloudflare
 * terminal processing error is unrecoverable for this asset, and `unknown`
 * fails CLOSED (the user can cancel + reset rather than loop blindly).
 */
export function isRetryableUploadErrorCode(code: UploadErrorCode): boolean {
  return code === "network" || code === "timeout" || code === "server_unavailable";
}

/** Where in the pipeline a failure happened; retry limits are per category. */
export type UploadFailureCategory =
  | "ticket"
  | "upload"
  | "attach"
  | "processing"
  | "polling"
  | "cleanup";

/**
 * Maximum TOTAL attempts per category (first try included). `processing` is 0
 * because a Cloudflare terminal encode error can never be retried through the
 * same upload session — the asset itself is dead. `polling` and `cleanup` are
 * scheduling budgets for the 5A.2 hook (poll/cleanup failures do not
 * transition the session; the webhook remains the primary lifecycle driver).
 */
export const UPLOAD_RETRY_LIMITS: Readonly<Record<UploadFailureCategory, number>> = {
  ticket: 3,
  upload: 5,
  attach: 3,
  processing: 0,
  polling: 5,
  cleanup: 3,
};

/** Categories that can actually be scheduled for a retry. */
export type SchedulableUploadFailureCategory = Exclude<UploadFailureCategory, "processing">;

const UPLOAD_RETRY_BASE_MS: Readonly<Record<SchedulableUploadFailureCategory, number>> = {
  ticket: 1_000,
  upload: 2_000,
  attach: 1_000,
  polling: 4_000,
  cleanup: 2_000,
};

export const UPLOAD_RETRY_MAX_DELAY_MS = 30_000;

/**
 * Deterministic backoff for the Nth attempt: base · 2^(attempt−1), capped —
 * the same shape as `computeBackoffSeconds` (cabana-notification-engine).
 * No randomness unless the caller INJECTS `jitter01` ∈ [0, 1), which adds up
 * to +25% (applied after the cap, so the ceiling is cap · 1.25).
 */
export function computeUploadRetryDelayMs(
  category: SchedulableUploadFailureCategory,
  attempt: number,
  jitter01?: number,
): number {
  const n = Math.max(1, Math.trunc(attempt));
  const raw = UPLOAD_RETRY_BASE_MS[category] * 2 ** (n - 1);
  const capped = Math.min(raw, UPLOAD_RETRY_MAX_DELAY_MS);
  if (jitter01 === undefined) return capped;
  if (typeof jitter01 !== "number" || !Number.isFinite(jitter01) || jitter01 < 0 || jitter01 >= 1) {
    throw new Error("jitter01 must be a finite number in [0, 1).");
  }
  return Math.floor(capped * (1 + 0.25 * jitter01));
}

// ─────────────────────────────── Progress math ──────────────────────────────

/**
 * Derived progress percent — integer 0–100, floor, never trusted from input.
 * Throws on contract violations (callers validate first; UI passes state
 * fields that the machine already guaranteed).
 */
export function computeUploadProgressPercent(bytesSent: number, totalBytes: number): number {
  if (!Number.isInteger(totalBytes) || totalBytes <= 0) {
    throw new Error("totalBytes must be a positive integer.");
  }
  if (!Number.isInteger(bytesSent) || bytesSent < 0 || bytesSent > totalBytes) {
    throw new Error("bytesSent must be an integer within [0, totalBytes].");
  }
  return Math.floor((bytesSent / totalBytes) * 100);
}

// ─────────────────────────────── Session states ─────────────────────────────

/** Snapshot an `error` state carries so a retry can re-enter the prior phase. */
export type UploadErrorResume =
  | { phase: "ticketing"; fileName: string; totalBytes: number }
  | {
      phase: "uploading";
      streamVideoId: string;
      fileName: string;
      totalBytes: number;
      bytesSent: number;
    }
  | { phase: "attaching"; streamVideoId: string; postId: string }
  | { phase: "processing"; streamVideoId: string; postId: string };

/**
 * The discriminated union of session states. Each variant carries ONLY the
 * fields that exist in that phase, so illegal combinations (e.g. progress on
 * an idle session, a postId before attach) are unrepresentable.
 */
export type UploadSession =
  | { phase: "idle" }
  | { phase: "ticketing"; fileName: string; totalBytes: number; ticketAttempt: number }
  | {
      phase: "uploading";
      streamVideoId: string;
      fileName: string;
      totalBytes: number;
      bytesSent: number;
      progressPercent: number;
      uploadAttempt: number;
    }
  | {
      phase: "paused";
      streamVideoId: string;
      fileName: string;
      totalBytes: number;
      bytesSent: number;
      progressPercent: number;
      uploadAttempt: number;
    }
  | { phase: "attaching"; streamVideoId: string; postId: string; attachAttempt: number }
  | { phase: "processing"; streamVideoId: string; postId: string }
  | { phase: "ready"; streamVideoId: string; postId: string }
  | {
      phase: "error";
      code: UploadErrorCode;
      category: UploadFailureCategory;
      recoverable: boolean;
      /** Attempts consumed so far in this category (first try included). */
      attempt: number;
      resume: UploadErrorResume;
    }
  | {
      phase: "canceled";
      /** A Cloudflare asset (and its stream_videos row) still needs deletion. */
      cleanupRequired: boolean;
      /** post_media may reference the video — it must be DETACHED first. */
      detachRequired: boolean;
      streamVideoId: string | null;
    };

export function createIdleUploadSession(): UploadSession {
  return { phase: "idle" };
}

// ─────────────────────────────── Session events ─────────────────────────────

export type UploadSessionEvent =
  | { type: "ticket_requested"; fileName: string; totalBytes: number }
  | { type: "ticket_received"; streamVideoId: string }
  | { type: "ticket_failed"; code: UploadErrorCode }
  | { type: "upload_progress"; bytesSent: number }
  | { type: "upload_paused" }
  | { type: "upload_resumed" }
  | { type: "upload_failed"; code: UploadErrorCode }
  | { type: "retry_requested" }
  | { type: "upload_completed"; postId: string }
  | { type: "attachment_completed" }
  | { type: "attachment_failed"; code: UploadErrorCode }
  | { type: "status_processing" }
  | { type: "status_ready" }
  | { type: "status_error" }
  | { type: "cancel_requested" }
  | { type: "cleanup_completed" }
  | { type: "reset" };

export type UploadTransitionDenial =
  | "invalid_transition"
  | "invalid_payload"
  | "progress_regression"
  | "progress_overflow"
  | "retry_not_recoverable"
  | "retry_exhausted"
  | "cleanup_pending";

/** Structured outcome — invalid transitions are rejected, never thrown. */
export type UploadTransitionResult =
  | { ok: true; session: UploadSession }
  | { ok: false; denial: UploadTransitionDenial; message: string };

function ok(session: UploadSession): UploadTransitionResult {
  return { ok: true, session };
}

// Denial messages are STATIC strings — no event payload (filenames, ids,
// upstream error text) is ever interpolated, so they can never carry secrets.
function deny(denial: UploadTransitionDenial, message: string): UploadTransitionResult {
  return { ok: false, denial, message };
}

function invalidFor(session: UploadSession, event: UploadSessionEvent): UploadTransitionResult {
  return deny(
    "invalid_transition",
    `Event "${event.type}" is not valid in phase "${session.phase}".`,
  );
}

function isValidErrorCode(code: unknown): code is UploadErrorCode {
  return typeof code === "string" && (UPLOAD_ERROR_CODES as readonly string[]).includes(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Build the error state for a failure event out of an in-flight phase. */
function toError(
  code: UploadErrorCode,
  category: UploadFailureCategory,
  attempt: number,
  resume: UploadErrorResume,
): UploadSession {
  return {
    phase: "error",
    code,
    category,
    recoverable: isRetryableUploadErrorCode(code),
    attempt,
    resume,
  };
}

// ─────────────────────────────── Transition fn ──────────────────────────────

/**
 * The pure transition function. Every rule from the 5A.1 contract lives here:
 * progress monotonicity, derived percentages, pause/resume gating, per-
 * category retry caps, terminal-state stability, and cleanup-debt honesty.
 */
export function transitionUploadSession(
  session: UploadSession,
  event: UploadSessionEvent,
): UploadTransitionResult {
  switch (event.type) {
    case "ticket_requested": {
      if (session.phase !== "idle") return invalidFor(session, event);
      if (!Number.isInteger(event.totalBytes) || event.totalBytes <= 0) {
        return deny("invalid_payload", "totalBytes must be a positive integer.");
      }
      return ok({
        phase: "ticketing",
        fileName: normalizeUploadFileName(event.fileName),
        totalBytes: event.totalBytes,
        ticketAttempt: 1,
      });
    }

    case "ticket_received": {
      if (!isNonEmptyString(event.streamVideoId)) {
        return deny("invalid_payload", "streamVideoId must be a non-empty string.");
      }
      // A ticket that lands AFTER cancellation flips the cleanup debt on: the
      // server created a row + Cloudflare asset that now must be reclaimed.
      if (session.phase === "canceled") {
        return ok({
          phase: "canceled",
          cleanupRequired: true,
          detachRequired: session.detachRequired,
          streamVideoId: event.streamVideoId,
        });
      }
      if (session.phase !== "ticketing") return invalidFor(session, event);
      return ok({
        phase: "uploading",
        streamVideoId: event.streamVideoId,
        fileName: session.fileName,
        totalBytes: session.totalBytes,
        bytesSent: 0,
        progressPercent: 0,
        uploadAttempt: 1,
      });
    }

    case "ticket_failed": {
      if (session.phase !== "ticketing") return invalidFor(session, event);
      if (!isValidErrorCode(event.code)) {
        return deny("invalid_payload", "Unknown upload error code.");
      }
      return ok(
        toError(event.code, "ticket", session.ticketAttempt, {
          phase: "ticketing",
          fileName: session.fileName,
          totalBytes: session.totalBytes,
        }),
      );
    }

    case "upload_progress": {
      if (session.phase !== "uploading") return invalidFor(session, event);
      if (!Number.isInteger(event.bytesSent) || event.bytesSent < 0) {
        return deny("invalid_payload", "bytesSent must be a non-negative integer.");
      }
      if (event.bytesSent > session.totalBytes) {
        return deny("progress_overflow", "bytesSent cannot exceed totalBytes.");
      }
      if (event.bytesSent < session.bytesSent) {
        return deny("progress_regression", "Progress cannot decrease within an upload attempt.");
      }
      return ok({
        ...session,
        bytesSent: event.bytesSent,
        progressPercent: computeUploadProgressPercent(event.bytesSent, session.totalBytes),
      });
    }

    case "upload_paused": {
      if (session.phase !== "uploading") return invalidFor(session, event);
      return ok({ ...session, phase: "paused" });
    }

    case "upload_resumed": {
      if (session.phase !== "paused") return invalidFor(session, event);
      return ok({ ...session, phase: "uploading" });
    }

    case "upload_failed": {
      if (session.phase !== "uploading") return invalidFor(session, event);
      if (!isValidErrorCode(event.code)) {
        return deny("invalid_payload", "Unknown upload error code.");
      }
      return ok(
        toError(event.code, "upload", session.uploadAttempt, {
          phase: "uploading",
          streamVideoId: session.streamVideoId,
          fileName: session.fileName,
          totalBytes: session.totalBytes,
          bytesSent: session.bytesSent,
        }),
      );
    }

    case "upload_completed": {
      if (session.phase !== "uploading") return invalidFor(session, event);
      if (!isNonEmptyString(event.postId)) {
        return deny("invalid_payload", "postId must be a non-empty string.");
      }
      return ok({
        phase: "attaching",
        streamVideoId: session.streamVideoId,
        postId: event.postId,
        attachAttempt: 1,
      });
    }

    case "attachment_completed": {
      if (session.phase !== "attaching") return invalidFor(session, event);
      return ok({
        phase: "processing",
        streamVideoId: session.streamVideoId,
        postId: session.postId,
      });
    }

    case "attachment_failed": {
      if (session.phase !== "attaching") return invalidFor(session, event);
      if (!isValidErrorCode(event.code)) {
        return deny("invalid_payload", "Unknown upload error code.");
      }
      return ok(
        toError(event.code, "attach", session.attachAttempt, {
          phase: "attaching",
          streamVideoId: session.streamVideoId,
          postId: session.postId,
        }),
      );
    }

    case "status_processing": {
      // Idempotent poll/webhook replay while still encoding.
      if (session.phase !== "processing") return invalidFor(session, event);
      return ok(session);
    }

    case "status_ready": {
      if (session.phase !== "processing") return invalidFor(session, event);
      return ok({ phase: "ready", streamVideoId: session.streamVideoId, postId: session.postId });
    }

    case "status_error": {
      // Cloudflare reported a TERMINAL encode failure: the asset is dead, so
      // this is never retryable through the same session (limit is also 0).
      if (session.phase !== "processing") return invalidFor(session, event);
      return ok({
        phase: "error",
        code: "processing_failed",
        category: "processing",
        recoverable: false,
        attempt: 1,
        resume: {
          phase: "processing",
          streamVideoId: session.streamVideoId,
          postId: session.postId,
        },
      });
    }

    case "retry_requested": {
      if (session.phase !== "error") return invalidFor(session, event);
      if (!session.recoverable) {
        return deny("retry_not_recoverable", "This failure cannot be retried.");
      }
      if (session.resume.phase === "processing") {
        // Unreachable in practice (processing errors are never recoverable),
        // but the gate fails closed rather than trusting construction.
        return deny("retry_not_recoverable", "This failure cannot be retried.");
      }
      if (session.attempt >= UPLOAD_RETRY_LIMITS[session.category]) {
        return deny("retry_exhausted", "Retry attempts for this step are exhausted.");
      }
      const nextAttempt = session.attempt + 1;
      const resume = session.resume;
      if (resume.phase === "ticketing") {
        return ok({
          phase: "ticketing",
          fileName: resume.fileName,
          totalBytes: resume.totalBytes,
          ticketAttempt: nextAttempt,
        });
      }
      if (resume.phase === "uploading") {
        // tus resumes from the recorded offset; progress stays monotonic.
        return ok({
          phase: "uploading",
          streamVideoId: resume.streamVideoId,
          fileName: resume.fileName,
          totalBytes: resume.totalBytes,
          bytesSent: resume.bytesSent,
          progressPercent: computeUploadProgressPercent(resume.bytesSent, resume.totalBytes),
          uploadAttempt: nextAttempt,
        });
      }
      return ok({
        phase: "attaching",
        streamVideoId: resume.streamVideoId,
        postId: resume.postId,
        attachAttempt: nextAttempt,
      });
    }

    case "cancel_requested": {
      switch (session.phase) {
        case "idle":
          return ok({
            phase: "canceled",
            cleanupRequired: false,
            detachRequired: false,
            streamVideoId: null,
          });
        case "ticketing":
          // No ticket has been received; if one lands later, the
          // ticket_received-on-canceled transition flips the debt on.
          return ok({
            phase: "canceled",
            cleanupRequired: false,
            detachRequired: false,
            streamVideoId: null,
          });
        case "uploading":
        case "paused":
          return ok({
            phase: "canceled",
            cleanupRequired: true,
            detachRequired: false,
            streamVideoId: session.streamVideoId,
          });
        case "attaching":
        case "processing":
          // The attach may have landed — cleanup must detach post_media FIRST.
          return ok({
            phase: "canceled",
            cleanupRequired: true,
            detachRequired: true,
            streamVideoId: session.streamVideoId,
          });
        case "error": {
          const resume = session.resume;
          if (resume.phase === "ticketing") {
            return ok({
              phase: "canceled",
              cleanupRequired: false,
              detachRequired: false,
              streamVideoId: null,
            });
          }
          const detachRequired = resume.phase === "attaching" || resume.phase === "processing";
          return ok({
            phase: "canceled",
            cleanupRequired: true,
            detachRequired,
            streamVideoId: resume.streamVideoId,
          });
        }
        default:
          // ready is the app's delete flow, not a session cancel; canceled
          // is already terminal.
          return invalidFor(session, event);
      }
    }

    case "cleanup_completed": {
      if (session.phase !== "canceled" || !session.cleanupRequired) {
        return invalidFor(session, event);
      }
      return ok({
        phase: "canceled",
        cleanupRequired: false,
        detachRequired: false,
        streamVideoId: session.streamVideoId,
      });
    }

    case "reset": {
      if (session.phase === "ready") return ok(createIdleUploadSession());
      if (session.phase === "canceled") {
        if (session.cleanupRequired) {
          return deny(
            "cleanup_pending",
            "Cleanup is still required; it must complete before reset.",
          );
        }
        return ok(createIdleUploadSession());
      }
      // From error the exit path is cancel_requested → cleanup → reset, so the
      // session never silently forgets a remote asset.
      return invalidFor(session, event);
    }
  }
}

// ─────────────────────────────── Cleanup steps ──────────────────────────────

export type StreamCleanupStep = "detach_post_media" | "delete_remote_video";

/**
 * Ordered remote-cleanup steps still owed by a session. Detach ALWAYS comes
 * before deleting the Cloudflare asset (the deleteStreamVideo action rejects
 * attached videos, so the reverse order cannot even succeed).
 */
export function requiredCleanupSteps(session: UploadSession): readonly StreamCleanupStep[] {
  if (session.phase !== "canceled" || !session.cleanupRequired) return [];
  return session.detachRequired
    ? ["detach_post_media", "delete_remote_video"]
    : ["delete_remote_video"];
}

/** Whether an error state can be retried right now (recoverable AND capped). */
export function canRetryUploadSession(session: UploadSession): boolean {
  return (
    session.phase === "error" &&
    session.recoverable &&
    session.attempt < UPLOAD_RETRY_LIMITS[session.category]
  );
}

// ─────────────────────────────── File preflight ─────────────────────────────

/**
 * Display-name normalization for the Cloudflare dashboard — mirrors the
 * server's `normalizeFileName` (stream-actions.ts) so the name the creator
 * sees locally matches what the ticket request will record. Never trusted
 * for anything else.
 */
export function normalizeUploadFileName(raw: unknown): string {
  const cleaned =
    typeof raw === "string"
      ? // eslint-disable-next-line no-control-regex -- strip control chars from an untrusted filename
        raw.replace(/[\u0000-\u001f\u007f]/g, "").trim()
      : "";
  return (cleaned || "video").slice(0, 200);
}

/** Preflight rejections reuse the server's stable denial codes. */
export type UploadPreflightRejectionReason = Extract<
  UploadDenialReason,
  "unsupported_mime_type" | "invalid_size" | "too_large" | "too_long"
>;

export type UploadPreflight =
  | {
      ok: true;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      durationHintSeconds: number | null;
    }
  | { ok: false; reason: UploadPreflightRejectionReason; message: string };

/**
 * Metadata-only validation before any ticket request — file BYTES are never
 * inspected. Reuses `evaluateUploadTicketRequest` with zero usage counts so
 * the client applies EXACTLY the server's file rules (same inclusive
 * boundaries, same codes); quota denials are impossible with zero counts and
 * remain server-enforced at ticket time.
 */
export function preflightUploadFile(
  input: {
    fileName?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
    durationHintSeconds?: unknown;
  },
  policy: StreamUploadPolicy = DEFAULT_STREAM_UPLOAD_POLICY,
): UploadPreflight {
  const decision = evaluateUploadTicketRequest({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    durationHintSeconds: input.durationHintSeconds,
    activeUploads: 0,
    uploadsLast24h: 0,
    policy,
  });
  if (!decision.allowed) {
    // Zero counts make quota reasons unreachable; only file reasons remain.
    return {
      ok: false,
      reason: decision.reason as UploadPreflightRejectionReason,
      message: decision.message,
    };
  }
  const hint = input.durationHintSeconds;
  return {
    ok: true,
    fileName: normalizeUploadFileName(input.fileName),
    mimeType: (input.mimeType as string).trim().toLowerCase(),
    sizeBytes: input.sizeBytes as number,
    durationHintSeconds: hint === undefined || hint === null ? null : (hint as number),
  };
}

// ─────────────────────────────── Chunk selection ────────────────────────────

/** Constrained-network chunk: 10 MiB (40 × 256 KiB — a valid tus size). */
export const STREAM_CONSTRAINED_CHUNK_BYTES = 10_485_760;

/**
 * Optional hints only — connection APIs are not universally available and
 * nothing here assumes browser support. Absent/null hints mean "unknown".
 */
export type ChunkSelectionHints = {
  totalBytes?: number | null;
  effectiveConnectionType?: string | null;
  saveData?: boolean | null;
  deviceMemoryGb?: number | null;
};

/**
 * Deterministic tus chunk size. Always a valid `isValidTusChunkSize` value:
 * never below TUS_MIN_CHUNK_BYTES, never above the server-recommended
 * default (TUS_RECOMMENDED_CHUNK_BYTES — what `createStreamUploadTicket`
 * returns as `recommendedChunkSizeBytes`).
 *
 *   1. file fits in one minimum chunk → minimum (least memory, same requests)
 *   2. saveData → minimum
 *   3. slow-2g / 2g → minimum;  3g → constrained (10 MiB)
 *   4. device memory ≤ 2 GB → constrained
 *   5. otherwise → recommended default
 */
export function selectTusChunkSize(hints: ChunkSelectionHints = {}): number {
  const total = hints.totalBytes;
  if (
    typeof total === "number" &&
    Number.isInteger(total) &&
    total > 0 &&
    total <= TUS_MIN_CHUNK_BYTES
  ) {
    return TUS_MIN_CHUNK_BYTES;
  }
  if (hints.saveData === true) return TUS_MIN_CHUNK_BYTES;
  const ect =
    typeof hints.effectiveConnectionType === "string"
      ? hints.effectiveConnectionType.trim().toLowerCase()
      : "";
  if (ect === "slow-2g" || ect === "2g") return TUS_MIN_CHUNK_BYTES;
  if (ect === "3g") return STREAM_CONSTRAINED_CHUNK_BYTES;
  const memory = hints.deviceMemoryGb;
  if (typeof memory === "number" && Number.isFinite(memory) && memory > 0 && memory <= 2) {
    return STREAM_CONSTRAINED_CHUNK_BYTES;
  }
  return TUS_RECOMMENDED_CHUNK_BYTES;
}
