import { describe, expect, it } from "vitest";
import {
  type DeleteFlowDeps,
  type OwnedVideoRow,
  type ReadyMediaRow,
  type StatusRefreshDeps,
  type UploadTicketDeps,
  executeAttachFlow,
  executeDeleteFlow,
  executeStatusRefreshFlow,
  executeUploadTicketFlow,
  resolvePlaybackItem,
} from "@/lib/stream-actions";
import { TUS_RECOMMENDED_CHUNK_BYTES } from "@/lib/cabana-stream";

// Entirely fake identifiers — no real accounts, tokens, or videos.
const OWNER = "0b9f5f2e-3c1a-4f6e-9b2d-8a7c6d5e4f3a";
const POST = "1c8e4d3b-2a19-4e5d-8c7b-6f5e4d3c2b1a";
const SV_ID = "2d7f3c2a-1b08-4d5c-9a6b-5e4d3c2b1a09";
const UID = "6b9e68b07dfee8cc2d116e4c51d6a957";
const NOW_MS = Date.parse("2026-07-12T12:00:00.000Z");
const SUBDOMAIN = "customer-testcode123.cloudflarestream.com";

// ─────────────────────────────── Upload-ticket flow ─────────────────────────

function ticketDeps(overrides: Partial<UploadTicketDeps> = {}) {
  const log: string[] = [];
  const deps: UploadTicketDeps = {
    countActive: async () => 0,
    countLast24h: async () => 0,
    createCfUpload: async () => {
      log.push("cf-create");
      return { uploadUrl: "https://upload.example.invalid/x", uid: UID };
    },
    insertTicketRow: async () => {
      log.push("insert");
      return SV_ID;
    },
    deleteTicketRow: async (id) => {
      log.push(`delete-row:${id}`);
    },
    deleteCfVideo: async (uid) => {
      log.push(`delete-cf:${uid}`);
      return "deleted";
    },
    nowMs: () => NOW_MS,
    ...overrides,
  };
  return { deps, log };
}

const TICKET_INPUT = {
  fileName: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1024,
  durationHintSeconds: undefined,
  creatorProfileId: "creator-profile-1",
};

describe("executeUploadTicketFlow", () => {
  it("issues a ticket and returns only safe fields", async () => {
    const { deps, log } = ticketDeps();
    const ticket = await executeUploadTicketFlow(deps, TICKET_INPUT);
    expect(ticket).toEqual({
      streamVideoId: SV_ID,
      uploadUrl: "https://upload.example.invalid/x",
      expiresAt: new Date(NOW_MS + 60 * 60 * 1000).toISOString(),
      recommendedChunkSizeBytes: TUS_RECOMMENDED_CHUNK_BYTES,
    });
    expect(log).toEqual(["cf-create", "insert"]);
  });

  it("passes the always-signed constraint and the creator tag to Cloudflare", async () => {
    let seen: unknown;
    const { deps } = ticketDeps({
      createCfUpload: async (args) => {
        seen = args;
        return { uploadUrl: "https://u.example.invalid", uid: UID };
      },
    });
    await executeUploadTicketFlow(deps, TICKET_INPUT);
    expect(seen).toMatchObject({
      sizeBytes: 1024,
      creator: "creator-profile-1",
      constraints: { requireSignedUrls: true, maxDurationSeconds: 600, name: "clip.mp4" },
    });
  });

  it("denies at the quota BEFORE creating anything at Cloudflare", async () => {
    const { deps, log } = ticketDeps({ countActive: async () => 3 });
    await expect(executeUploadTicketFlow(deps, TICKET_INPUT)).rejects.toThrow(/Too many uploads/);
    expect(log).toEqual([]);
  });

  it("cleans up the Cloudflare asset when the DB insert fails, with a safe error", async () => {
    const { deps, log } = ticketDeps({
      insertTicketRow: async () => {
        throw new Error("duplicate key value violates unique constraint stream_videos_uid_key");
      },
    });
    await expect(executeUploadTicketFlow(deps, TICKET_INPUT)).rejects.toThrow(
      "Could not start the video upload. Please try again.",
    );
    expect(log).toContain(`delete-cf:${UID}`);
    // The DB error text (which could carry internals) is never surfaced.
  });

  it("still reports the safe error when the compensating CF delete also fails", async () => {
    const { deps } = ticketDeps({
      insertTicketRow: async () => {
        throw new Error("boom");
      },
      deleteCfVideo: async () => {
        throw new Error("cf down");
      },
    });
    await expect(executeUploadTicketFlow(deps, TICKET_INPUT)).rejects.toThrow(
      "Could not start the video upload. Please try again.",
    );
  });

  it("self-revokes (row + asset) when the post-insert recount exceeds a cap", async () => {
    let calls = 0;
    const { deps, log } = ticketDeps({
      // Pre-check sees 2 (allowed); post-insert recount sees 5 (burst landed).
      countActive: async () => (++calls <= 1 ? 2 : 5),
    });
    await expect(executeUploadTicketFlow(deps, TICKET_INPUT)).rejects.toThrow(/Too many uploads/);
    expect(log).toContain(`delete-row:${SV_ID}`);
    expect(log).toContain(`delete-cf:${UID}`);
  });

  it("does not self-revoke when the recount includes only its own row", async () => {
    let calls = 0;
    const { deps } = ticketDeps({
      countActive: async () => (++calls <= 1 ? 2 : 3), // 3rd active is ME → excluding self = 2 < 3
    });
    const ticket = await executeUploadTicketFlow(deps, TICKET_INPUT);
    expect(ticket.streamVideoId).toBe(SV_ID);
  });
});

