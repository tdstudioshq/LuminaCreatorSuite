// ============================================================================
// CABANA — composer media policy (Checkpoint 5A.3, PURE)
// ----------------------------------------------------------------------------
// Every DECISION the creator composer makes about media lives here: the
// one-video-XOR-images rule, which upload controls are live in each phase, the
// publish/draft gates and their user-facing reasons, the unload guard, and the
// safe copy for every failure. No React, no browser globals, no network — the
// 5A.3 UI (`VideoUploadCard`, `PostComposer`) is a projection of these
// functions, so the whole upload UX is unit-testable without a DOM. In the 95%
// coverage set.
//
// Honesty rules inherited from the 5A.1 machine and preserved here:
//
//   * Copy is derived from the machine's stable `UploadErrorCode` /
//     `UploadFailureCategory` — a raw error message from a server action or
//     from Cloudflare is NEVER surfaced, so no upstream text can leak.
//   * A canceled session with outstanding debt is not "removed". `canRemove`
//     stays false until the debt is actually paid, mirroring the machine's
//     `reset` gate (reset is valid only from `ready` or a debt-free `canceled`;
//     from `error` the exit path is cancel → cleanup → remove).
//   * An ATTACHED video can never be deleted from here. `detachRequired` has no
//     safe automatic action, so the UI reports it and stops — the post_media
//     detach flow is Checkpoint 5A.4.
//
// The UI mirrors the server rules; it does not replace them. `attachStreamVideoToPost`
// (media mix) and the RLS policies remain the final authority.
// ============================================================================
import { MEDIA_PER_POST_MAX } from "@/lib/cabana-posts";
import {
  STREAM_MAX_DURATION_SECONDS,
  STREAM_MAX_SIZE_BYTES,
  STREAM_VIDEO_MIME_ALLOWLIST,
} from "@/lib/cabana-stream";
import {
  type StreamCleanupStep,
  type UploadErrorCode,
  type UploadFailureCategory,
  type UploadPreflightRejectionReason,
  type UploadSession,
  canRetryUploadSession,
  requiredCleanupSteps,
} from "@/lib/cabana-stream-upload";

// ─────────────────────────────── Policy copy ────────────────────────────────
// Every limit the UI states is DERIVED from the policy constants, so the copy
// can never drift from the rule the server actually enforces.

const MIME_LABELS: Readonly<Record<string, string>> = {
  "video/mp4": "MP4",
  "video/quicktime": "MOV",
  "video/webm": "WebM",
};

