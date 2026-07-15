// ============================================================================
// CABANA — Cloudflare Stream domain layer (PURE) — video Checkpoint 1
// ----------------------------------------------------------------------------
// No React, no Supabase, no fetch, no process.env, no browser/Node globals, no
// side effects. Single source of truth for the video-upload policy (MIME/size/
// duration/quota), the stream-video status machine, media-mix + publish rules,
// storage-path conventions, playback-URL construction, and STRICT parsing of
// Cloudflare Stream wire formats (video payloads, tus creation headers, token
// responses, webhook signatures). The server actions (`stream-actions.ts`,
// Checkpoint 2) and the webhook route stay thin by delegating here; anything
// requiring I/O (HMAC, fetch, clocks) is INJECTED so every rule tests without
// a network or a DB.
//
// Cloudflare wire formats below were verified against the official docs on
// 2026-07-12 (developers.cloudflare.com/stream/* + the cloudflare/api-schemas
// OpenAPI source). Wire-specific names live in the "Cloudflare wire contracts"
// sections and never leak into CABANA domain types; parse* functions are the
// boundary and REJECT malformed payloads instead of guessing.
//
// Money note: none — video carries no pricing of its own; `purchase` gating
// rides the existing Phase 6 entitlement machinery untouched.
// ============================================================================
import { MEDIA_PER_POST_MAX, type PostMediaKind } from "@/lib/cabana-posts";

// ─────────────────────────────── Environment names ──────────────────────────
// The standardized server-only variable names (documented in .env.example).
// This module never READS them — it only names them so the action layer and
// docs cannot drift. STREAM_SIGNING_KEY_ID is intentionally absent: it is
// reserved for a future local-signing upgrade and MUST NOT be read in v1.

export const STREAM_ENV_VARS = {
  accountId: "CLOUDFLARE_ACCOUNT_ID",
  apiToken: "CLOUDFLARE_STREAM_TOKEN",
  customerSubdomain: "CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN",
  webhookSecret: "CLOUDFLARE_STREAM_WEBHOOK_SECRET",
} as const;

// ─────────────────────────────── Domain types ───────────────────────────────

/** CABANA lifecycle status for a stream video (mirrors the planned DB enum). */
export type StreamVideoStatus = "pending_upload" | "processing" | "ready" | "error";

export const STREAM_VIDEO_STATUSES: readonly StreamVideoStatus[] = [
  "pending_upload",
  "processing",
  "ready",
  "error",
] as const;

/** Normalized snapshot of a Cloudflare video (domain shape, wire-free). */
export type StreamVideoSnapshot = {
  uid: string;
  status: StreamVideoStatus;
  readyToStream: boolean;
  /** Seconds; null while Cloudflare reports the -1 "unknown" sentinel. */
  durationSeconds: number | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** Encoding progress as reported (a wire STRING like "39.000000"), if any. */
  pctComplete: string | null;
};

// ─────────────────────────────── Upload policy ──────────────────────────────

/** Accepted upload MIME types (intent filter; Cloudflare validates content). */
export const STREAM_VIDEO_MIME_ALLOWLIST: readonly string[] = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/** Public-beta caps. 1 GiB; 10 minutes; 3 in flight; 20 per rolling day. */
export const STREAM_MAX_SIZE_BYTES = 1_073_741_824;
export const STREAM_MAX_DURATION_SECONDS = 600;
export const STREAM_MAX_ACTIVE_UPLOADS = 3;
export const STREAM_MAX_UPLOADS_PER_DAY = 20;

export type StreamUploadPolicy = {
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
  maxDurationSeconds: number;
  maxActiveUploads: number;
  maxUploadsPerDay: number;
};

export const DEFAULT_STREAM_UPLOAD_POLICY: StreamUploadPolicy = {
  allowedMimeTypes: STREAM_VIDEO_MIME_ALLOWLIST,
  maxSizeBytes: STREAM_MAX_SIZE_BYTES,
  maxDurationSeconds: STREAM_MAX_DURATION_SECONDS,
  maxActiveUploads: STREAM_MAX_ACTIVE_UPLOADS,
  maxUploadsPerDay: STREAM_MAX_UPLOADS_PER_DAY,
};

export type UploadDenialReason =
  | "unsupported_mime_type"
  | "invalid_size"
  | "too_large"
  | "too_long"
  | "too_many_active_uploads"
  | "daily_limit_reached";

export type UploadTicketDecision =
  | { allowed: true }
  | { allowed: false; reason: UploadDenialReason; message: string };

/**
 * Decide whether a creator may be issued an upload ticket. Counts come from
 * the caller's own RLS-scoped rows; duration is a client HINT only (Cloudflare
 * enforces the real cap at encode via `maxDurationSeconds`). Boundaries are
 * inclusive: exactly max size / max duration is allowed; the Nth concurrent
 * upload is denied once N-1 are already active.
 */