// ─────────────────────────────── Attach flow ────────────────────────────────

function attachDeps(overrides: Partial<Parameters<typeof executeAttachFlow>[0]> = {}) {
  const log: string[] = [];
  const deps: Parameters<typeof executeAttachFlow>[0] = {
    getOwnVideo: async () => ({ id: SV_ID, uid: UID, status: "processing" }),
    getExistingKinds: async () => [],
    insertMedia: async (row) => {
      log.push(`insert:${row.storagePath}:${row.processingStatus}`);
      return {
        mediaId: "media-1",
        postId: POST,
        streamVideoId: row.streamVideoId,
        processingStatus: row.processingStatus,
        position: row.position,
      };
    },
    recheckKinds: async () => ["video"],
    deleteMedia: async (id) => {
      log.push(`delete-media:${id}`);
    },
    ...overrides,
  };
  return { deps, log };
}

const ATTACH_INPUT = { postId: POST, streamVideoId: SV_ID, position: 0, ownerUserId: OWNER };

describe("executeAttachFlow", () => {
  it("attaches with the convention path and mapped processing status", async () => {
    const { deps, log } = attachDeps();
    const media = await executeAttachFlow(deps, ATTACH_INPUT);
    expect(media.processingStatus).toBe("processing");
    expect(log[0]).toBe(`insert:${OWNER}/stream/${UID}:processing`);
  });

  it("attaches a ready video with processing_status ready", async () => {
    const { deps } = attachDeps({
      getOwnVideo: async () => ({ id: SV_ID, uid: UID, status: "ready" }),
    });
    expect((await executeAttachFlow(deps, ATTACH_INPUT)).processingStatus).toBe("ready");
  });

  it("rejects an invisible (non-owned) video and an error-state video", async () => {
    const invisible = attachDeps({ getOwnVideo: async () => null });
    await expect(executeAttachFlow(invisible.deps, ATTACH_INPUT)).rejects.toThrow(
      "Video not found.",
    );
    const failed = attachDeps({
      getOwnVideo: async () => ({ id: SV_ID, uid: UID, status: "error" }),
    });
    await expect(executeAttachFlow(failed.deps, ATTACH_INPUT)).rejects.toThrow(/failed processing/);
  });

  it("rejects mix violations before inserting", async () => {
    const { deps, log } = attachDeps({ getExistingKinds: async () => ["image"] });
    await expect(executeAttachFlow(deps, ATTACH_INPUT)).rejects.toThrow(/only media/);
    expect(log).toEqual([]);
  });

  it("compensates (deletes its own row) when a concurrent attach races past the check", async () => {
    const { deps, log } = attachDeps({ recheckKinds: async () => ["video", "video"] });
    await expect(executeAttachFlow(deps, ATTACH_INPUT)).rejects.toThrow(/changed while attaching/);
    expect(log).toContain("delete-media:media-1");
  });

  it("compensates when an image slipped in beside the video", async () => {
    const { deps, log } = attachDeps({ recheckKinds: async () => ["video", "image"] });
    await expect(executeAttachFlow(deps, ATTACH_INPUT)).rejects.toThrow(/changed while attaching/);
    expect(log).toContain("delete-media:media-1");
  });
});

