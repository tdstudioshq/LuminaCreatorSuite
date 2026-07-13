// ============================================================================
// CABANA — Cloudflare Stream server repository (SECRET-BEARING) — Checkpoint 3
// ----------------------------------------------------------------------------
// The ONLY module that talks to the Cloudflare Stream API or reads the Stream
// environment variables. Server-only in the same sense as `client.server.ts`:
// importing it is harmless (nothing secret runs at module scope — env is read
// inside functions), but its functions must only ever be CALLED from
// `createServerFn` handlers or server routes. It never logs or returns secret
// values; errors carry HTTP status + Cloudflare's own public error text only.
//
// All wire shapes are parsed strictly through the pure `cabana-stream.ts`
// boundary (malformed responses throw instead of guessing). `env`, `fetch`,
// and the clock are injectable so every method unit-tests with zero network.
//
// STREAM_SIGNING_KEY_ID is intentionally never read (reserved; v1 uses the
// server-side /token endpoint). CLOUDFLARE_STREAM_WEBHOOK_SECRET is not
// required here — only the webhook path reads it (stream-webhook.server.ts).
// ============================================================================
import {
  type StreamVideoSnapshot,
  type TusUploadConstraints,
  STREAM_ENV_VARS,
  buildTusUploadMetadata,
  isValidCustomerSubdomain,
  isValidStreamUid,
  parseStreamTokenResponse,
  parseStreamVideoPayload,
  parseTusCreationHeaders,
  unwrapCloudflareEnvelope,
} from "@/lib/cabana-stream";

export type StreamEnv = {
  accountId: string;
  apiToken: string;
  customerSubdomain: string;
};

const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9]{16,64}$/;
const API_TOKEN_PATTERN = /^\S{20,}$/;

/**
 * Read + validate the three required Stream variables. Throws naming the
 * offending VARIABLE (never its value). Injectable for tests.
 */
export function requireStreamEnv(env: Record<string, string | undefined> = process.env): StreamEnv {
  const accountId = env[STREAM_ENV_VARS.accountId];
  const apiToken = env[STREAM_ENV_VARS.apiToken];
  const customerSubdomain = env[STREAM_ENV_VARS.customerSubdomain];

  const missing = [
    ...(accountId ? [] : [STREAM_ENV_VARS.accountId]),
    ...(apiToken ? [] : [STREAM_ENV_VARS.apiToken]),
    ...(customerSubdomain ? [] : [STREAM_ENV_VARS.customerSubdomain]),
  ];
  if (missing.length > 0) {
    throw new Error(`Missing Cloudflare Stream environment variable(s): ${missing.join(", ")}.`);
  }
  if (!ACCOUNT_ID_PATTERN.test(accountId as string)) {
    throw new Error(`${STREAM_ENV_VARS.accountId} has an unexpected format.`);
  }
  if (!API_TOKEN_PATTERN.test(apiToken as string)) {
    throw new Error(`${STREAM_ENV_VARS.apiToken} has an unexpected format.`);
  }
  if (!isValidCustomerSubdomain(customerSubdomain)) {
    throw new Error(
      `${STREAM_ENV_VARS.customerSubdomain} must look like customer-<code>.cloudflarestream.com.`,
    );
  }
  return {
    accountId: accountId as string,
    apiToken: apiToken as string,
    customerSubdomain: customerSubdomain as string,
  };
}

export type CloudflareStreamRepository = {
  /** One-time tus upload URL + the Cloudflare-assigned video UID. */
  createDirectUpload(args: {
    sizeBytes: number;
    constraints: TusUploadConstraints;
    /** Optional Upload-Creator tag (we pass the creator_profile_id). */
    creator?: string;
  }): Promise<{ uploadUrl: string; uid: string }>;
  /** Normalized video snapshot, or null when Cloudflare has no such video. */
  getVideo(uid: string): Promise<StreamVideoSnapshot | null>;
  /** Short-lived signed playback token from the server-side /token endpoint. */
  createPlaybackToken(uid: string, ttlSeconds: number): Promise<string>;
  /** Idempotent delete: already-missing counts as success. */
  deleteVideo(uid: string): Promise<"deleted" | "not_found">;
  /** For building playback URLs; not a secret. */
  customerSubdomain: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/** Cloudflare failure → safe application error (status + CF public message). */
async function toSafeError(res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as unknown;
    if (body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors)) {
      detail = (body as { errors: { code?: number; message?: string }[] }).errors
        .map((e) => `${e.code ?? "?"}: ${e.message ?? ""}`)
        .join("; ");
    }
  } catch {
    // Non-JSON body (tus endpoints): report the status alone.
  }
  return new Error(
    `Cloudflare Stream request failed (HTTP ${res.status}${detail ? ` — ${detail}` : ""}).`,
  );
}

function assertUid(uid: string): void {
  if (!isValidStreamUid(uid)) throw new Error("Invalid stream video UID.");
}

export function createCloudflareStreamRepository(options?: {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  nowMs?: () => number;
}): CloudflareStreamRepository {
  const { accountId, apiToken, customerSubdomain } = requireStreamEnv(options?.env);
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const nowMs = options?.nowMs ?? Date.now;
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`;
  const authHeader = { Authorization: `Bearer ${apiToken}` };

  return {
    customerSubdomain,

    async createDirectUpload({ sizeBytes, constraints, creator }) {
      if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
        throw new Error("A positive integer upload size is required.");
      }
      const res = await fetchImpl(`${base}?direct_user=true`, {
        method: "POST",
        headers: {
          ...authHeader,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(sizeBytes),
          "Upload-Metadata": buildTusUploadMetadata(constraints),
          ...(creator ? { "Upload-Creator": creator } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status !== 201) throw await toSafeError(res);
      return parseTusCreationHeaders({
        location: res.headers.get("location"),
        mediaId: res.headers.get("stream-media-id"),
      });
    },

    async getVideo(uid) {
      assertUid(uid);
      const res = await fetchImpl(`${base}/${uid}`, {
        method: "GET",
        headers: authHeader,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw await toSafeError(res);
      return parseStreamVideoPayload(unwrapCloudflareEnvelope(await res.json()));
    },

    async createPlaybackToken(uid, ttlSeconds) {
      assertUid(uid);
      if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 86_400) {
        throw new Error("Playback token TTL must be 1..86400 seconds.");
      }
      const res = await fetchImpl(`${base}/${uid}/token`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          exp: Math.floor(nowMs() / 1000) + ttlSeconds,
          downloadable: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw await toSafeError(res);
      return parseStreamTokenResponse(await res.json());
    },

    async deleteVideo(uid) {
      assertUid(uid);
      const res = await fetchImpl(`${base}/${uid}`, {
        method: "DELETE",
        headers: authHeader,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) return "not_found";
      if (!res.ok) throw await toSafeError(res);
      return "deleted";
    },
  };
}