export function evaluateUploadTicketRequest(params: {
  mimeType: unknown;
  sizeBytes: unknown;
  durationHintSeconds?: unknown;
  activeUploads: number;
  uploadsLast24h: number;
  policy?: StreamUploadPolicy;
}): UploadTicketDecision {
  const policy = params.policy ?? DEFAULT_STREAM_UPLOAD_POLICY;

  const mime = typeof params.mimeType === "string" ? params.mimeType.trim().toLowerCase() : "";
  if (!mime || !policy.allowedMimeTypes.includes(mime)) {
    return {
      allowed: false,
      reason: "unsupported_mime_type",
      message: `Unsupported video type. Allowed: ${policy.allowedMimeTypes.join(", ")}.`,
    };
  }

  const size = params.sizeBytes;
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
    return {
      allowed: false,
      reason: "invalid_size",
      message: "A positive integer file size (in bytes) is required.",
    };
  }
  if (size > policy.maxSizeBytes) {
    return {
      allowed: false,
      reason: "too_large",
      message: `Video is too large (max ${policy.maxSizeBytes} bytes).`,
    };
  }

  if (params.durationHintSeconds !== undefined && params.durationHintSeconds !== null) {
    const hint = params.durationHintSeconds;
    if (typeof hint !== "number" || !Number.isFinite(hint) || hint <= 0) {
      return {
        allowed: false,
        reason: "too_long",
        message: "The video duration hint must be a positive number of seconds.",
      };
    }
    if (hint > policy.maxDurationSeconds) {
      return {
        allowed: false,
        reason: "too_long",
        message: `Video is too long (max ${policy.maxDurationSeconds} seconds).`,
      };
    }
  }

  // Usage counts come from the action layer's own queries — a non-finite value
  // there is a caller bug, and `NaN >= cap` is false, so a silent pass here
  // would quietly void both quotas. Fail CLOSED and loudly instead.
  if (!Number.isInteger(params.activeUploads) || params.activeUploads < 0) {
    throw new Error("activeUploads must be a non-negative integer.");
  }
  if (!Number.isInteger(params.uploadsLast24h) || params.uploadsLast24h < 0) {
    throw new Error("uploadsLast24h must be a non-negative integer.");
  }

  if (params.activeUploads >= policy.maxActiveUploads) {
    return {
      allowed: false,
      reason: "too_many_active_uploads",
      message: `Too many uploads in progress (max ${policy.maxActiveUploads}). Wait for one to finish.`,
    };
  }
  if (params.uploadsLast24h >= policy.maxUploadsPerDay) {
    return {
      allowed: false,
      reason: "daily_limit_reached",
      message: `Daily upload limit reached (max ${policy.maxUploadsPerDay} per 24 hours).`,
    };
  }

  return { allowed: true };
}

// ─────────────────────────────── Storage-path convention ────────────────────
// Stream rows in `post_media` carry NO Supabase object; their storage_path is
// the sentinel layout `<owner_user_id>/stream/<cloudflare_uid>`. The first
// segment deliberately satisfies the hardened post_media WITH CHECK
// (split_part(storage_path,'/',1) = auth.uid()) with ZERO policy changes.

