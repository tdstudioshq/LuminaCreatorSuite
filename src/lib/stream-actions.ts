// ============================================================================
// CABANA — protected Cloudflare Stream server actions — Checkpoint 3
// ----------------------------------------------------------------------------
// Creator writes run under the caller's RLS via `attachSupabaseToken` +
// `requireSupabaseAuth`; playback reads are guest-callable via
// `optionalSupabaseAuth` and authorize with the existing `can_view_post` gate
// BEFORE any service-role read (the `getPostMediaUrls` model, exactly).
//
// The `createServerFn` handlers are thin WIRING; every decision and sequence
// lives either in the pure `cabana-stream.ts` or in the exported `execute*`
// FLOW functions below, whose I/O is injected — so quota compensation,
// terminal-status CAS, delete ordering, and cleanup-after-failure are all
// unit-tested with fakes (`stream-actions.test.ts`), no network, no DB.
//
// Trust boundaries in one line each:
//   * The client NEVER supplies a Cloudflare UID — UIDs come from Cloudflare
//     at ticket time and are read back from the caller's own RLS-scoped rows.
//   * The DB enforces ownership end-to-end (20260533 WITH CHECK + composite
//     ownership FK + coherence CHECK + one-live-attachment index). The v1
//     media-MIX rule (one video, no mixing) is app-layer: checked before
//     insert and re-verified after (compensating delete), since no DB
//     constraint models "per-post at most one video" yet.
//   * stream_videos status writes use the service role, but ONLY after the
//     row is proven to be the caller's under their own RLS, guarded by a
//     compare-and-set on the status that was read (terminal states can never
//     be regressed by a stale concurrent poll).
//
// These server functions compile to a client RPC bridge, so this file must
// NOT live under a `**/server/**` path.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { optionalSupabaseAuth } from "@/integrations/supabase/optional-auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import {
  type StreamPlaybackUrls,
  type StreamVideoSnapshot,
  type StreamVideoStatus,
  type TusUploadConstraints,
  DEFAULT_STREAM_UPLOAD_POLICY,
  STREAM_PLAYBACK_TOKEN_TTL_SECONDS,
  STREAM_STORAGE_BUCKET,
  STREAM_UPLOAD_TICKET_TTL_MINUTES,
  TUS_RECOMMENDED_CHUNK_BYTES,
  assertMediaMixAllowsAdding,
  buildStreamPlaybackUrls,
  buildStreamStoragePath,
  createStreamTokenCache,
  evaluateUploadTicketRequest,
  isTerminalStreamStatus,
  normalizeStreamPostIdBatch,
  processingStatusForStream,
  resolveStatusRefresh,
  resolveStreamPlaybackBatch,
} from "@/lib/cabana-stream";
import { createCloudflareStreamRepository } from "@/lib/stream-cloudflare.server";

type Db = SupabaseClient<Database>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID_PATTERN.test(raw)) {
    throw new Error(`A valid ${label} is required.`);
  }
  return raw.toLowerCase();
}

function normalizePosition(raw: unknown): number {
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error("Invalid media position.");
  return n;
}

/** Display-name for the Cloudflare dashboard; never trusted for anything else. */
function normalizeFileName(raw: unknown): string {
  const cleaned =
    typeof raw === "string"
      ? // eslint-disable-next-line no-control-regex -- strip control chars from an untrusted filename
        raw.replace(/[\u0000-\u001f\u007f]/g, "").trim()
      : "";
  return (cleaned || "video").slice(0, 200);
}

/** Resolve the caller's creator profile id, or throw if they aren't a creator. */
async function requireCreatorProfileId(supabase: Db, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only creators can upload videos.");
  return data.id;
}