// ─────────────────────────────── Status-refresh flow ────────────────────────

function videoRow(overrides: Partial<OwnedVideoRow> = {}): OwnedVideoRow {
  return {
    id: SV_ID,
    uid: UID,
    status: "processing",
    duration_seconds: null,
    width: null,
    height: null,
    error_code: null,
    error_message: null,
    ready_at: null,
    ...overrides,
  };
}

function refreshDeps(overrides: Partial<StatusRefreshDeps> = {}) {
  const log: string[] = [];
  const deps: StatusRefreshDeps = {
    getCfVideo: async () => ({
      uid: UID,
      status: "ready",
      readyToStream: true,
      durationSeconds: 5.5,
      sizeBytes: 1000,
      width: 1280,
      height: 720,
      errorCode: null,
      errorMessage: null,
      pctComplete: null,
    }),
    applyVideoUpdate: async (guard, patch) => {
      log.push(`video-update:guard=${guard}:status=${patch.status}`);
      return true;
    },
    applyMediaUpdate: async (patch) => {
      log.push(`media-update:${patch.processing_status}:${patch.width}x${patch.height}`);
    },
    nowIso: () => "2026-07-12T12:00:00.000Z",
    ...overrides,
  };
  return { deps, log };
}

describe("executeStatusRefreshFlow", () => {
  it("skips Cloudflare entirely for terminal rows", async () => {
    let cfCalled = false;
    const { deps } = refreshDeps({
      getCfVideo: async () => {
        cfCalled = true;
        return null;
      },
    });
    for (const status of ["ready", "error"] as const) {
      const result = await executeStatusRefreshFlow(deps, videoRow({ status }));
      expect(result.status).toBe(status);
      expect(result.refreshed).toBe(false);
    }
    expect(cfCalled).toBe(false);
  });

  it("applies a ready flip with CAS guard and updates media lifecycle columns only", async () => {
    const { deps, log } = refreshDeps();
    const result = await executeStatusRefreshFlow(deps, videoRow());
    expect(result).toMatchObject({ status: "ready", refreshed: true, width: 1280 });
    expect(result.readyAt).toBe("2026-07-12T12:00:00.000Z");
    expect(log).toEqual([
      "video-update:guard=processing:status=ready",
      "media-update:ready:1280x720",
    ]);
  });

  it("never writes media when the CAS misses (a concurrent refresh won)", async () => {
    const { deps, log } = refreshDeps({ applyVideoUpdate: async () => false });
    const result = await executeStatusRefreshFlow(deps, videoRow());
    // Reports the state IT read; the winner's terminal write is untouched.
    expect(result).toMatchObject({ status: "processing", refreshed: true });
    expect(log).toEqual([]);
  });

  it("returns DB state without a 500 when Cloudflare is unreachable", async () => {
    const { deps, log } = refreshDeps({
      getCfVideo: async () => {
        throw new Error("cf down");
      },
    });
    const result = await executeStatusRefreshFlow(deps, videoRow());
    expect(result).toMatchObject({ status: "processing", refreshed: false });
    expect(log).toEqual([]);
  });

  it("treats a Cloudflare 404 as a dead video (error transition, CF_NOT_FOUND)", async () => {
    const { deps, log } = refreshDeps({ getCfVideo: async () => null });
    const result = await executeStatusRefreshFlow(deps, videoRow());
    expect(result).toMatchObject({ status: "error", errorCode: "CF_NOT_FOUND", readyAt: null });
    expect(log[0]).toBe("video-update:guard=processing:status=error");
    expect(log[1]).toBe("media-update:error:nullxnull");
  });

  it("ignores an illegal backwards snapshot without writing", async () => {
    const { deps, log } = refreshDeps({
      getCfVideo: async () => ({
        uid: UID,
        status: "pending_upload",
        readyToStream: false,
        durationSeconds: null,
        sizeBytes: null,
        width: null,
        height: null,
        errorCode: null,
        errorMessage: null,
        pctComplete: null,
      }),
    });
    const result = await executeStatusRefreshFlow(deps, videoRow());
    expect(result).toMatchObject({ status: "processing", refreshed: true });
    expect(log).toEqual([]);
  });
});