export const STREAM_STORAGE_BUCKET = "cloudflare-stream";
export const STREAM_PATH_SEGMENT = "stream";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Docs guarantee only "a Cloudflare-generated unique identifier" (examples are
// 32-char lowercase hex, OpenAPI maxLength 32). Validate conservatively:
// alphanumeric only — which also makes the value path-safe by construction.
const STREAM_UID_PATTERN = /^[a-zA-Z0-9]{6,64}$/;

export function isValidStreamUid(uid: unknown): uid is string {
  return typeof uid === "string" && STREAM_UID_PATTERN.test(uid);
}

/** Build the sentinel storage path for a stream video. Throws on bad inputs. */
export function buildStreamStoragePath(ownerUserId: string, uid: string): string {
  if (typeof ownerUserId !== "string" || !UUID_PATTERN.test(ownerUserId)) {
    throw new Error("A valid owner user id is required for a stream storage path.");
  }
  if (!isValidStreamUid(uid)) {
    throw new Error("A valid Cloudflare video UID is required for a stream storage path.");
  }
  return `${ownerUserId.toLowerCase()}/${STREAM_PATH_SEGMENT}/${uid}`;
}

/** Parse a sentinel path back into its parts; null when it isn't one. */
export function parseStreamStoragePath(path: unknown): { ownerUserId: string; uid: string } | null {
  if (typeof path !== "string" || path.includes("..")) return null;
  const segments = path.split("/");
  if (segments.length !== 3) return null;
  const [owner, marker, uid] = segments;
  if (marker !== STREAM_PATH_SEGMENT) return null;
  if (!UUID_PATTERN.test(owner) || !isValidStreamUid(uid)) return null;
  return { ownerUserId: owner.toLowerCase(), uid };
}

/** Does this sentinel path belong to `userId`? Malformed paths never match. */
export function streamStoragePathBelongsTo(path: unknown, userId: string): boolean {
  const parsed = parseStreamStoragePath(path);
  return parsed !== null && parsed.ownerUserId === userId.toLowerCase();
}

// ───────────────── Cloudflare wire contracts: video states ──────────────────
// Documented status.state values (OpenAPI stream_media_state, verified
// 2026-07-12). `live-inprogress` exists on the wire but CABANA v1 has no live
// inputs — receiving it for one of our uploads is a contract violation, so the
// mapper rejects it rather than guessing a lifecycle for it.

export const CLOUDFLARE_VIDEO_STATES = [
  "pendingupload",
  "downloading",
  "queued",
  "inprogress",
  "ready",
  "error",
  "live-inprogress",
] as const;

export type CloudflareVideoState = (typeof CLOUDFLARE_VIDEO_STATES)[number];

const CF_STATE_TO_STATUS: Readonly<Record<string, StreamVideoStatus>> = {
  pendingupload: "pending_upload",
  downloading: "processing",
  queued: "processing",
  inprogress: "processing",
  ready: "ready",
  error: "error",
};

/** Map a Cloudflare state onto the CABANA lifecycle. Throws on anything else. */
export function cfStateToStreamStatus(state: string): StreamVideoStatus {
  // Own-property guard: a plain-object lookup would resolve prototype members
  // ("constructor", "__proto__", …) from attacker-influenced payload strings.
  if (!Object.hasOwn(CF_STATE_TO_STATUS, state)) {
    throw new Error(`Unsupported Cloudflare video state: "${state}".`);
  }
  return CF_STATE_TO_STATUS[state];
}

// ─────────────────────────────── Status machine ─────────────────────────────
// Same-state "transitions" are allowed so webhook/poll replays stay idempotent;
// `ready` and `error` are terminal and never regress.

const STREAM_STATUS_TRANSITIONS: Record<StreamVideoStatus, readonly StreamVideoStatus[]> = {
  pending_upload: ["pending_upload", "processing", "ready", "error"],
  processing: ["processing", "ready", "error"],
  ready: ["ready"],
  error: ["error"],
};

export function canTransitionStreamStatus(from: StreamVideoStatus, to: StreamVideoStatus): boolean {
  return STREAM_STATUS_TRANSITIONS[from].includes(to);
}

export function assertStreamStatusTransition(from: StreamVideoStatus, to: StreamVideoStatus): void {
  if (!canTransitionStreamStatus(from, to)) {
    throw new Error(`A ${from} stream video cannot become ${to}.`);
  }
}

export function isTerminalStreamStatus(status: StreamVideoStatus): boolean {
  return status === "ready" || status === "error";
}

// ─────────────────────────────── Media-mix rules ────────────────────────────
// v1: a post is EITHER up to MEDIA_PER_POST_MAX images OR exactly one video.

export function assertMediaMixAllowsAdding(
  existingKinds: readonly PostMediaKind[],
  incoming: PostMediaKind,
): void {
  if (incoming === "audio") {
    throw new Error("Audio media is not supported.");
  }
  if (incoming === "video") {
    if (existingKinds.length > 0) {
      throw new Error("A video must be the only media on a post.");
    }
    return;
  }
  // incoming === "image"
  if (existingKinds.some((kind) => kind !== "image")) {
    throw new Error("Images cannot be mixed with video or audio media.");
  }
  if (existingKinds.length >= MEDIA_PER_POST_MAX) {
    throw new Error(`A post can have at most ${MEDIA_PER_POST_MAX} images.`);
  }
}

// ─────────────────────────────── Publish gate ───────────────────────────────
// `post_media.processing_status` must be uniformly "ready" before a post may
// publish. An empty media list is publishable (caption-only posts are legal).

export const READY_PROCESSING_STATUS = "ready";

export type PublishableMediaDecision = {
  publishable: boolean;
  pending: number;
  failed: number;
};

export function evaluatePublishableMedia(
  processingStatuses: readonly string[],
): PublishableMediaDecision {
  let pending = 0;
  let failed = 0;
  for (const status of processingStatuses) {
    if (status === READY_PROCESSING_STATUS) continue;
    if (status === "error") failed += 1;
    else pending += 1;
  }
  return { publishable: pending === 0 && failed === 0, pending, failed };
}

export function assertPublishableMedia(processingStatuses: readonly string[]): void {
  const decision = evaluatePublishableMedia(processingStatuses);
  if (decision.publishable) return;
  if (decision.failed > 0) {
    throw new Error("This post has media that failed processing. Remove it before publishing.");
  }
  throw new Error("This post's video is still processing. Publish once it is ready.");
}

/** A `post_media` row joined to its `stream_videos` lifecycle row, if any. */
export type PublishMediaRow = {
  storageBucket: string;
  processingStatus: string;
  /** `stream_videos.status`, or null when the join found no lifecycle row. */
  streamStatus: StreamVideoStatus | null;
};

/**
 * The status the publish gate must judge a media row by.
 *
 * For a Stream row the AUTHORITY is `stream_videos.status`, never the row's own
 * `processing_status`: the lifecycle writer syncs `processing_status` on a
 * best-effort basis, so a row whose webhook landed before the media row existed
 * can sit at "processing" forever while the video is genuinely ready. Judging
 * the video by the video's own status makes that skew unpublishable-blocking
 * instead of permanent, and costs nothing when the two agree.
 *
 * A Stream-bucket row with NO lifecycle row is unpublishable by design: the
 * composite FK makes it unreachable, so seeing one means the invariant broke and
 * we must fail closed rather than guess.
 *
 * Non-Stream rows (images) keep their own `processing_status`, which the schema
 * defaults to "ready" — so image-only posts are unaffected.
 */
export function resolveMediaProcessingStatus(row: PublishMediaRow): string {
  if (row.storageBucket !== STREAM_STORAGE_BUCKET) return row.processingStatus;
  if (row.streamStatus === null) return "error";
  return processingStatusForStream(row.streamStatus);
}

/** Convenience: judge a joined media set straight from rows. */
export function assertPublishableMediaRows(rows: readonly PublishMediaRow[]): void {
  assertPublishableMedia(rows.map(resolveMediaProcessingStatus));
}

// ───────────────── Cloudflare wire contracts: playback URLs ─────────────────
// Signed playback substitutes the TOKEN for the video UID in the same URL
// templates (verified: /iframe, /manifest/video.m3u8, /manifest/video.mpd,
// /thumbnails/thumbnail.jpg — token replaces UID when requireSignedURLs).

const CUSTOMER_SUBDOMAIN_PATTERN = /^customer-[a-z0-9]+\.cloudflarestream\.com$/;
// Signed tokens are JWTs (base64url segments joined by dots). Restricting to
// this charset keeps the value path-safe (no /, ?, #, %, whitespace).
const PLAYBACK_TOKEN_PATTERN = /^[A-Za-z0-9._-]+$/;
const PLAYBACK_TOKEN_MAX_LENGTH = 8192;

export function isValidCustomerSubdomain(host: unknown): host is string {
  return typeof host === "string" && CUSTOMER_SUBDOMAIN_PATTERN.test(host);
}

export function isValidPlaybackToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length > 0 &&
    token.length <= PLAYBACK_TOKEN_MAX_LENGTH &&
    PLAYBACK_TOKEN_PATTERN.test(token) &&
    // "." and ".." pass the charset but are relative-path segments in a URL.
    token !== "." &&
    token !== ".."
  );
}

