// ============================================================================
// CABANA — creator video upload orchestration (Checkpoint 5A.2)
// ----------------------------------------------------------------------------
// Wires the PURE 5A.1 upload-session state machine (`cabana-stream-upload.ts`,
// the single source of truth for every transition) to its real I/O: the
// Checkpoint 3 server actions and the tus transport adapter
// (`stream-tus-client.ts`). Two layers live here:
//
//   * `createStreamUploadController` — a framework-free orchestrator with ALL
//     dependencies injected (server actions, transport factory, error
//     classifier, chunk hints, poll interval), so the entire begin → ticket →
//     upload → attach → poll lifecycle — including cancel races, retry caps,
//     the polling budget, and cleanup debt — is unit-tested with fakes and
//     fake timers, no React, no network, no Cloudflare.
//   * `useStreamUpload` — the thin React hook: one controller per mount,
//     `useSyncExternalStore` for the snapshot, dispose-on-unmount. No JSX,
//     no UI; 5A.3 builds the composer surface on top of this API.
//
// Honesty rules carried over from the machine: async callbacks that lose a
// race (a progress tick after pause, an error after cancel, a poll after
// ready) are DROPPED by the machine's transition gate, never forced; cleanup
// debt is only cleared when `deleteStreamVideo` actually succeeds; an
// attached video is NEVER deleted here (post_media must be detached first —
// the session exposes `detachRequired` instead of pretending). The lifecycle
// webhook remains the primary status driver; polling is a bounded fallback.
// ============================================================================
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { StreamVideoStatus } from "@/lib/cabana-stream";
import {
  type ChunkSelectionHints,
  type UploadErrorCode,
  type UploadPreflightRejectionReason,
  type UploadSession,
  type UploadSessionEvent,
  UPLOAD_RETRY_LIMITS,
  canRetryUploadSession,
  computeUploadRetryDelayMs,
  createIdleUploadSession,
  preflightUploadFile,
  selectTusChunkSize,
  transitionUploadSession,
} from "@/lib/cabana-stream-upload";
import {
  attachStreamVideoToPost,
  createStreamUploadTicket,
  deleteStreamVideo,
  getStreamVideoStatus,
} from "@/lib/stream-actions";
import {
  type StreamUploadTransport,
  type StreamUploadTransportFactory,
  createTusStreamTransport,
} from "@/lib/stream-tus-client";

// ─────────────────────────────── Dependencies ───────────────────────────────

/** How often the polling fallback checks while a video is processing. */
export const DEFAULT_STREAM_POLL_INTERVAL_MS = 5_000;

/** What the controller needs from a selected file — `File` satisfies it. */
export type StreamUploadFile = Blob & { readonly name: string };

export type StreamUploadTicketLike = {
  streamVideoId: string;
  uploadUrl: string;
  recommendedChunkSizeBytes: number;
};

/** The injected server-action seam; production wires the real Checkpoint 3 fns. */
export type StreamUploadServerActions = {
  createTicket: (input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    durationHintSeconds: number | null;
    postId: string;
  }) => Promise<StreamUploadTicketLike>;
  attachVideo: (input: { postId: string; streamVideoId: string }) => Promise<unknown>;
  getVideoStatus: (input: { streamVideoId: string }) => Promise<{ status: StreamVideoStatus }>;
  deleteVideo: (input: { streamVideoId: string }) => Promise<unknown>;
};

export type StreamUploadControllerDeps = {
  actions: StreamUploadServerActions;
  createTransport: StreamUploadTransportFactory;
  /** Maps a thrown server-action error to the machine's taxonomy. */
  classifyActionError?: (error: unknown) => UploadErrorCode;
  /** Network/device hints for chunk selection (totalBytes is added per file). */
  chunkHints?: () => ChunkSelectionHints;
  pollIntervalMs?: number;
};

/**
 * Server-action failures fail CLOSED: a TanStack server-fn rejection does not
 * reliably distinguish a transport failure from a server-side denial, so only
 * the browser's fetch-level `TypeError` is treated as retryable network
 * trouble — everything else is `unknown` (non-retryable; the user cancels and
 * starts over rather than hammering a denial).
 */
export function defaultClassifyActionError(error: unknown): UploadErrorCode {
  return error instanceof TypeError ? "network" : "unknown";
}