/** Throw unless `postId` is one of the CALLER's own posts. */
async function requireOwnPost(
  supabase: Db,
  postId: string,
  creatorProfileId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("creator_profile_id", creatorProfileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Post not found.");
}

// ─────────────────────────────── Upload-ticket flow ─────────────────────────

export type StreamUploadTicket = {
  streamVideoId: string;
  uploadUrl: string;
  expiresAt: string;
  recommendedChunkSizeBytes: number;
};

export type UploadTicketDeps = {
  /** Active uploads = processing + UNEXPIRED pending (abandoned tickets must
   *  not consume the cap forever). */
  countActive: () => Promise<number>;
  countLast24h: () => Promise<number>;
  createCfUpload: (args: {
    sizeBytes: number;
    constraints: TusUploadConstraints;
    creator: string;
  }) => Promise<{ uploadUrl: string; uid: string }>;
  insertTicketRow: (uid: string, expiresAt: string) => Promise<string>;
  deleteTicketRow: (id: string) => Promise<void>;
  deleteCfVideo: (uid: string) => Promise<unknown>;
  nowMs: () => number;
};

/**
 * The ticket sequence, with two compensation paths:
 *  * DB insert fails after Cloudflare created the upload → best-effort CF
 *    delete, safe error (never a response body or credential).
 *  * Post-insert RECOUNT exceeds a cap (the check-then-act window of a
 *    parallel burst) → the ticket revokes itself (row + CF asset) and the
 *    request fails CLOSED with the quota error. True serialization needs a
 *    DB-side advisory lock (the 20260530 H8/H9 pattern) — a future migration;
 *    until then bursts converge to ≤cap plus a milliseconds-wide window.
 */
export async function executeUploadTicketFlow(
  deps: UploadTicketDeps,
  input: {
    fileName: string;
    mimeType: unknown;
    sizeBytes: unknown;
    durationHintSeconds: unknown;
    creatorProfileId: string;
  },
): Promise<StreamUploadTicket> {
  const [active, last24h] = await Promise.all([deps.countActive(), deps.countLast24h()]);
  const decision = evaluateUploadTicketRequest({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    durationHintSeconds: input.durationHintSeconds,
    activeUploads: active,
    uploadsLast24h: last24h,
  });
  if (!decision.allowed) throw new Error(decision.message);

  const expiresAt = new Date(
    deps.nowMs() + STREAM_UPLOAD_TICKET_TTL_MINUTES * 60 * 1000,
  ).toISOString();
  const { uploadUrl, uid } = await deps.createCfUpload({
    sizeBytes: input.sizeBytes as number,
    constraints: {
      maxDurationSeconds: DEFAULT_STREAM_UPLOAD_POLICY.maxDurationSeconds,
      requireSignedUrls: true, // approved v1 model: EVERY video is signed
      expiry: expiresAt,
      name: input.fileName,
    },
    creator: input.creatorProfileId,
  });

  let streamVideoId: string;
  try {
    streamVideoId = await deps.insertTicketRow(uid, expiresAt);
  } catch {
    try {
      await deps.deleteCfVideo(uid);
    } catch {
      // The ticket never became visible; the asset is unusable (signed-only,
      // no DB row) and a later sweep can remove it.
    }
    throw new Error("Could not start the video upload. Please try again.");
  }

  // Post-insert recount: revoke self if a parallel burst overshot a cap.
  const [activeAfter, last24hAfter] = await Promise.all([deps.countActive(), deps.countLast24h()]);
  const recheck = evaluateUploadTicketRequest({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    durationHintSeconds: input.durationHintSeconds,
    // This ticket's own committed row is included in the counts; caps are
    // "deny when >= cap BEFORE adding one more", so compare excluding self.
    activeUploads: Math.max(0, activeAfter - 1),
    uploadsLast24h: Math.max(0, last24hAfter - 1),
  });
  if (!recheck.allowed) {
    try {
      await deps.deleteTicketRow(streamVideoId);
      await deps.deleteCfVideo(uid);
    } catch {
      // Best effort; an orphaned revocation is sweepable either way.
    }
    throw new Error(recheck.message);
  }

  return {
    streamVideoId,
    uploadUrl,
    expiresAt,
    recommendedChunkSizeBytes: TUS_RECOMMENDED_CHUNK_BYTES,
  };
}

export const createStreamUploadTicket = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(
    (raw: {
      fileName?: unknown;
      mimeType?: unknown;
      sizeBytes?: unknown;
      durationHintSeconds?: unknown;
      postId?: unknown;
    }) => ({
      fileName: normalizeFileName(raw?.fileName),
      mimeType: raw?.mimeType,
      sizeBytes: raw?.sizeBytes,
      durationHintSeconds: raw?.durationHintSeconds,
      postId: raw?.postId == null ? null : normalizeUuid(raw.postId, "post id"),
    }),
  )
  .handler(async ({ context, data }): Promise<StreamUploadTicket> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    if (data.postId) await requireOwnPost(supabase, data.postId, creatorProfileId);
    const cf = createCloudflareStreamRepository();

    const countActive = async () => {
      const nowIso = new Date().toISOString();
      const { count, error } = await supabase
        .from("stream_videos")
        .select("id", { count: "exact", head: true })
        .or(
          `status.eq.processing,and(status.eq.pending_upload,upload_expires_at.gt.${nowIso}),and(status.eq.pending_upload,upload_expires_at.is.null)`,
        );
      if (error) throw new Error(error.message);
      return count ?? 0;
    };
    const countLast24h = async () => {
      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("stream_videos")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sinceIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    return executeUploadTicketFlow(
      {
        countActive,
        countLast24h,
        createCfUpload: (args) => cf.createDirectUpload(args),
        insertTicketRow: async (uid, expiresAt) => {
          const { data: row, error } = await supabase
            .from("stream_videos")
            .insert({
              uid,
              owner_user_id: userId,
              creator_profile_id: creatorProfileId,
              upload_expires_at: expiresAt,
            })
            .select("id")
            .single();
          if (error || !row) throw new Error(error?.message ?? "insert failed");
          return row.id;
        },
        deleteTicketRow: async (id) => {
          await supabase.from("stream_videos").delete().eq("id", id);
        },
        deleteCfVideo: (uid) => cf.deleteVideo(uid),
        nowMs: Date.now,
      },
      {
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        durationHintSeconds: data.durationHintSeconds,
        creatorProfileId,
      },
    );
  });

// ─────────────────────────────── Attach flow ────────────────────────────────

export type AttachedStreamMedia = {
  mediaId: string;
  postId: string;
  streamVideoId: string;
  processingStatus: string;
  position: number;
};

export type AttachFlowDeps = {
  /** The caller's own row under RLS (foreign ids are invisible → null). */
  getOwnVideo: (id: string) => Promise<{ id: string; uid: string; status: string } | null>;
  getExistingKinds: (postId: string) => Promise<string[]>;
  insertMedia: (row: {
    storagePath: string;
    processingStatus: string;
    streamVideoId: string;
    position: number;
  }) => Promise<AttachedStreamMedia>;
  /** Kinds AFTER insert, for the compensating mix re-check. */
  recheckKinds: (postId: string) => Promise<string[]>;
  deleteMedia: (mediaId: string) => Promise<void>;
  /** Correct a media row whose status was stamped from a stale read. */
  syncMediaStatus: (mediaId: string, processingStatus: string) => Promise<void>;
};

/**
 * Attach sequence. Ownership/coherence/one-live-attachment are DB-enforced;
 * the v1 MIX rule (one video, never with images) has no DB constraint, so it
 * is checked before insert and RE-VERIFIED after — a concurrent attach that
 * slipped past the first check triggers a compensating delete of THIS row
 * (both writers self-revoke in the worst case; fail closed either way).
 */
export async function executeAttachFlow(
  deps: AttachFlowDeps,
  input: { postId: string; streamVideoId: string; position: number; ownerUserId: string },
): Promise<AttachedStreamMedia> {
  const video = await deps.getOwnVideo(input.streamVideoId);
  if (!video) throw new Error("Video not found.");
  if (video.status === "error") {
    throw new Error("This video failed processing and cannot be attached.");
  }

  const existing = await deps.getExistingKinds(input.postId);
  assertMediaMixAllowsAdding(existing as never[], "video");

  const media = await deps.insertMedia({
    storagePath: buildStreamStoragePath(input.ownerUserId, video.uid),
    processingStatus: processingStatusForStream(video.status as StreamVideoStatus),
    streamVideoId: video.id,
    position: input.position,
  });

  const after = await deps.recheckKinds(input.postId);
  const videoRows = after.filter((kind) => kind === "video").length;
  const mixed = after.some((kind) => kind !== "video");
  if (videoRows > 1 || mixed) {
    try {
      await deps.deleteMedia(media.mediaId);
    } catch {
      // Best effort — the row is the caller's own; a retry can remove it.
    }
    throw new Error("This post's media changed while attaching. Try again.");
  }

  // The status we stamped above was read BEFORE the row existed. If the video
  // went terminal in that window, the lifecycle writer's sync found no media row
  // to update, so re-read and correct it here. Best-effort: the status-refresh
  // flow re-asserts terminal media state too, so a failure here self-heals on
  // the next poll rather than stranding the row.
  try {
    const fresh = await deps.getOwnVideo(input.streamVideoId);
    if (fresh && fresh.status !== video.status) {
      await deps.syncMediaStatus(
        media.mediaId,
        processingStatusForStream(fresh.status as StreamVideoStatus),
      );
    }
  } catch {
    // Ignore — attachment itself succeeded; convergence is guaranteed elsewhere.
  }

  return media;
}

export const attachStreamVideoToPost = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { postId?: unknown; streamVideoId?: unknown; position?: unknown }) => ({
    postId: normalizeUuid(raw?.postId, "post id"),
    streamVideoId: normalizeUuid(raw?.streamVideoId, "stream video id"),
    position: normalizePosition(raw?.position),
  }))
  .handler(async ({ context, data }): Promise<AttachedStreamMedia> => {
    const { supabase, userId } = context;
    const creatorProfileId = await requireCreatorProfileId(supabase, userId);
    await requireOwnPost(supabase, data.postId, creatorProfileId);

    const fetchKinds = async (postId: string) => {
      const { data: rows, error } = await supabase
        .from("post_media")
        .select("kind")
        .eq("post_id", postId);
      if (error) throw new Error(error.message);
      return (rows ?? []).map((m) => m.kind as string);
    };

    return executeAttachFlow(
      {
        getOwnVideo: async (id) => {
          const { data: video, error } = await supabase
            .from("stream_videos")
            .select("id, uid, status")
            .eq("id", id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          return video;
        },
        getExistingKinds: fetchKinds,
        insertMedia: async (row) => {
          const { data: inserted, error } = await supabase
            .from("post_media")
            .insert({
              post_id: data.postId,
              owner_user_id: userId,
              kind: "video",
              storage_bucket: STREAM_STORAGE_BUCKET,
              storage_path: row.storagePath,
              mime_type: null, // ticket MIME is not persisted; never trust the client here
              processing_status: row.processingStatus,
              stream_video_id: row.streamVideoId,
              position: row.position,
            })
            .select("id, post_id, stream_video_id, processing_status, position")
            .single();
          if (error) throw new Error(error.message);
          return {
            mediaId: inserted.id,
            postId: inserted.post_id,
            streamVideoId: inserted.stream_video_id as string,
            processingStatus: inserted.processing_status,
            position: inserted.position,
          };
        },
        recheckKinds: fetchKinds,
        deleteMedia: async (mediaId) => {
          await supabase.from("post_media").delete().eq("id", mediaId);
        },
        syncMediaStatus: async (mediaId, processingStatus) => {
          const { error } = await supabase
            .from("post_media")
            .update({ processing_status: processingStatus })
            .eq("id", mediaId);
          if (error) throw new Error(error.message);
        },
      },
      { ...data, ownerUserId: userId },
    );
  });

// ─────────────────────────────── Status-refresh flow ────────────────────────

export type StreamVideoStatusResult = {
  streamVideoId: string;
  status: StreamVideoStatus;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  readyAt: string | null;
  /** False when Cloudflare could not be reached and the DB state was returned. */
  refreshed: boolean;
};

export type OwnedVideoRow = {
  id: string;
  uid: string;
  status: StreamVideoStatus;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  error_code: string | null;
  error_message: string | null;
  ready_at: string | null;
};

export type StatusRefreshDeps = {
  getCfVideo: (uid: string) => Promise<StreamVideoSnapshot | null>;
  /**
   * Compare-and-set: write the patch ONLY where the row still has
   * `guardStatus` (the status this flow read). Returns true when a row
   * matched — a stale concurrent poll matches nothing and never regresses a
   * terminal state.
   */
  applyVideoUpdate: (
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
  ) => Promise<boolean>;
  /** Lifecycle columns ONLY (processing_status, width, height). */
  applyMediaUpdate: (patch: {
    processing_status: string;
    width: number | null;
    height: number | null;
  }) => Promise<void>;
  nowIso: () => string;
};

export async function executeStatusRefreshFlow(
  deps: StatusRefreshDeps,
  video: OwnedVideoRow,
): Promise<StreamVideoStatusResult> {
  const fromRow = (refreshed: boolean): StreamVideoStatusResult => ({
    streamVideoId: video.id,
    status: video.status,
    durationSeconds: video.duration_seconds,
    width: video.width,
    height: video.height,
    errorCode: video.error_code,
    errorMessage: video.error_message,
    readyAt: video.ready_at,
    refreshed,
  });

  // Terminal rows never change — skip the Cloudflare round-trip entirely.
  //
  // Deliberately does NOT re-sync the media row: `post_media.processing_status`
  // has no functional reader (the publish gate and playback both judge a video by
  // `stream_videos.status`, precisely because this column can lag), so repairing
  // cosmetic skew here would buy nothing and cost a write on every duplicate
  // webhook and poll. The skew is prevented at its source instead — see the
  // post-insert correction in `executeAttachFlow`.
  if (isTerminalStreamStatus(video.status)) return fromRow(false);

  let snapshot: StreamVideoSnapshot | null;
  try {
    snapshot = await deps.getCfVideo(video.uid);
  } catch {
    return fromRow(false); // Cloudflare unreachable → serve DB state, no 500
  }
  if (snapshot === null) {
    // Cloudflare no longer knows this video: a non-terminal row is dead.
    snapshot = {
      uid: video.uid,
      status: "error",
      readyToStream: false,
      durationSeconds: null,
      sizeBytes: null,
      width: null,
      height: null,
      errorCode: "CF_NOT_FOUND",
      errorMessage: "The video no longer exists at Cloudflare.",
      pctComplete: null,
    };
  }

  const refresh = resolveStatusRefresh(video.status, snapshot);
  if (!refresh.apply) return fromRow(true);

  const readyAt = refresh.status === "ready" ? deps.nowIso() : null;
  const matched = await deps.applyVideoUpdate(video.status, {
    status: refresh.status,
    duration_seconds: refresh.snapshot.durationSeconds,
    size_bytes: refresh.snapshot.sizeBytes,
    width: refresh.snapshot.width,
    height: refresh.snapshot.height,
    error_code: refresh.snapshot.errorCode,
    error_message: refresh.snapshot.errorMessage,
    ready_at: readyAt,
  });
  if (!matched) {
    // A concurrent refresh won the race; report OUR read + snapshot without
    // writing (never clobber — the winner may have recorded a terminal state).
    return fromRow(true);
  }
  await deps.applyMediaUpdate({
    processing_status: processingStatusForStream(refresh.status),
    width: refresh.snapshot.width,
    height: refresh.snapshot.height,
  });

  return {
    streamVideoId: video.id,
    status: refresh.status,
    durationSeconds: refresh.snapshot.durationSeconds,
    width: refresh.snapshot.width,
    height: refresh.snapshot.height,
    errorCode: refresh.snapshot.errorCode,
    errorMessage: refresh.snapshot.errorMessage,
    readyAt,
    refreshed: true,
  };
}

export const getStreamVideoStatus = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { streamVideoId?: unknown }) => ({
    streamVideoId: normalizeUuid(raw?.streamVideoId, "stream video id"),
  }))
  .handler(async ({ context, data }): Promise<StreamVideoStatusResult> => {
    const { supabase } = context;
    // Owner check via RLS: non-owners simply see nothing.
    const { data: video, error } = await supabase
      .from("stream_videos")
      .select(
        "id, uid, status, duration_seconds, width, height, error_code, error_message, ready_at",
      )
      .eq("id", data.streamVideoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!video) throw new Error("Video not found.");

    return executeStatusRefreshFlow(
      {
        getCfVideo: (uid) => createCloudflareStreamRepository().getVideo(uid),
        applyVideoUpdate: async (guardStatus, patch) => {
          const { data: updated, error: updateError } = await supabaseAdmin
            .from("stream_videos")
            .update(patch)
            .eq("id", video.id)
            .eq("status", guardStatus)
            .select("id");
          if (updateError) throw new Error(updateError.message);
          return (updated ?? []).length > 0;
        },
        applyMediaUpdate: async (patch) => {
          const { error: mediaError } = await supabaseAdmin
            .from("post_media")
            .update(patch)
            .eq("stream_video_id", video.id);
          if (mediaError) throw new Error(mediaError.message);
        },
        nowIso: () => new Date().toISOString(),
      },
      video as OwnedVideoRow,
    );
  });

