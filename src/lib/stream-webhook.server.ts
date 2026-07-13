// ============================================================================
// CABANA — Cloudflare Stream webhook handler (SERVER-ONLY) — Checkpoint 4
// ----------------------------------------------------------------------------
// The full request→response flow behind POST /api/webhooks/stream. The route
// file (src/routes/api.webhooks.stream.ts) is a thin wrapper that dynamically
// imports this module inside the server handler, so nothing here can reach a
// client bundle. Server-only in the same sense as `client.server.ts`: it reads
// CLOUDFLARE_STREAM_WEBHOOK_SECRET (webhook path ONLY — the upload/playback
// actions never require it) and writes lifecycle columns with the service
// role. STREAM_SIGNING_KEY_ID is never read.
//
// Verification is the pure `verifyStreamWebhook` (Checkpoint 1): HMAC-SHA256
// over `<literal time string>.<raw body>`, 300 s freshness window, constant-
// time comparison. Lifecycle application REUSES `executeStatusRefreshFlow`
// (Checkpoint 3) with the parsed webhook body injected as the snapshot — the
// webhook and the owner-poll path therefore share one compare-and-set guard
// (`status = guardStatus` in the UPDATE itself, not just an app-level
// pre-read), one terminal-state lock, and one post_media sync (lifecycle
// columns only: processing_status/width/height — the exact service_role
// column grant from migration 20260536). Replays, duplicates, and
// webhook/poller races are no-ops by construction.
//
// Response contract (bodies never carry internals, secrets, or raw DB errors):
//   405 non-POST (belt; the route registers only POST)
//   401 missing/malformed/stale/mismatched signature
//   400 invalid JSON or a payload that fails the strict Cloudflare parser
//       (including live-input states — CABANA has no livestreaming)
//   200 unknown UID (deleted video or another environment — logged server-
//       side, no row created, nothing attached, no retry amplification)
//   200 valid event (applied, duplicate, or lost race — all idempotent)
//   500 missing/invalid webhook secret or a database failure (Cloudflare
//       retries; the body says only "server_error")
// ============================================================================
import { createHmac } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  type StreamVideoStatus,
  STREAM_ENV_VARS,
  WEBHOOK_SIGNATURE_HEADER,
  parseStreamVideoPayload,
  verifyStreamWebhook,
} from "@/lib/cabana-stream";
import { type OwnedVideoRow, executeStatusRefreshFlow } from "@/lib/stream-actions";

// ─────────────────────────────── Secret loader ──────────────────────────────

// Registration-time Cloudflare webhook secrets are long random strings; the
// floor only rejects obviously-wrong values (empty, placeholder fragments).
const WEBHOOK_SECRET_PATTERN = /^\S{16,}$/;

/**
 * Read + validate CLOUDFLARE_STREAM_WEBHOOK_SECRET. Required by the webhook
 * path ONLY — `requireStreamEnv` (upload/playback) deliberately does not gain
 * this variable. Throws naming the VARIABLE, never a value. Injectable.
 */
export function requireStreamWebhookSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = env[STREAM_ENV_VARS.webhookSecret];
  if (!secret) {
    throw new Error(
      `Missing Cloudflare Stream environment variable: ${STREAM_ENV_VARS.webhookSecret}.`,
    );
  }
  if (!WEBHOOK_SECRET_PATTERN.test(secret)) {
    throw new Error(`${STREAM_ENV_VARS.webhookSecret} has an unexpected format.`);
  }
  return secret;
}

// ─────────────────────────────── Injectable deps ────────────────────────────

/** Trusted lifecycle writes. The default is the service-role client, whose
 * privileges are themselves column-scoped by migration 20260536 (post_media:
 * processing_status/width/height only). Injected for tests. */
export type StreamWebhookDb = {
  findVideoByUid(uid: string): Promise<OwnedVideoRow | null>;
  /** Guarded UPDATE: applies the patch only where status = guardStatus.
   * Returns false when no row matched (a concurrent writer won). */
  applyVideoUpdate(
    id: string,
    guardStatus: StreamVideoStatus,
    patch: {
      status: StreamVideoStatus;
      duration_seconds: number | null;
      size_bytes: number | null;
      width: number | null;
      height: number | null;
      error_code: string | null;
      error_message: string | null;
      ready_at: string | null;
    },
  ): Promise<boolean>;
  /** Lifecycle columns ONLY — never post_id/owner/storage/kind/position. */
  applyMediaUpdate(
    streamVideoId: string,
    patch: { processing_status: string; width: number | null; height: number | null },
  ): Promise<void>;
};