export type StreamPlaybackUrls = {
  iframe: string;
  hls: string;
  dash: string;
  thumbnail: string;
};

/**
 * Build the four playback URLs for a signed token on a customer subdomain.
 * Throws on malformed inputs so an injected value can never reach a browser.
 */
export function buildStreamPlaybackUrls(
  customerSubdomain: string,
  token: string,
  options?: { thumbnailTimeSeconds?: number; thumbnailHeight?: number },
): StreamPlaybackUrls {
  if (!isValidCustomerSubdomain(customerSubdomain)) {
    throw new Error("Invalid Cloudflare Stream customer subdomain.");
  }
  if (!isValidPlaybackToken(token)) {
    throw new Error("Invalid Stream playback token.");
  }
  const base = `https://${customerSubdomain}/${token}`;
  const thumbParams: string[] = [];
  if (options?.thumbnailTimeSeconds !== undefined) {
    const time = options.thumbnailTimeSeconds;
    if (typeof time !== "number" || !Number.isFinite(time) || time < 0) {
      throw new Error("Invalid thumbnail time.");
    }
    thumbParams.push(`time=${time}s`);
  }
  if (options?.thumbnailHeight !== undefined) {
    const height = options.thumbnailHeight;
    if (typeof height !== "number" || !Number.isInteger(height) || height <= 0) {
      throw new Error("Invalid thumbnail height.");
    }
    thumbParams.push(`height=${height}`);
  }
  const thumbQuery = thumbParams.length > 0 ? `?${thumbParams.join("&")}` : "";
  return {
    iframe: `${base}/iframe`,
    hls: `${base}/manifest/video.m3u8`,
    dash: `${base}/manifest/video.mpd`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg${thumbQuery}`,
  };
}

// ───────────────── Cloudflare wire contracts: response parsing ──────────────
// Standard v4 envelope: { result, success, errors: [{code, message}], messages }.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Unwrap the Cloudflare v4 envelope, throwing a descriptive error on failure. */
export function unwrapCloudflareEnvelope(json: unknown): unknown {
  if (!isRecord(json)) {
    throw new Error("Malformed Cloudflare response: not a JSON object.");
  }
  if (json.success !== true) {
    const errors = Array.isArray(json.errors) ? json.errors : [];
    const details = errors
      .filter(isRecord)
      .map((e) => `${typeof e.code === "number" ? e.code : "?"}: ${String(e.message ?? "")}`)
      .join("; ");
    throw new Error(`Cloudflare API error${details ? ` — ${details}` : ""}.`);
  }
  if (!("result" in json) || json.result === null || json.result === undefined) {
    throw new Error("Malformed Cloudflare response: missing result.");
  }
  return json.result;
}

/** Read an optional numeric field, mapping Cloudflare's -1 sentinel to null. */
function readSentinelNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Malformed Cloudflare video payload: ${key} is not a number.`);
  }
  return value < 0 ? null : value;
}

/** Read an optional string field, mapping empty strings to null. */
function readOptionalString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`Malformed Cloudflare video payload: ${key} is not a string.`);
  }
  return value === "" ? null : value;
}