/** Connection hints, read defensively — every field is optional per spec. */
export function readNavigatorChunkHints(): ChunkSelectionHints {
  if (typeof navigator === "undefined") return {};
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
    deviceMemory?: number;
  };
  return {
    effectiveConnectionType: nav.connection?.effectiveType ?? null,
    saveData: nav.connection?.saveData ?? null,
    deviceMemoryGb: nav.deviceMemory ?? null,
  };
}

/** Production wiring for the Checkpoint 3 server actions. */
export function createServerStreamUploadActions(): StreamUploadServerActions {
  return {
    createTicket: (input) => createStreamUploadTicket({ data: input }),
    attachVideo: (input) => attachStreamVideoToPost({ data: input }),
    getVideoStatus: (input) => getStreamVideoStatus({ data: input }),
    deleteVideo: (input) => deleteStreamVideo({ data: input }),
  };
}

// ─────────────────────────────── Snapshot shape ─────────────────────────────

export type StreamUploadFlags = {
  /** Bytes are still in flight toward an attached video. */
  isUploading: boolean;
  canPause: boolean;
  canResume: boolean;
  canRetry: boolean;
  /** A Cloudflare asset (and its row) still needs deletion — never hidden. */
  cleanupRequired: boolean;
  /** post_media may reference the video; it must be detached before delete. */
  detachRequired: boolean;
};

/** Pure derivation of the UI-facing capability flags from the session. */
export function deriveUploadFlags(session: UploadSession): StreamUploadFlags {
  return {
    isUploading:
      session.phase === "ticketing" ||
      session.phase === "uploading" ||
      session.phase === "attaching",
    canPause: session.phase === "uploading",
    canResume: session.phase === "paused",
    canRetry: canRetryUploadSession(session),
    cleanupRequired: session.phase === "canceled" && session.cleanupRequired,
    detachRequired: session.phase === "canceled" && session.detachRequired,
  };
}

export type StreamUploadPreflightRejection = {
  reason: UploadPreflightRejectionReason;
  message: string;
};

export type StreamUploadSnapshot = StreamUploadFlags & {
  session: UploadSession;
  /** The last local file rejection (bad type/size), cleared on begin/reset. */
  preflightRejection: StreamUploadPreflightRejection | null;
};

export type BeginUploadResult =
  | { ok: true }
  | { ok: false; reason: UploadPreflightRejectionReason | "not_idle"; message: string };

export type StreamUploadController = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StreamUploadSnapshot;
  beginUpload: (file: StreamUploadFile, postId: string) => BeginUploadResult;
  pause: () => boolean;
  resume: () => boolean;
  retry: () => boolean;
  cancel: () => boolean;
  reset: () => boolean;
  /** Re-arms a disposed controller (React StrictMode's mount→unmount→mount). */
  activate: () => void;
  /** Aborts the transport, stops timers, and silences every late callback. */
  dispose: () => void;
};

// ─────────────────────────────── Controller ─────────────────────────────────

type FilePlan = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationHintSeconds: number | null;
};