// ─────────────────────────────── Playback item ──────────────────────────────

describe("resolvePlaybackItem", () => {
  const row: ReadyMediaRow = {
    id: "media-1",
    post_id: POST,
    position: 0,
    width: 1280,
    height: 720,
    stream_videos: { uid: UID, status: "ready", duration_seconds: 5.5 },
  };

  it("issues a token and builds the four signed URLs for a ready row", async () => {
    const item = await resolvePlaybackItem(
      { issueToken: async () => "abc.def.ghi", customerSubdomain: SUBDOMAIN },
      row,
    );
    expect(item).toMatchObject({ mediaId: "media-1", durationSeconds: 5.5 });
    expect(item?.urls.iframe).toBe(`https://${SUBDOMAIN}/abc.def.ghi/iframe`);
  });

  it("NEVER issues a token for a non-ready row, even if the query over-returned", async () => {
    let tokenCalls = 0;
    for (const status of ["pending_upload", "processing", "error"]) {
      const item = await resolvePlaybackItem(
        {
          issueToken: async () => {
            tokenCalls += 1;
            return "t";
          },
          customerSubdomain: SUBDOMAIN,
        },
        { ...row, stream_videos: { ...row.stream_videos, status } },
      );
      expect(item).toBeNull();
    }
    expect(tokenCalls).toBe(0);
  });
});

// ─────────────────────────────── Delete flow ────────────────────────────────

function deleteDeps(overrides: Partial<DeleteFlowDeps> = {}) {
  const log: string[] = [];
  const deps: DeleteFlowDeps = {
    getOwnVideo: async () => ({ id: SV_ID, uid: UID }),
    isAttached: async () => false,
    deleteCfVideo: async (uid) => {
      log.push(`cf-delete:${uid}`);
      return "deleted";
    },
    deleteRow: async (id) => {
      log.push(`row-delete:${id}`);
    },
    ...overrides,
  };
  return { deps, log };
}

describe("executeDeleteFlow", () => {
  it("deletes Cloudflare first, then the row", async () => {
    const { deps, log } = deleteDeps();
    expect(await executeDeleteFlow(deps, SV_ID)).toEqual({ streamVideoId: SV_ID, deleted: true });
    expect(log).toEqual([`cf-delete:${UID}`, `row-delete:${SV_ID}`]);
  });

  it("treats an already-missing Cloudflare video as success (idempotent)", async () => {
    const { deps, log } = deleteDeps({ deleteCfVideo: async () => "not_found" });
    expect(await executeDeleteFlow(deps, SV_ID)).toMatchObject({ deleted: true });
    expect(log).toEqual([`row-delete:${SV_ID}`]);
  });

  it("rejects invisible (non-owned) ids and attached videos without touching anything", async () => {
    const invisible = deleteDeps({ getOwnVideo: async () => null });
    await expect(executeDeleteFlow(invisible.deps, SV_ID)).rejects.toThrow("Video not found.");
    expect(invisible.log).toEqual([]);

    const attached = deleteDeps({ isAttached: async () => true });
    await expect(executeDeleteFlow(attached.deps, SV_ID)).rejects.toThrow(/attached to a post/);
    expect(attached.log).toEqual([]);
  });

  it("keeps the row when Cloudflare fails, so the delete can be retried", async () => {
    const { deps, log } = deleteDeps({
      deleteCfVideo: async () => {
        throw new Error("Cloudflare Stream request failed (HTTP 500).");
      },
    });
    await expect(executeDeleteFlow(deps, SV_ID)).rejects.toThrow(/HTTP 500/);
    expect(log).toEqual([]);
  });

  it("re-checks attachment before the row delete and fails toward keeping the row", async () => {
    let checks = 0;
    const { deps, log } = deleteDeps({
      isAttached: async () => ++checks > 1, // unattached at first, attached on re-check
    });
    await expect(executeDeleteFlow(deps, SV_ID)).rejects.toThrow(/just attached/);
    expect(log).toEqual([`cf-delete:${UID}`]); // CF gone, row kept — never a silent cascade
  });
});