/**
 * Strictly parse a Cloudflare video object (the webhook body, or the `result`
 * of GET /stream/{uid}) into the domain snapshot. Requires `uid` and
 * `status.state`; rejects wrong-typed fields instead of guessing. Cloudflare's
 * -1 "unknown" sentinel for duration/width/height becomes null.
 */
export function parseStreamVideoPayload(json: unknown): StreamVideoSnapshot {
  if (!isRecord(json)) {
    throw new Error("Malformed Cloudflare video payload: not a JSON object.");
  }
  if (!isValidStreamUid(json.uid)) {
    throw new Error("Malformed Cloudflare video payload: missing or invalid uid.");
  }
  if (!isRecord(json.status) || typeof json.status.state !== "string") {
    throw new Error("Malformed Cloudflare video payload: missing status.state.");
  }
  const status = cfStateToStreamStatus(json.status.state);

  const readyToStream = json.readyToStream === undefined ? false : json.readyToStream;
  if (typeof readyToStream !== "boolean") {
    throw new Error("Malformed Cloudflare video payload: readyToStream is not a boolean.");
  }

  // Like every other optional field, null is treated as absent.
  const size = json.size === null ? undefined : json.size;
  if (size !== undefined && (typeof size !== "number" || !Number.isFinite(size) || size < 0)) {
    throw new Error("Malformed Cloudflare video payload: size is not a non-negative number.");
  }

  let width: number | null = null;
  let height: number | null = null;
  if (json.input !== undefined && json.input !== null) {
    if (!isRecord(json.input)) {
      throw new Error("Malformed Cloudflare video payload: input is not an object.");
    }
    width = readSentinelNumber(json.input, "width");
    height = readSentinelNumber(json.input, "height");
  }

  return {
    uid: json.uid,
    status,
    readyToStream,
    durationSeconds: readSentinelNumber(json, "duration"),
    sizeBytes: size === undefined ? null : (size as number),
    width,
    height,
    errorCode: readOptionalString(json.status, "errorReasonCode"),
    errorMessage: readOptionalString(json.status, "errorReasonText"),
    pctComplete: readOptionalString(json.status, "pctComplete"),
  };
}

/** Parse the /token endpoint response (envelope + result.token). */
export function parseStreamTokenResponse(json: unknown): string {
  const result = unwrapCloudflareEnvelope(json);
  if (!isRecord(result) || typeof result.token !== "string" || result.token === "") {
    throw new Error("Malformed Cloudflare token response: missing token.");
  }
  if (!isValidPlaybackToken(result.token)) {
    throw new Error("Malformed Cloudflare token response: token has an unexpected format.");
  }
  return result.token;
}

/**
 * Validate the two headers of a tus direct-upload creation response: the
 * one-time upload URL arrives in `Location`, the video UID in
 * `stream-media-id` — never parsed out of the URL.
 */
export function parseTusCreationHeaders(headers: {
  location: string | null | undefined;
  mediaId: string | null | undefined;
}): { uploadUrl: string; uid: string } {
  const { location, mediaId } = headers;
  if (typeof location !== "string" || !/^https:\/\/\S+$/.test(location)) {
    throw new Error("Malformed tus creation response: missing Location upload URL.");
  }
  if (!isValidStreamUid(mediaId)) {
    throw new Error("Malformed tus creation response: missing stream-media-id.");
  }
  return { uploadUrl: location, uid: mediaId };
}

// ───────────────── Cloudflare wire contracts: webhook signatures ────────────
// Header: `Webhook-Signature: time=<unix>,sig1=<hex>`; the signed source is
// `<time>.<raw body>`; HMAC-SHA256, hex output. Cloudflare documents no
// numeric freshness window ("discard requests with timestamps that are too
// old for your application") — 300 s is CABANA's choice.

export const WEBHOOK_SIGNATURE_HEADER = "Webhook-Signature";
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

const HEX_SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

export type ParsedWebhookSignature = {
  /** The header's LITERAL time string — the exact bytes Cloudflare signed. */
  timeRaw: string;
  timeSeconds: number;
  signatures: readonly string[];
};

// Canonical unix seconds: no leading zeros, 1..12 digits (safe integer range,
// good until year ~33658). Anything else round-trips differently through
// Number() than the literal the sender signed, so it is rejected outright.
const WEBHOOK_TIME_PATTERN = /^[1-9]\d{0,11}$/;

/** Parse the signature header. Throws on any malformation. */
export function parseWebhookSignatureHeader(header: unknown): ParsedWebhookSignature {
  if (typeof header !== "string" || header.trim() === "") {
    throw new Error("Missing webhook signature header.");
  }
  let timeRaw: string | null = null;
  const signatures: string[] = [];
  for (const rawPart of header.split(",")) {
    const part = rawPart.trim();
    const eq = part.indexOf("=");
    if (eq <= 0) throw new Error("Malformed webhook signature header.");
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === "time") {
      if (!WEBHOOK_TIME_PATTERN.test(value)) {
        throw new Error("Malformed webhook signature timestamp.");
      }
      timeRaw = value;
    } else if (/^sig\d+$/.test(key)) {
      const normalized = value.toLowerCase();
      if (!HEX_SIGNATURE_PATTERN.test(normalized)) {
        throw new Error("Malformed webhook signature value.");
      }
      signatures.push(normalized);
    } else {
      throw new Error("Malformed webhook signature header.");
    }
  }
  if (timeRaw === null || signatures.length === 0) {
    throw new Error("Malformed webhook signature header.");
  }
  return { timeRaw, timeSeconds: Number(timeRaw), signatures };
}