// ─────────────────────────────── Playback ───────────────────────────────────

export type StreamPlaybackItem = {
  mediaId: string;
  position: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  urls: StreamPlaybackUrls;
};

/** Raw shape of the service-role ready-media read (post_media ⋈ stream_videos). */
export type ReadyMediaRow = {
  id: string;
  post_id: string;
  position: number;
  width: number | null;
  height: number | null;
  stream_videos: { uid: string; status: string; duration_seconds: number | null };
};

/**
 * Resolve one ready-media row into a playback item. Exported for tests: the
 * no-token-for-non-ready belt lives HERE, not only in the repository query.
 */
export async function resolvePlaybackItem(
  deps: { issueToken: (uid: string) => Promise<string>; customerSubdomain: string },
  row: ReadyMediaRow,
): Promise<StreamPlaybackItem | null> {
  if (row.stream_videos.status !== "ready") return null;
  const token = await deps.issueToken(row.stream_videos.uid);
  return {
    mediaId: row.id,
    position: row.position,
    width: row.width,
    height: row.height,
    durationSeconds: row.stream_videos.duration_seconds,
    urls: buildStreamPlaybackUrls(deps.customerSubdomain, token),
  };
}

// Instance-local, TTL/size-bounded; safe to share across viewers because
// tokens carry no identity and can_view_post gates every request first.
const tokenCache = createStreamTokenCache({
  ttlSeconds: STREAM_PLAYBACK_TOKEN_TTL_SECONDS,
  nowMs: Date.now,
});