export function createStreamUploadController(
  deps: StreamUploadControllerDeps,
): StreamUploadController {
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_STREAM_POLL_INTERVAL_MS;
  const classify = deps.classifyActionError ?? defaultClassifyActionError;
  const readHints = deps.chunkHints ?? readNavigatorChunkHints;

  let session: UploadSession = createIdleUploadSession();
  let preflightRejection: StreamUploadPreflightRejection | null = null;
  const listeners = new Set<() => void>();

  let disposed = false;
  /** Bumped by reset/dispose; async callbacks from an older run are dropped. */
  let runId = 0;
  let file: StreamUploadFile | null = null;
  let filePlan: FilePlan | null = null;
  let postId: string | null = null;
  let uploadUrl: string | null = null;
  let transport: StreamUploadTransport | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInFlight = false;
  let pollFailures = 0;
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  let cleanupAttempts = 0;

  let snapshot: StreamUploadSnapshot = buildSnapshot();

  function buildSnapshot(): StreamUploadSnapshot {
    return { session, preflightRejection, ...deriveUploadFlags(session) };
  }

  /** Un-narrowed re-read of `session` after a dispatch reassigned it. */
  function currentSession(): UploadSession {
    return session;
  }

  function notify(): void {
    if (disposed) return;
    snapshot = buildSnapshot();
    for (const listener of [...listeners]) listener();
  }

  /**
   * Apply an event through the state machine. Denials (stale progress after
   * pause, an error after cancel, a poll echo after ready, …) return false
   * and change nothing — the machine, not the caller, owns validity.
   */
  function dispatch(event: UploadSessionEvent): boolean {
    const result = transitionUploadSession(session, event);
    if (!result.ok) return false;
    if (result.session !== session) {
      session = result.session;
      notify();
    }
    return true;
  }

  function clearPollTimer(): void {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function clearCleanupTimer(): void {
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
  }

  // ── begin / ticket ─────────────────────────────────────────────────────────

  function beginUpload(nextFile: StreamUploadFile, targetPostId: string): BeginUploadResult {
    if (disposed || session.phase !== "idle") {
      return {
        ok: false,
        reason: "not_idle",
        message: "An upload session is already in progress. Reset it first.",
      };
    }
    const preflight = preflightUploadFile({
      fileName: nextFile.name,
      mimeType: nextFile.type,
      sizeBytes: nextFile.size,
    });
    if (!preflight.ok) {
      preflightRejection = { reason: preflight.reason, message: preflight.message };
      notify();
      return { ok: false, reason: preflight.reason, message: preflight.message };
    }
    preflightRejection = null;
    file = nextFile;
    filePlan = {
      fileName: preflight.fileName,
      mimeType: preflight.mimeType,
      sizeBytes: preflight.sizeBytes,
      durationHintSeconds: preflight.durationHintSeconds,
    };
    postId = targetPostId;
    pollFailures = 0;
    cleanupAttempts = 0;
    dispatch({
      type: "ticket_requested",
      fileName: preflight.fileName,
      totalBytes: preflight.sizeBytes,
    });
    void requestTicket(filePlan, targetPostId);
    return { ok: true };
  }

  async function requestTicket(plan: FilePlan, targetPostId: string): Promise<void> {
    const myRun = runId;
    let ticket: StreamUploadTicketLike;
    try {
      ticket = await deps.actions.createTicket({ ...plan, postId: targetPostId });
    } catch (error) {
      if (disposed || myRun !== runId) return;
      // ticket_failed is invalid on a canceled session — the machine drops it.
      dispatch({ type: "ticket_failed", code: classify(error) });
      return;
    }
    if (disposed || myRun !== runId) {
      // The session is gone (unmount, or reset after a debt-free cancel) but
      // the server minted a row + Cloudflare asset. Best-effort reclaim; the
      // server-side orphan sweep is the backstop.
      void Promise.resolve(deps.actions.deleteVideo({ streamVideoId: ticket.streamVideoId })).catch(
        () => {},
      );
      return;
    }
    uploadUrl = ticket.uploadUrl;
    // Dispatch even if cancel raced the response: on a canceled session the
    // machine flips cleanupRequired ON and records the id — never lose debt.
    dispatch({ type: "ticket_received", streamVideoId: ticket.streamVideoId });
    if (session.phase === "uploading") {
      startTransport();
    } else if (session.phase === "canceled" && session.cleanupRequired && !session.detachRequired) {
      cleanupAttempts = 0;
      scheduleCleanup(0);
    }
  }

  // ── transport ──────────────────────────────────────────────────────────────

  function startTransport(): void {
    if (file === null || uploadUrl === null) {
      dispatch({ type: "upload_failed", code: "unknown" });
      return;
    }
    const chunkSizeBytes = selectTusChunkSize({ ...readHints(), totalBytes: file.size });
    const myRun = runId;
    transport = deps.createTransport({
      file,
      uploadUrl,
      chunkSizeBytes,
      callbacks: {
        onProgress: (bytesSent) => {
          if (disposed || myRun !== runId) return;
          // Invalid ticks (stale after pause/cancel, regression, overflow)
          // are denied by the machine and dropped here.
          dispatch({ type: "upload_progress", bytesSent: Math.floor(bytesSent) });
        },
        onSuccess: () => {
          if (disposed || myRun !== runId || postId === null) return;
          if (dispatch({ type: "upload_completed", postId })) void runAttach();
        },
        onError: (error) => {
          if (disposed || myRun !== runId) return;
          dispatch({ type: "upload_failed", code: error.code });
        },
      },
    });
    transport.start();
  }

  // ── attach ─────────────────────────────────────────────────────────────────

  async function runAttach(): Promise<void> {
    if (session.phase !== "attaching" || postId === null) return;
    const myRun = runId;
    const input = { postId, streamVideoId: session.streamVideoId };
    try {
      await deps.actions.attachVideo(input);
    } catch (error) {
      if (disposed || myRun !== runId) return;
      // Dropped if cancel raced — that cancel already recorded detachRequired
      // conservatively, because the attach may have landed server-side.
      dispatch({ type: "attachment_failed", code: classify(error) });
      return;
    }
    if (disposed || myRun !== runId) return;
    if (dispatch({ type: "attachment_completed" })) schedulePoll(pollIntervalMs);
  }

  // ── status polling (fallback — the webhook is the primary driver) ─────────

  function schedulePoll(delayMs: number): void {
    if (disposed || session.phase !== "processing") return;
    clearPollTimer(); // one pending timer at most — overlap is impossible
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void pollOnce();
    }, delayMs);
  }

  async function pollOnce(): Promise<void> {
    if (disposed || pollInFlight || session.phase !== "processing") return;
    const input = { streamVideoId: session.streamVideoId };
    const myRun = runId;
    pollInFlight = true;
    let status: StreamVideoStatus;
    try {
      status = (await deps.actions.getVideoStatus(input)).status;
    } catch {
      pollInFlight = false;
      if (disposed || myRun !== runId || session.phase !== "processing") return;
      pollFailures += 1;
      // Budget exhausted → stop polling; the session stays `processing`
      // honestly and the webhook (or a remount) picks the lifecycle back up.
      if (pollFailures >= UPLOAD_RETRY_LIMITS.polling) return;
      schedulePoll(computeUploadRetryDelayMs("polling", pollFailures));
      return;
    }
    pollInFlight = false;
    if (disposed || myRun !== runId || session.phase !== "processing") return;
    pollFailures = 0;
    if (status === "ready") {
      dispatch({ type: "status_ready" }); // terminal — polling stops here
      return;
    }
    if (status === "error") {
      dispatch({ type: "status_error" }); // terminal — polling stops here
      return;
    }
    // `pending_upload` can appear from a stale compare-and-set loser; both it
    // and `processing` mean "not done yet" — keep waiting.
    dispatch({ type: "status_processing" });
    schedulePoll(pollIntervalMs);
  }

  // ── user commands ──────────────────────────────────────────────────────────

  function pause(): boolean {
    if (disposed || session.phase !== "uploading") return false;
    transport?.pause();
    return dispatch({ type: "upload_paused" });
  }

  function resume(): boolean {
    if (disposed || session.phase !== "paused") return false;
    if (!dispatch({ type: "upload_resumed" })) return false;
    // The kept transport re-starts from the server-side offset; if it is
    // somehow gone, a fresh one over the same URL resumes identically.
    if (transport !== null) transport.resume();
    else startTransport();
    return true;
  }

  function retry(): boolean {
    if (disposed || !canRetryUploadSession(session)) return false;
    if (!dispatch({ type: "retry_requested" })) return false;
    if (session.phase === "ticketing") {
      if (filePlan === null || postId === null) return false;
      void requestTicket(filePlan, postId);
    } else if (session.phase === "uploading") {
      // Offset-preserving: same transport instance where possible; a rebuilt
      // one HEADs the upload URL and continues from the recorded offset.
      if (transport !== null) transport.resume();
      else startTransport();
    } else if (session.phase === "attaching") {
      void runAttach();
    }
    return true;
  }

  function cancel(): boolean {
    if (disposed || session.phase === "ready" || session.phase === "canceled") return false;
    clearPollTimer();
    clearCleanupTimer();
    if (transport !== null) {
      transport.abort();
      transport = null;
    }
    if (!dispatch({ type: "cancel_requested" })) return false;
    const canceled = currentSession();
    if (canceled.phase === "canceled" && canceled.cleanupRequired && !canceled.detachRequired) {
      cleanupAttempts = 0;
      scheduleCleanup(0);
    }
    return true;
  }

  // ── cleanup debt (delete_remote_video only — detach is never automatic) ───

  function scheduleCleanup(delayMs: number): void {
    if (disposed) return;
    clearCleanupTimer();
    cleanupTimer = setTimeout(() => {
      cleanupTimer = null;
      void cleanupOnce();
    }, delayMs);
  }

  async function cleanupOnce(): Promise<void> {
    if (disposed || session.phase !== "canceled" || !session.cleanupRequired) return;
    // An attached video must be detached (post_media) BEFORE any delete; that
    // is an explicit app flow, never run behind the user's back from here.
    if (session.detachRequired || session.streamVideoId === null) return;
    const input = { streamVideoId: session.streamVideoId };
    const myRun = runId;
    cleanupAttempts += 1;
    try {
      await deps.actions.deleteVideo(input);
    } catch {
      if (disposed || myRun !== runId) return;
      // Debt stays visible (cleanupRequired remains true; reset stays
      // blocked). The server-side orphan sweep is the terminal backstop.
      if (cleanupAttempts >= UPLOAD_RETRY_LIMITS.cleanup) return;
      scheduleCleanup(computeUploadRetryDelayMs("cleanup", cleanupAttempts));
      return;
    }
    if (disposed || myRun !== runId) return;
    dispatch({ type: "cleanup_completed" }); // the ONLY thing that clears debt
  }

  // ── reset / lifecycle ──────────────────────────────────────────────────────

  function reset(): boolean {
    if (disposed) return false;
    const result = transitionUploadSession(session, { type: "reset" });
    if (!result.ok) return false; // cleanup_pending: debt must be paid first
    session = result.session;
    runId += 1;
    file = null;
    filePlan = null;
    postId = null;
    uploadUrl = null;
    if (transport !== null) {
      transport.abort();
      transport = null;
    }
    clearPollTimer();
    clearCleanupTimer();
    pollInFlight = false;
    pollFailures = 0;
    cleanupAttempts = 0;
    preflightRejection = null;
    notify();
    return true;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    runId += 1;
    if (transport !== null) {
      transport.abort();
      transport = null;
    }
    clearPollTimer();
    clearCleanupTimer();
    listeners.clear();
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    beginUpload,
    pause,
    resume,
    retry,
    cancel,
    reset,
    activate: () => {
      disposed = false;
    },
    dispose,
  };
}