/** The exact string Cloudflare signs: `<time>` + "." + `<raw body>`. */
export function buildWebhookSigningInput(time: number | string, rawBody: string): string {
  return `${time}.${rawBody}`;
}

/** Inclusive freshness check, symmetric to absorb clock skew both ways. */
export function isWebhookTimestampFresh(
  timeSeconds: number,
  nowMs: number,
  toleranceSeconds: number = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
): boolean {
  return Math.abs(nowMs / 1000 - timeSeconds) <= toleranceSeconds;
}

/** Constant-time hex comparison (no early exit on the first differing byte). */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type WebhookVerification =
  | { valid: true }
  | { valid: false; reason: "malformed_header" | "stale_timestamp" | "signature_mismatch" };

/**
 * Verify a Stream webhook request. The HMAC primitive is injected (already
 * bound to the webhook secret by the caller) so this stays pure and testable;
 * the route wires `node:crypto`'s HMAC-SHA256 (hex digest) in.
 */
export function verifyStreamWebhook(params: {
  signatureHeader: unknown;
  rawBody: string;
  nowMs: number;
  toleranceSeconds?: number;
  hmacSha256Hex: (input: string) => string;
}): WebhookVerification {
  let parsed: ParsedWebhookSignature;
  try {
    parsed = parseWebhookSignatureHeader(params.signatureHeader);
  } catch {
    return { valid: false, reason: "malformed_header" };
  }
  if (!isWebhookTimestampFresh(parsed.timeSeconds, params.nowMs, params.toleranceSeconds)) {
    return { valid: false, reason: "stale_timestamp" };
  }
  // Sign the header's LITERAL time string, never a re-stringified number.
  const expected = params
    .hmacSha256Hex(buildWebhookSigningInput(parsed.timeRaw, params.rawBody))
    .toLowerCase();
  // Check every provided signature; constant-time per comparison.
  let anyMatch = false;
  for (const signature of parsed.signatures) {
    if (constantTimeEqualHex(expected, signature)) anyMatch = true;
  }
  return anyMatch ? { valid: true } : { valid: false, reason: "signature_mismatch" };
}

// ───────────────── Cloudflare wire contracts: tus Upload-Metadata ───────────
// Key-value pairs: key<space>base64(value), joined by commas (no spaces);
// boolean flags are bare keys. Verified doc example:
//   maxDurationSeconds NjAw,requiresignedurls,expiry MjAyNC0wMi0yN1QwNzoyMDo1MFo=
// Key casing follows the direct-creator-uploads page (`maxDurationSeconds`
// camelCase for the ?direct_user=true creation call); origins are comma-joined
// inside the pre-base64 value (OpenAPI example: "example.com,test.com").

export const TUS_MIN_CHUNK_BYTES = 5_242_880;
export const TUS_RECOMMENDED_CHUNK_BYTES = 52_428_800;
export const TUS_MAX_CHUNK_BYTES = 209_715_200;
export const TUS_CHUNK_MULTIPLE_BYTES = 262_144;