/**
 * Shared playback resolution: `can_view_post` under the CALLER's context
 * first; only then a service-role read of READY stream media; tokens issued
 * per uid (cached) with bounded concurrency and per-row failure isolation.
 */
async function resolvePlaybackForPosts(
  callerSupabase: Db,
  postIds: string[],
): Promise<Record<string, StreamPlaybackItem[]>> {
  const cf = createCloudflareStreamRepository();
  const issueToken = async (uid: string): Promise<string> => {
    const cached = tokenCache.get(uid);
    if (cached) return cached;
    const token = await cf.createPlaybackToken(uid, STREAM_PLAYBACK_TOKEN_TTL_SECONDS);
    tokenCache.set(uid, token);
    return token;
  };

  return resolveStreamPlaybackBatch<ReadyMediaRow, StreamPlaybackItem>(postIds, {
    canView: async (postId) => {
      const { data: allowed, error } = await callerSupabase.rpc("can_view_post", {
        _post_id: postId,
      });
      if (error) throw new Error(error.message);
      return allowed === true;
    },
    fetchReadyMedia: async (authorizedIds) => {
      const { data, error } = await supabaseAdmin
        .from("post_media")
        .select(
          "id, post_id, position, width, height, stream_videos!inner(uid, status, duration_seconds)",
        )
        .in("post_id", authorizedIds)
        .eq("stream_videos.status", "ready");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ReadyMediaRow[];
    },
    postIdOf: (row) => row.post_id,
    resolve: (row) =>
      resolvePlaybackItem({ issueToken, customerSubdomain: cf.customerSubdomain }, row),
    positionOf: (item) => item.position,
  });
}