/** "MP4, MOV, or WebM" — unknown MIME types degrade to the raw type, never a lie. */
export function acceptedVideoLabel(
  mimeTypes: readonly string[] = STREAM_VIDEO_MIME_ALLOWLIST,
): string {
  const labels = mimeTypes.map((mime) => MIME_LABELS[mime] ?? mime);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

/** The `accept` attribute for the video file input — the allowlist itself. */
export const VIDEO_ACCEPT_ATTRIBUTE = STREAM_VIDEO_MIME_ALLOWLIST.join(",");

const MAX_SIZE_LABEL = `${Math.round(STREAM_MAX_SIZE_BYTES / 1024 ** 3)} GB`;
const MAX_DURATION_LABEL = `${Math.round(STREAM_MAX_DURATION_SECONDS / 60)} minutes`;

// ─────────────────────────────── Media occupancy ────────────────────────────

export type ComposerMediaState = {
  imageCount: number;
  session: UploadSession;
};

/**
 * Whether the video slot is spoken for. A canceled session that still owes
 * cleanup (or a detach) DOES occupy the post — the Cloudflare asset, and
 * possibly a `post_media` row, still exist. Only `idle` and a fully-settled
 * `canceled` leave the slot free.
 */
export function videoOccupiesPost(session: UploadSession): boolean {
  if (session.phase === "idle") return false;
  if (session.phase === "canceled") return session.cleanupRequired || session.detachRequired;
  return true;
}

// ─────────────────────────────── Selection gates ────────────────────────────
// These mirror `assertMediaMixAllowsAdding` (cabana-stream) on the client so
// the composer can disable a control instead of letting the server reject it.
// The server check is still the one that counts.

export type MediaSelectionDecision = { allowed: true } | { allowed: false; reason: string };

const allow: MediaSelectionDecision = { allowed: true };

function refuse(reason: string): MediaSelectionDecision {
  return { allowed: false, reason };
}

/**
 * Adding a video needs a genuinely empty post AND a settled session — after a
 * cancel the creator removes the finished card first, which is what returns
 * the slot (and the Image option) to `idle`.
 */
export function canSelectVideo(state: ComposerMediaState): MediaSelectionDecision {
  if (state.imageCount > 0) {
    return refuse("Remove the images first — a video has to be the only media on a post.");
  }
  if (state.session.phase === "canceled") {
    return videoOccupiesPost(state.session)
      ? refuse("Finish removing the canceled video first.")
      : refuse("Remove the canceled upload first.");
  }
  if (state.session.phase !== "idle") {
    return refuse("This post already has a video.");
  }
  return allow;
}

export function canAddImages(state: ComposerMediaState): MediaSelectionDecision {
  if (videoOccupiesPost(state.session)) {
    return refuse("Remove the video first — a post can't mix video and images.");
  }
  if (state.session.phase === "canceled") {
    return refuse("Remove the canceled upload first.");
  }
  if (state.imageCount >= MEDIA_PER_POST_MAX) {
    return refuse(`You can attach up to ${MEDIA_PER_POST_MAX} images.`);
  }
  return allow;
}

// ─────────────────────────────── Safe failure copy ──────────────────────────
// Keyed ONLY by the machine's stable codes. Nothing here interpolates a
// filename, an id, or upstream error text.

const ERROR_TITLE: Readonly<Record<UploadErrorCode, string>> = {
  network: "Connection lost",
  timeout: "The upload timed out",
  server_unavailable: "Service unavailable",
  unauthorized: "You're not signed in",
  validation_failed: "This file was rejected",
  quota_exceeded: "Upload limit reached",
  processing_failed: "This video couldn't be processed",
  unknown: "Something went wrong",
};

const ERROR_DETAIL: Readonly<Record<UploadErrorCode, string>> = {
  network: "Check your connection, then retry — the upload picks up where it left off.",
  timeout: "The connection stalled. Retry to continue from the last confirmed chunk.",
  server_unavailable: "The upload service didn't respond. Retry in a moment.",
  unauthorized: "Your session expired. Sign in again, then re-add the video.",
  validation_failed: "The video didn't meet the upload rules. Choose a different file.",
  quota_exceeded: "You've hit the upload limit. Wait for the current videos to finish, then retry.",
  processing_failed:
    "Cloudflare couldn't encode this video. Cancel it and upload a different file.",
  unknown: "The upload stopped for an unknown reason. Cancel it and try again.",
};

const CATEGORY_STAGE: Readonly<Record<UploadFailureCategory, string>> = {
  ticket: "while preparing the upload",
  upload: "while uploading",
  attach: "while attaching the video to your post",
  processing: "while the video was being processed",
  polling: "while checking the video's status",
  cleanup: "while cleaning up the video",
};

export type UploadErrorCopy = { title: string; detail: string; stage: string };

/** Stable, user-safe copy for a failure. Never carries upstream text. */
export function uploadErrorCopy(
  code: UploadErrorCode,
  category: UploadFailureCategory,
): UploadErrorCopy {
  return {
    title: ERROR_TITLE[code],
    detail: ERROR_DETAIL[code],
    stage: CATEGORY_STAGE[category],
  };
}

/** Stable copy for a local (pre-ticket) file rejection — limits come from the policy. */
export function preflightRejectionCopy(reason: UploadPreflightRejectionReason): string {
  switch (reason) {
    case "unsupported_mime_type":
      return `That file type isn't supported. Choose a ${acceptedVideoLabel()} video.`;
    case "invalid_size":
      return "That file looks empty or unreadable. Choose a different video.";
    case "too_large":
      return `That video is over the ${MAX_SIZE_LABEL} limit. Compress or trim it, then try again.`;
    case "too_long":
      return `That video is longer than ${MAX_DURATION_LABEL}. Trim it, then try again.`;
  }
}

// ─────────────────────────────── Phase presentation ─────────────────────────

export type UploadTone = "neutral" | "progress" | "success" | "warning" | "danger";

export type UploadPhaseView = {
  /** Stable hook for tests + styling; not shown to the user. */
  key:
    | "idle"
    | "ticketing"
    | "uploading"
    | "paused"
    | "attaching"
    | "processing"
    | "ready"
    | "error"
    | "canceled_settling"
    | "canceled_detach_required"
    | "canceled";
  title: string;
  detail: string;
  tone: UploadTone;
  /** True while work is genuinely in flight (drives the busy affordance). */
  busy: boolean;
};

/**
 * The single mapping from session → what the card says. `canceled` splits three
 * ways because "canceled" alone would be a lie while an asset still exists.
 */
export function describeUploadPhase(session: UploadSession): UploadPhaseView {
  switch (session.phase) {
    case "idle":
      return {
        key: "idle",
        title: "Add a video",
        detail: `${acceptedVideoLabel()} — up to ${MAX_SIZE_LABEL} and ${MAX_DURATION_LABEL}.`,
        tone: "neutral",
        busy: false,
      };
    case "ticketing":
      return {
        key: "ticketing",
        title: "Preparing the upload…",
        detail: "Reserving space for your video.",
        tone: "progress",
        busy: true,
      };
    case "uploading":
      return {
        key: "uploading",
        title: "Uploading…",
        detail: "Keep this tab open until the upload finishes.",
        tone: "progress",
        busy: true,
      };
    case "paused":
      return {
        key: "paused",
        title: "Upload paused",
        detail: "Resume to continue from where it stopped.",
        tone: "warning",
        busy: false,
      };
    case "attaching":
      return {
        key: "attaching",
        title: "Attaching to your post…",
        detail: "The upload finished. Linking the video to this post.",
        tone: "progress",
        busy: true,
      };
    case "processing":
      return {
        key: "processing",
        title: "Processing…",
        detail: "Cloudflare is encoding your video. You can save a draft and come back.",
        tone: "progress",
        busy: true,
      };
    case "ready":
      return {
        key: "ready",
        title: "Video ready",
        detail: "This post can be published.",
        tone: "success",
        busy: false,
      };
    case "error": {
      const copy = uploadErrorCopy(session.code, session.category);
      return {
        key: "error",
        title: copy.title,
        detail: `${copy.detail} (Failed ${copy.stage}.)`,
        tone: session.recoverable ? "warning" : "danger",
        busy: false,
      };
    }
    case "canceled": {
      if (session.detachRequired) {
        return {
          key: "canceled_detach_required",
          title: "Video still attached",
          detail:
            "The upload was canceled after the video attached to this post, so it can't be removed automatically. Delete the draft post to discard it.",
          tone: "danger",
          busy: false,
        };
      }
      if (session.cleanupRequired) {
        return {
          key: "canceled_settling",
          title: "Canceling…",
          detail: "Removing the partially uploaded video. This finishes on its own.",
          tone: "warning",
          busy: true,
        };
      }
      return {
        key: "canceled",
        title: "Upload canceled",
        detail: "Nothing was kept. Remove this card to choose another file.",
        tone: "neutral",
        busy: false,
      };
    }
  }
}

// ─────────────────────────────── Controls ───────────────────────────────────

export type VideoControls = {
  canChooseFile: boolean;
  canPause: boolean;
  canResume: boolean;
  canRetry: boolean;
  canCancel: boolean;
  /** Discard the session from the UI — ONLY when nothing is left attached. */
  canRemove: boolean;
  /** Remove via the server: detach post_media + reclaim the Cloudflare asset. */
  canDetach: boolean;
};

/**
 * Which controls are live.
 *
 * `canRemove` covers the two ways a session ends up with nothing left to settle
 * (a debt-free cancel) — a pure client-side discard. It does NOT cover a video
 * that is still attached or still owes a Cloudflare asset: "removing" those by
 * forgetting the session would desync the UI from the database and then let the
 * creator add images the server would reject.
 *
 * Those cases are `canDetach` instead (5A.4): a real server round-trip that
 * drops the post_media row and reclaims the asset before the session clears. The
 * two are separate flags rather than one because they have different costs and
 * different failure modes — one cannot fail, the other can.
 *
 * From `error` the exit is still cancel → cleanup → remove: the machine refuses
 * reset from `error` so a session can never silently forget a remote asset.
 */
export function resolveVideoControls(session: UploadSession): VideoControls {
  const canceledWithDebt =
    session.phase === "canceled" && (session.cleanupRequired || session.detachRequired);
  return {
    canChooseFile: session.phase === "idle",
    canPause: session.phase === "uploading",
    canResume: session.phase === "paused",
    canRetry: canRetryUploadSession(session),
    canCancel:
      session.phase === "ticketing" ||
      session.phase === "uploading" ||
      session.phase === "paused" ||
      session.phase === "attaching" ||
      session.phase === "processing" ||
      session.phase === "error",
    canRemove: session.phase === "canceled" && !canceledWithDebt,
    canDetach:
      session.phase === "ready" || (session.phase === "canceled" && session.detachRequired),
  };
}

/**
 * Why a ready video can't simply be discarded client-side.
 *
 * Kept as an explanation, not a blocker: the control is live via `canDetach`,
 * and this is the copy that tells the creator removing it also deletes the
 * uploaded video — a destructive act they should not discover afterwards.
 */
export function readyRemovalBlockedReason(session: UploadSession): string | null {
  return session.phase === "ready"
    ? "Removing this video also deletes the uploaded file. You’ll need to upload it again."
    : null;
}

// ─────────────────────────────── Cleanup debt ───────────────────────────────

export type CleanupDebtView = {
  outstanding: boolean;
  /** True when a post_media row must be detached before any remote delete. */
  detachRequired: boolean;
  steps: readonly StreamCleanupStep[];
  /** Present only when there is nothing safe the creator can do from here. */
  blockedReason: string | null;
};

/**
 * What the session still owes. When a detach is required there is NO safe
 * automatic action — `deleteStreamVideo` rejects attached videos by design —
 * so this reports the debt and names the (missing) flow rather than pretending.
 */
export function describeCleanupDebt(session: UploadSession): CleanupDebtView {
  const steps = requiredCleanupSteps(session);
  const detachRequired = session.phase === "canceled" && session.detachRequired;
  return {
    outstanding: steps.length > 0,
    detachRequired,
    steps,
    blockedReason: detachRequired
      ? "This video is attached to the draft post. Detaching media isn't available yet — delete the draft post to discard it."
      : null,
  };
}

// ─────────────────────────────── Progress ───────────────────────────────────

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

/** Human byte size for progress copy. Decimal units, one decimal above KB. */
export function formatUploadBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

export type UploadProgressView = {
  /** null ⇒ indeterminate (no meaningful percentage for this phase). */
  percent: number | null;
  /** Screen-reader + visible text. Never invents a percentage. */
  label: string;
};

/**
 * Progress semantics. Only `uploading`/`paused` carry real byte counts; every
 * other in-flight phase is honestly indeterminate rather than a fake 100%.
 */
export function describeUploadProgress(session: UploadSession): UploadProgressView {
  if (session.phase === "uploading" || session.phase === "paused") {
    const sent = formatUploadBytes(session.bytesSent);
    const total = formatUploadBytes(session.totalBytes);
    return {
      percent: session.progressPercent,
      label: `${sent} of ${total} · ${session.progressPercent}%`,
    };
  }
  if (session.phase === "ticketing") {
    return { percent: null, label: `Preparing ${formatUploadBytes(session.totalBytes)}…` };
  }
  if (session.phase === "attaching")
    return { percent: null, label: "Upload complete · attaching…" };
  if (session.phase === "processing") return { percent: null, label: "Processing…" };
  if (session.phase === "ready") return { percent: 100, label: "Upload complete" };
  return { percent: null, label: "" };
}

/** The file name the card should show, when the phase carries one. */
export function uploadFileName(session: UploadSession): string | null {
  if (
    session.phase === "ticketing" ||
    session.phase === "uploading" ||
    session.phase === "paused"
  ) {
    return session.fileName;
  }
  if (
    session.phase === "error" &&
    session.resume.phase !== "attaching" &&
    session.resume.phase !== "processing"
  ) {
    return session.resume.fileName;
  }
  return null;
}

// ─────────────────────────────── Publish / draft gates ──────────────────────

export type ComposerGateInput = {
  captionLength: number;
  imageCount: number;
  session: UploadSession;
  /** Purchase-visibility price is present and > 0 (or visibility isn't purchase). */
  priceValid: boolean;
  /** Subscribers-only post with no active tier — publish blocked, draft allowed. */
  subscribersUnsellable: boolean;
  /** A create/update/publish mutation is already in flight. */
  busy: boolean;
};

export type ComposerGate = { allowed: true } | { allowed: false; reason: string };

const PASS: ComposerGate = { allowed: true };

function block(reason: string): ComposerGate {
  return { allowed: false, reason };
}

/** Any content at all — a video in flight counts, an empty composer doesn't. */
export function composerHasContent(input: {
  captionLength: number;
  imageCount: number;
  session: UploadSession;
}): boolean {
  return input.captionLength > 0 || input.imageCount > 0 || input.session.phase !== "idle";
}

/**
 * Draft saving stays available through the whole upload — that is the point of
 * the draft: the post row already exists, and the creator must be able to keep
 * their caption while Cloudflare works. It is blocked only by the same
 * validation the create/update call itself would reject.
 */
export function evaluateComposerDraft(input: ComposerGateInput): ComposerGate {
  if (input.busy) return block("Saving…");
  if (!composerHasContent(input)) return block("Add a caption, an image, or a video first.");
  if (!input.priceValid) return block("Set an unlock price above $0.00.");
  return PASS;
}

/**
 * Publishing additionally requires the video to be READY. Every non-terminal
 * phase, every failure, and every unsettled cancel blocks it with a reason the
 * creator can act on.
 *
 * NOTE (5A.4): this is a UI gate only. `publishPost` does not yet enforce media
 * readiness server-side — see `evaluatePublishableMedia` in cabana-stream, which
 * is written but not wired into the publish action.
 */
export function evaluateComposerPublish(input: ComposerGateInput): ComposerGate {
  if (input.busy) return block("Publishing…");
  if (!composerHasContent(input)) return block("Add a caption, an image, or a video first.");
  if (!input.priceValid) return block("Set an unlock price above $0.00.");

  const { session } = input;
  switch (session.phase) {
    case "idle":
      break;
    case "ticketing":
      return block("Wait for the video upload to start.");
    case "uploading":
      return block("Wait for the video to finish uploading.");
    case "paused":
      return block("Resume the video upload before publishing.");
    case "attaching":
      return block("Wait for the video to finish attaching.");
    case "processing":
      return block("Your video is still processing. You can save a draft in the meantime.");
    case "error":
      return block("Resolve the video upload error before publishing.");
    case "canceled": {
      if (session.detachRequired) {
        return block("The canceled video is still attached to this post.");
      }
      if (session.cleanupRequired) {
        return block("Wait for the canceled video to finish being removed.");
      }
      return block("Remove the canceled upload before publishing.");
    }
    case "ready":
      break;
  }

  if (input.subscribersUnsellable) {
    return block("Create a subscription tier before publishing a subscribers-only post.");
  }
  return PASS;
}

// ─────────────────────────────── Unload guard ───────────────────────────────

/**
 * Whether leaving the page right now would strand something. True while bytes
 * or debt are outstanding — an in-flight transfer (which dies with the tab) or
 * an un-reclaimed Cloudflare asset.
 *
 * `processing` is deliberately NOT a warning: encoding happens server-side and
 * the lifecycle webhook records the result whether or not the tab is open.
 * `ready`, a settled cancel, and an idle session strand nothing.
 */
export function shouldWarnBeforeUnload(session: UploadSession): boolean {
  switch (session.phase) {
    case "ticketing":
    case "uploading":
    case "paused":
    case "attaching":
      return true;
    case "canceled":
      return session.cleanupRequired || session.detachRequired;
    case "idle":
    case "processing":
    case "ready":
    case "error":
      return false;
  }
}

/** The minimal `window` surface the guard needs — injected, so this stays pure. */
export type UnloadGuardTarget = {
  addEventListener: (type: "beforeunload", listener: (event: BeforeUnloadLike) => void) => void;
  removeEventListener: (type: "beforeunload", listener: (event: BeforeUnloadLike) => void) => void;
};

/** The bits of `BeforeUnloadEvent` a guard actually touches. */
export type BeforeUnloadLike = {
  preventDefault: () => void;
  returnValue?: unknown;
};

/**
 * Registers a `beforeunload` guard that prompts only while `shouldWarn()` says
 * something is at risk, and returns the unregister fn. The predicate is read at
 * EVENT time, not at bind time, so a single registration tracks the live
 * session — and the returned disposer always removes the exact listener.
 */
export function bindBeforeUnloadGuard(
  target: UnloadGuardTarget,
  shouldWarn: () => boolean,
): () => void {
  const listener = (event: BeforeUnloadLike): void => {
    if (!shouldWarn()) return;
    // Both forms are required for cross-browser prompting.
    event.preventDefault();
    event.returnValue = "";
  };
  target.addEventListener("beforeunload", listener);
  return () => target.removeEventListener("beforeunload", listener);
}