/** Chunk sizes must be 256 KiB multiples within [min, max] (final chunk exempt). */
export function isValidTusChunkSize(bytes: number): boolean {
  return (
    Number.isInteger(bytes) &&
    bytes >= TUS_MIN_CHUNK_BYTES &&
    bytes <= TUS_MAX_CHUNK_BYTES &&
    bytes % TUS_CHUNK_MULTIPLE_BYTES === 0
  );
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Pure UTF-8 → base64 encoder (standard alphabet, padded). Implemented locally
 * so the module needs neither `Buffer` (Node) nor `btoa` (browser).
 */
export function encodeBase64(text: string): string {
  // UTF-8 encode.
  const bytes: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0) as number;
    // An unpaired surrogate (e.g. from slicing a string mid-emoji) would
    // otherwise encode as invalid UTF-8; substitute U+FFFD like TextEncoder.
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  // Base64 encode.
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export type TusUploadConstraints = {
  /** Required by Cloudflare for direct creator uploads (1..36000 s). */
  maxDurationSeconds: number;
  /** CABANA always signs; kept explicit so the builder cannot silently drift. */
  requireSignedUrls: boolean;
  /** RFC3339 deadline after which the one-time upload URL stops accepting. */
  expiry?: string;
  allowedOrigins?: readonly string[];
  name?: string;
};

/** Build the Upload-Metadata header value for the direct_user creation call. */
export function buildTusUploadMetadata(constraints: TusUploadConstraints): string {
  const duration = constraints.maxDurationSeconds;
  if (!Number.isInteger(duration) || duration < 1 || duration > 36000) {
    throw new Error("maxDurationSeconds must be an integer between 1 and 36000.");
  }
  const pairs: string[] = [`maxDurationSeconds ${encodeBase64(String(duration))}`];

  if (constraints.requireSignedUrls) {
    pairs.push("requiresignedurls");
  }
  if (constraints.expiry !== undefined) {
    if (!RFC3339_PATTERN.test(constraints.expiry)) {
      throw new Error("expiry must be an RFC3339 timestamp (e.g. 2026-07-12T07:20:50Z).");
    }
    pairs.push(`expiry ${encodeBase64(constraints.expiry)}`);
  }
  if (constraints.allowedOrigins !== undefined && constraints.allowedOrigins.length > 0) {
    for (const origin of constraints.allowedOrigins) {
      if (typeof origin !== "string" || origin === "" || /[,\s]/.test(origin)) {
        throw new Error("allowedOrigins entries must be non-empty and comma/space-free.");
      }
    }
    pairs.push(`allowedorigins ${encodeBase64(constraints.allowedOrigins.join(","))}`);
  }
  if (constraints.name !== undefined) {
    if (constraints.name === "" || constraints.name.length > 1024) {
      throw new Error("name must be 1–1024 characters.");
    }
    pairs.push(`name ${encodeBase64(constraints.name)}`);
  }
  return pairs.join(",");
}

// ─────────────────────────────── Orphan selection ───────────────────────────
// Which stream_videos rows are safe to sweep (delete from Cloudflare + DB)?
// Conservative by construction: unparseable timestamps are never candidates,
// and ready+attached rows are untouchable.

export type OrphanCandidateRow = {
  id: string;
  status: StreamVideoStatus;
  createdAt: string;
  uploadExpiresAt: string | null;
  attached: boolean;
};

export type OrphanReason =
  | "upload_expired"
  | "stale_pending"
  | "failed"
  | "never_attached"
  | "stuck_processing";

export type OrphanGracePeriods = {
  pendingMs: number;
  errorMs: number;
  readyUnattachedMs: number;
  processingStuckMs: number;
};

export const DEFAULT_ORPHAN_GRACE: OrphanGracePeriods = {
  pendingMs: 24 * 60 * 60 * 1000,
  errorMs: 24 * 60 * 60 * 1000,
  readyUnattachedMs: 24 * 60 * 60 * 1000,
  processingStuckMs: 7 * 24 * 60 * 60 * 1000,
};

export function selectOrphanCandidates(
  rows: readonly OrphanCandidateRow[],
  nowMs: number,
  grace: OrphanGracePeriods = DEFAULT_ORPHAN_GRACE,
): { row: OrphanCandidateRow; reason: OrphanReason }[] {
  const candidates: { row: OrphanCandidateRow; reason: OrphanReason }[] = [];
  for (const row of rows) {
    // An attached row is not an orphan BY DEFINITION, whatever its status —
    // removing attached media (even failed media) is a user action
    // (deletePostMedia / deletePost), never a background sweep.
    if (row.attached) continue;
    const createdMs = Date.parse(row.createdAt);
    if (Number.isNaN(createdMs)) continue;
    const age = nowMs - createdMs;

    if (row.status === "pending_upload") {
      if (row.uploadExpiresAt !== null) {
        const expiresMs = Date.parse(row.uploadExpiresAt);
        if (!Number.isNaN(expiresMs) && nowMs > expiresMs) {
          candidates.push({ row, reason: "upload_expired" });
        }
      } else if (age > grace.pendingMs) {
        candidates.push({ row, reason: "stale_pending" });
      }
    } else if (row.status === "error") {
      if (age > grace.errorMs) candidates.push({ row, reason: "failed" });
    } else if (row.status === "ready") {
      if (age > grace.readyUnattachedMs) {
        candidates.push({ row, reason: "never_attached" });
      }
    } else if (row.status === "processing") {
      if (age > grace.processingStuckMs) candidates.push({ row, reason: "stuck_processing" });
    }
  }
  return candidates;
}

// ───────────────── Server-action orchestration (pure, injected I/O) ─────────
// Checkpoint 3 additions: the decision/orchestration logic behind
// `stream-actions.ts`, kept here (with all I/O injected) so every rule tests
// without a network or a DB — the same model as `resolveBatchPostMedia`.

export const STREAM_PLAYBACK_TOKEN_TTL_SECONDS = 3600;
export const STREAM_UPLOAD_TICKET_TTL_MINUTES = 60;
export const STREAM_PLAYBACK_BATCH_MAX = 50;
export const STREAM_TOKEN_CONCURRENCY = 5;

/** post_media.processing_status value for a stream video in `status`. */
export function processingStatusForStream(status: StreamVideoStatus): string {
  if (status === "ready") return "ready";
  if (status === "error") return "error";
  return "processing";
}

export type StreamStatusRefresh =
  | { apply: false; status: StreamVideoStatus }
  | { apply: true; status: StreamVideoStatus; snapshot: StreamVideoSnapshot };

/**
 * Decide what a fresh Cloudflare snapshot does to a stored row. Terminal
 * stored states never change (ready/error cannot regress — a replayed or
 * out-of-order poll is a no-op), and a snapshot that would be an illegal
 * transition is ignored rather than guessed at.
 */
export function resolveStatusRefresh(
  current: StreamVideoStatus,
  snapshot: StreamVideoSnapshot,
): StreamStatusRefresh {
  if (isTerminalStreamStatus(current)) return { apply: false, status: current };
  if (!canTransitionStreamStatus(current, snapshot.status)) {
    return { apply: false, status: current };
  }
  return { apply: true, status: snapshot.status, snapshot };
}

/** Validate + lowercase + dedupe a playback batch, capped at `max`. Throws. */
export function normalizeStreamPostIdBatch(
  raw: unknown,
  max: number = STREAM_PLAYBACK_BATCH_MAX,
): string[] {
  if (!Array.isArray(raw)) throw new Error("A list of post ids is required.");
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !UUID_PATTERN.test(item)) {
      throw new Error("A valid post id is required.");
    }
    seen.add(item.toLowerCase());
  }
  const ids = [...seen];
  if (ids.length > max) throw new Error(`Too many post ids (max ${max}).`);
  return ids;
}