export type StreamWebhookDeps = {
  env?: Record<string, string | undefined>;
  /** HMAC-SHA256 hex over `input` with `secret`. Defaults to node:crypto. */
  hmacSha256Hex?: (secret: string, input: string) => string;
  nowMs?: () => number;
  db?: StreamWebhookDb;
  /** Server-side diagnostics only — never part of the HTTP response. */
  log?: (message: string) => void;
};

function createSupabaseWebhookDb(): StreamWebhookDb {
  return {
    async findVideoByUid(uid) {
      const { data, error } = await supabaseAdmin
        .from("stream_videos")
        .select(
          "id, uid, status, duration_seconds, width, height, error_code, error_message, ready_at",
        )
        .eq("uid", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as OwnedVideoRow | null) ?? null;
    },
    async applyVideoUpdate(id, guardStatus, patch) {
      const { data, error } = await supabaseAdmin
        .from("stream_videos")
        .update(patch)
        .eq("id", id)
        .eq("status", guardStatus)
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    async applyMediaUpdate(streamVideoId, patch) {
      const { error } = await supabaseAdmin
        .from("post_media")
        .update(patch)
        .eq("stream_video_id", streamVideoId);
      if (error) throw new Error(error.message);
    },
  };
}

// ─────────────────────────────── Request handler ────────────────────────────

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleStreamWebhookRequest(
  request: Request,
  deps: StreamWebhookDeps = {},
): Promise<Response> {
  const log = deps.log ?? ((message: string) => console.warn(message));

  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  let secret: string;
  try {
    secret = requireStreamWebhookSecret(deps.env);
  } catch (e) {
    // Misconfiguration, not a caller error. The thrown message names only the
    // variable; even so, the HTTP body stays generic.
    log(`stream webhook: ${e instanceof Error ? e.message : "secret unavailable"}`);
    return jsonResponse(500, { error: "server_error" });
  }

  // Raw body FIRST — the signature covers these exact bytes.
  const rawBody = await request.text();
  const hmac =
    deps.hmacSha256Hex ??
    ((key: string, input: string) => createHmac("sha256", key).update(input).digest("hex"));
  const verification = verifyStreamWebhook({
    signatureHeader: request.headers.get(WEBHOOK_SIGNATURE_HEADER),
    rawBody,
    nowMs: (deps.nowMs ?? Date.now)(),
    hmacSha256Hex: (input) => hmac(secret, input),
  });
  if (!verification.valid) {
    return jsonResponse(401, { error: "invalid_signature" });
  }

  // Only now is the body trusted enough to parse. The strict parser rejects
  // non-objects, missing uid/status.state, wrong-typed fields, and live-input
  // states (CABANA v1 has no livestreaming).
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: "malformed_payload" });
  }
  let snapshot;
  try {
    snapshot = parseStreamVideoPayload(parsedJson);
  } catch {
    return jsonResponse(400, { error: "malformed_payload" });
  }

  const db = deps.db ?? createSupabaseWebhookDb();

  let video: OwnedVideoRow | null;
  try {
    video = await db.findVideoByUid(snapshot.uid);
  } catch {
    return jsonResponse(500, { error: "server_error" });
  }
  if (video === null) {
    // A verified Cloudflare event for a UID CABANA doesn't know: most likely a
    // video deleted here (delete-then-late-webhook) or another environment
    // sharing the Cloudflare account. 200 so Cloudflare does not retry; no row
    // is created and nothing is attached.
    log(`stream webhook: no stream_videos row for uid ${snapshot.uid} — event ignored.`);
    return jsonResponse(200, { received: true });
  }

  try {
    // Reuse the Checkpoint 3 flow verbatim: the webhook body IS the snapshot,
    // so getCfVideo is a closure over it — no Cloudflare API call happens.
    // Terminal rows return before the injected getCfVideo runs; a lost
    // compare-and-set race returns without writing (the winner may have
    // recorded a terminal state).
    await executeStatusRefreshFlow(
      {
        getCfVideo: async () => snapshot,
        applyVideoUpdate: (guardStatus, patch) => db.applyVideoUpdate(video.id, guardStatus, patch),
        applyMediaUpdate: (patch) => db.applyMediaUpdate(video.id, patch),
        nowIso: () => new Date((deps.nowMs ?? Date.now)()).toISOString(),
      },
      video,
    );
  } catch {
    // Transient DB failure: 500 so Cloudflare redelivers; the guarded update
    // makes the redelivery idempotent.
    return jsonResponse(500, { error: "server_error" });
  }

  return jsonResponse(200, { received: true });
}