/** Playback for one post (guest-callable; deny-by-default). */
export const getStreamPlayback = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { postId?: unknown }) => ({
    postId: normalizeUuid(raw?.postId, "post id"),
  }))
  .handler(async ({ context, data }): Promise<StreamPlaybackItem[]> => {
    const supabase = context.supabase as Db;
    const map = await resolvePlaybackForPosts(supabase, [data.postId]);
    return map[data.postId] ?? [];
  });

/** Batched playback for feed surfaces (guest-callable; capped + deduped). */
export const getStreamPlaybackBatch = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, optionalSupabaseAuth])
  .inputValidator((raw: { postIds?: unknown }) => ({
    postIds: normalizeStreamPostIdBatch(raw?.postIds),
  }))
  .handler(async ({ context, data }): Promise<Record<string, StreamPlaybackItem[]>> => {
    const supabase = context.supabase as Db;
    return resolvePlaybackForPosts(supabase, data.postIds);
  });

// ─────────────────────────────── Delete flow ────────────────────────────────

export type DeleteFlowDeps = {
  /** The caller's own row under RLS (foreign ids are invisible → null). */
  getOwnVideo: (id: string) => Promise<{ id: string; uid: string } | null>;
  isAttached: (id: string) => Promise<boolean>;
  deleteCfVideo: (uid: string) => Promise<"deleted" | "not_found">;
  deleteRow: (id: string) => Promise<void>;
};