/** Order-preserving async map with at most `limit` tasks in flight. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const bound = Math.max(1, Math.trunc(limit));
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(bound, items.length) }, worker));
  return out;
}

export type StreamPlaybackBatchRepo<TRow, TResolved> = {
  /** Existing `can_view_post` gate, evaluated under the CALLER's context. */
  canView: (postId: string) => Promise<boolean>;
  /** READY stream media for authorized posts only (service-role read). */
  fetchReadyMedia: (authorizedPostIds: string[]) => Promise<TRow[]>;
  postIdOf: (row: TRow) => string;
  /**
   * Token + URL resolution for one row (remote Cloudflare call). Returning
   * null (or throwing) drops ONLY that row — one Cloudflare failure never
   * hides or exposes anything else.
   */
  resolve: (row: TRow) => Promise<TResolved | null>;
  positionOf: (resolved: TResolved) => number;
  concurrency?: number;
};

/**
 * Batched playback orchestration: authorize each post first, read only
 * authorized rows, resolve tokens with bounded concurrency and per-row
 * failure isolation. Every requested id gets an entry (empty when the caller
 * may not view it, nothing is ready, or Cloudflare failed for its rows) —
 * deny-by-default in every branch.
 */
export async function resolveStreamPlaybackBatch<TRow, TResolved>(
  postIds: string[],
  repo: StreamPlaybackBatchRepo<TRow, TResolved>,
): Promise<Record<string, TResolved[]>> {
  const out: Record<string, TResolved[]> = {};
  for (const id of postIds) out[id] = [];
  if (postIds.length === 0) return out;

  const concurrency = repo.concurrency ?? STREAM_TOKEN_CONCURRENCY;
  const authz = await mapWithConcurrency(postIds, concurrency, async (id) =>
    (await repo.canView(id)) ? id : null,
  );
  const authorized = authz.filter((id): id is string => id !== null);
  if (authorized.length === 0) return out;
  const authorizedSet = new Set(authorized);

  const rows = await repo.fetchReadyMedia(authorized);
  const resolved = await mapWithConcurrency(rows, concurrency, async (row) => {
    // Defense in depth: never surface media for a post the caller wasn't
    // authorized to view, even if the repository over-returned rows.
    if (!authorizedSet.has(repo.postIdOf(row))) return null;
    try {
      return { postId: repo.postIdOf(row), value: await repo.resolve(row) };
    } catch {
      return null; // isolate a single Cloudflare failure to its own row
    }
  });
  for (const entry of resolved) {
    if (entry && entry.value != null) out[entry.postId].push(entry.value);
  }
  for (const id of authorized) out[id].sort((a, b) => repo.positionOf(a) - repo.positionOf(b));
  return out;
}

/**
 * TTL-aware playback-token cache (pure factory; clock injected). Tokens carry
 * no viewer identity (authorization happens per-request via can_view_post
 * BEFORE any cache read), so sharing one token per uid across viewers is
 * safe — and collapses the per-request Cloudflare /token amplification.
 * Instance-local by design; entries expire `marginSeconds` before the real
 * token expiry and the size is bounded (oldest-first eviction).
 */
export function createStreamTokenCache(options: {
  ttlSeconds: number;
  marginSeconds?: number;
  maxEntries?: number;
  nowMs: () => number;
}): {
  get: (uid: string) => string | null;
  set: (uid: string, token: string) => void;
  size: () => number;
} {
  const margin = options.marginSeconds ?? 300;
  const maxEntries = options.maxEntries ?? 1000;
  const usableMs = Math.max(0, (options.ttlSeconds - margin) * 1000);
  const entries = new Map<string, { token: string; expiresAtMs: number }>();

  return {
    get(uid) {
      const entry = entries.get(uid);
      if (!entry) return null;
      if (options.nowMs() >= entry.expiresAtMs) {
        entries.delete(uid);
        return null;
      }
      return entry.token;
    },
    set(uid, token) {
      if (entries.size >= maxEntries && !entries.has(uid)) {
        // Maps iterate in insertion order — evict the oldest entry.
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(uid, { token, expiresAtMs: options.nowMs() + usableMs });
    },
    size: () => entries.size,
  };
}