// ─────────────────────────────── React hook ─────────────────────────────────

export type UseStreamUploadOptions = {
  /** Injection seams — production defaults are the real actions/transport. */
  actions?: StreamUploadServerActions;
  createTransport?: StreamUploadTransportFactory;
  classifyActionError?: (error: unknown) => UploadErrorCode;
  chunkHints?: () => ChunkSelectionHints;
  pollIntervalMs?: number;
};

export type StreamUploadApi = StreamUploadFlags & {
  session: UploadSession;
  preflightRejection: StreamUploadPreflightRejection | null;
  beginUpload: (file: StreamUploadFile, postId: string) => BeginUploadResult;
  pause: () => boolean;
  resume: () => boolean;
  retry: () => boolean;
  cancel: () => boolean;
  reset: () => boolean;
};

/**
 * One upload session per hook instance. UI-agnostic by design: it returns the
 * machine's session plus capability flags and commands — no JSX, no toasts,
 * no navigation. Unmount aborts the transport and stops every timer.
 */
export function useStreamUpload(options?: UseStreamUploadOptions): StreamUploadApi {
  const controllerRef = useRef<StreamUploadController | null>(null);
  controllerRef.current ??= createStreamUploadController({
    actions: options?.actions ?? createServerStreamUploadActions(),
    createTransport: options?.createTransport ?? createTusStreamTransport,
    classifyActionError: options?.classifyActionError,
    chunkHints: options?.chunkHints,
    pollIntervalMs: options?.pollIntervalMs,
  });
  const controller = controllerRef.current;

  useEffect(() => {
    // StrictMode re-arms the same controller after its probe unmount.
    controller.activate();
    return () => controller.dispose();
  }, [controller]);

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  return useMemo(
    () => ({
      session: snapshot.session,
      preflightRejection: snapshot.preflightRejection,
      isUploading: snapshot.isUploading,
      canPause: snapshot.canPause,
      canResume: snapshot.canResume,
      canRetry: snapshot.canRetry,
      cleanupRequired: snapshot.cleanupRequired,
      detachRequired: snapshot.detachRequired,
      beginUpload: controller.beginUpload,
      pause: controller.pause,
      resume: controller.resume,
      retry: controller.retry,
      cancel: controller.cancel,
      reset: controller.reset,
    }),
    [controller, snapshot],
  );
}