/**
 * Delete an UNATTACHED stream video (owner only). Attached videos are
 * rejected — removing a live post's video must be an explicit media-delete
 * decision, never a cascade side effect. The attachment check is repeated
 * right before the row delete: both attach and delete are OWNER-ONLY actions,
 * so the residual race is the owner racing themselves, and it fails toward
 * keeping the row (the Cloudflare asset may already be gone; a later status
 * refresh then marks the video error rather than silently stripping a post).
 */
export async function executeDeleteFlow(
  deps: DeleteFlowDeps,
  streamVideoId: string,
): Promise<{ streamVideoId: string; deleted: true }> {
  const video = await deps.getOwnVideo(streamVideoId);
  if (!video) throw new Error("Video not found.");
  if (await deps.isAttached(video.id)) {
    throw new Error("This video is attached to a post. Remove it from the post first.");
  }

  // Cloudflare first (idempotent: already-missing counts as success). If it
  // errors, the row stays so the delete can be retried — nothing silent.
  await deps.deleteCfVideo(video.uid);

  if (await deps.isAttached(video.id)) {
    throw new Error("This video was just attached to a post. Remove it from the post first.");
  }
  await deps.deleteRow(video.id);
  return { streamVideoId: video.id, deleted: true };
}

export const deleteStreamVideo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { streamVideoId?: unknown }) => ({
    streamVideoId: normalizeUuid(raw?.streamVideoId, "stream video id"),
  }))
  .handler(async ({ context, data }): Promise<{ streamVideoId: string; deleted: true }> => {
    const { supabase } = context;
    const cf = createCloudflareStreamRepository();
    return executeDeleteFlow(
      {
        getOwnVideo: async (id) => {
          const { data: video, error } = await supabase
            .from("stream_videos")
            .select("id, uid")
            .eq("id", id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          return video;
        },
        isAttached: async (id) => {
          const { data: attached, error } = await supabase
            .from("post_media")
            .select("id")
            .eq("stream_video_id", id)
            .limit(1);
          if (error) throw new Error(error.message);
          return (attached ?? []).length > 0;
        },
        deleteCfVideo: (uid) => cf.deleteVideo(uid),
        deleteRow: async (id) => {
          const { error } = await supabase.from("stream_videos").delete().eq("id", id);
          if (error) throw new Error(error.message);
        },
      },
      data.streamVideoId,
    );
  });
