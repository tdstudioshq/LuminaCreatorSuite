import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type OrphanCandidateRow,
  type StreamVideoStatus,
  CLOUDFLARE_VIDEO_STATES,
  DEFAULT_ORPHAN_GRACE,
  DEFAULT_STREAM_UPLOAD_POLICY,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  READY_PROCESSING_STATUS,
  STREAM_ENV_VARS,
  STREAM_MAX_ACTIVE_UPLOADS,
  STREAM_MAX_DURATION_SECONDS,
  STREAM_MAX_SIZE_BYTES,
  STREAM_MAX_UPLOADS_PER_DAY,
  STREAM_PATH_SEGMENT,
  STREAM_STORAGE_BUCKET,
  STREAM_VIDEO_MIME_ALLOWLIST,
  STREAM_VIDEO_STATUSES,
  TUS_CHUNK_MULTIPLE_BYTES,
  TUS_MAX_CHUNK_BYTES,
  TUS_MIN_CHUNK_BYTES,
  TUS_RECOMMENDED_CHUNK_BYTES,
  WEBHOOK_SIGNATURE_HEADER,
  assertMediaMixAllowsAdding,
  assertPublishableMedia,
  assertStreamStatusTransition,
  buildStreamPlaybackUrls,
  buildStreamStoragePath,
  buildTusUploadMetadata,
  buildWebhookSigningInput,
  canTransitionStreamStatus,
  cfStateToStreamStatus,
  constantTimeEqualHex,
  encodeBase64,
  evaluatePublishableMedia,
  evaluateUploadTicketRequest,
  isTerminalStreamStatus,
  isValidCustomerSubdomain,
  isValidPlaybackToken,
  isValidStreamUid,
  isValidTusChunkSize,
  isWebhookTimestampFresh,
  parseStreamStoragePath,
  parseStreamTokenResponse,
  parseStreamVideoPayload,
  parseTusCreationHeaders,
  parseWebhookSignatureHeader,
  selectOrphanCandidates,
  streamStoragePathBelongsTo,
  unwrapCloudflareEnvelope,
  verifyStreamWebhook,
} from "@/lib/cabana-stream";

const OWNER = "0b9f5f2e-3c1a-4f6e-9b2d-8a7c6d5e4f3a";
const OTHER_OWNER = "1c8e4d3b-2a19-4e5d-8c7b-6f5e4d3c2b1a";
// Format-realistic fake UID (shape from public doc examples; not a real video).
const UID = "6b9e68b07dfee8cc2d116e4c51d6a957";
const SUBDOMAIN = "customer-abc123xyz.cloudflarestream.com";
const NOW = "2026-07-12T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);

// ─────────────────────────────── Environment names ──────────────────────────

describe("STREAM_ENV_VARS", () => {
  it("names the four standardized variables and nothing else", () => {
    expect(STREAM_ENV_VARS).toEqual({
      accountId: "CLOUDFLARE_ACCOUNT_ID",
      apiToken: "CLOUDFLARE_STREAM_TOKEN",
      customerSubdomain: "CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN",
      webhookSecret: "CLOUDFLARE_STREAM_WEBHOOK_SECRET",
    });
    // STREAM_SIGNING_KEY_ID is reserved and must not be referenced in v1.
    expect(Object.values(STREAM_ENV_VARS)).not.toContain("STREAM_SIGNING_KEY_ID");
  });
});

// ─────────────────────────────── Upload policy ──────────────────────────────

describe("evaluateUploadTicketRequest", () => {
  const ok = { activeUploads: 0, uploadsLast24h: 0 };

  it("allows a valid request for every allowlisted MIME type", () => {
    for (const mimeType of STREAM_VIDEO_MIME_ALLOWLIST) {
      expect(evaluateUploadTicketRequest({ mimeType, sizeBytes: 1024, ...ok })).toEqual({
        allowed: true,
      });
    }
  });

  it("accepts MIME types case-insensitively and trims whitespace", () => {
    const decision = evaluateUploadTicketRequest({
      mimeType: "  VIDEO/MP4 ",
      sizeBytes: 1,
      ...ok,
    });
    expect(decision.allowed).toBe(true);
  });

  it.each([["image/png"], ["video/x-matroska"], ["application/octet-stream"], [""], [null], [42]])(
    "rejects unsupported or non-string MIME type %p",
    (mimeType) => {
      const decision = evaluateUploadTicketRequest({ mimeType, sizeBytes: 1024, ...ok });
      expect(decision).toMatchObject({ allowed: false, reason: "unsupported_mime_type" });
    },
  );

  it.each([[0], [-1], [1.5], [Number.NaN], ["1024"], [null], [undefined]])(
    "rejects invalid size %p",
    (sizeBytes) => {
      const decision = evaluateUploadTicketRequest({ mimeType: "video/mp4", sizeBytes, ...ok });
      expect(decision).toMatchObject({ allowed: false, reason: "invalid_size" });
    },
  );

  it("allows exactly 1 GiB and rejects one byte more", () => {
    expect(
      evaluateUploadTicketRequest({
        mimeType: "video/mp4",
        sizeBytes: STREAM_MAX_SIZE_BYTES,
        ...ok,
      }).allowed,
    ).toBe(true);
    expect(
      evaluateUploadTicketRequest({
        mimeType: "video/mp4",
        sizeBytes: STREAM_MAX_SIZE_BYTES + 1,
        ...ok,
      }),
    ).toMatchObject({ allowed: false, reason: "too_large" });
  });

  it("allows exactly 600s duration hint and rejects 601s", () => {
    expect(
      evaluateUploadTicketRequest({
        mimeType: "video/mp4",
        sizeBytes: 1,
        durationHintSeconds: STREAM_MAX_DURATION_SECONDS,
        ...ok,
      }).allowed,
    ).toBe(true);
    expect(
      evaluateUploadTicketRequest({
        mimeType: "video/mp4",
        sizeBytes: 1,
        durationHintSeconds: STREAM_MAX_DURATION_SECONDS + 1,
        ...ok,
      }),
    ).toMatchObject({ allowed: false, reason: "too_long" });
  });

  it.each([[0], [-5], [Number.NaN], ["600"]])(
    "rejects invalid duration hint %p",
    (durationHintSeconds) => {
      expect(
        evaluateUploadTicketRequest({
          mimeType: "video/mp4",
          sizeBytes: 1,
          durationHintSeconds,
          ...ok,
        }),
      ).toMatchObject({ allowed: false, reason: "too_long" });
    },
  );

  it("ignores an absent or null duration hint", () => {
    expect(
      evaluateUploadTicketRequest({
        mimeType: "video/mp4",
        sizeBytes: 1,
        durationHintSeconds: null,
        ...ok,
      }).allowed,
    ).toBe(true);
  });

  it("denies the request once the concurrent-upload cap is reached", () => {
    expect(
      evaluateUploadTicketRequest({
        mimeType: "video/mp4",
        sizeBytes: 1,
        activeUploads: STREAM_MAX_ACTIVE_UPLOADS - 1,
        uploadsLast24h: 0,
      }).allowed,
    ).toBe(true);
    expect(
      evaluateUploadTicketRequest({
        mimeType: "video/mp4",
        sizeBytes: 1,
        activeUploads: STREAM_MAX_ACTIVE_UPLOADS,
        uploadsLast24h: 0,
      }),
    ).toMatchObject({ allowed: false, reason: "too_many_active_uploads" });
  });

  it("denies the request once the rolling 24h cap is reached", () => {
    expect(
      evaluateUploadTicketRequest({
        mimeType: "video/mp4",
        sizeBytes: 1,
        activeUploads: 0,
        uploadsLast24h: STREAM_MAX_UPLOADS_PER_DAY - 1,
      }).allowed,
    ).toBe(true);
    expect(
      evaluateUploadTicketRequest({
        mimeType: "video/mp4",
        sizeBytes: 1,
        activeUploads: 0,
        uploadsLast24h: STREAM_MAX_UPLOADS_PER_DAY,
      }),
    ).toMatchObject({ allowed: false, reason: "daily_limit_reached" });
  });

  it("honors a custom policy override", () => {
    const policy = { ...DEFAULT_STREAM_UPLOAD_POLICY, maxSizeBytes: 10 };
    expect(
      evaluateUploadTicketRequest({ mimeType: "video/mp4", sizeBytes: 11, ...ok, policy }),
    ).toMatchObject({ allowed: false, reason: "too_large" });
  });

  it("fails CLOSED (throws) on non-finite or invalid usage counts", () => {
    for (const bad of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() =>
        evaluateUploadTicketRequest({
          mimeType: "video/mp4",
          sizeBytes: 1,
          activeUploads: bad,
          uploadsLast24h: 0,
        }),
      ).toThrow(/activeUploads/);
      expect(() =>
        evaluateUploadTicketRequest({
          mimeType: "video/mp4",
          sizeBytes: 1,
          activeUploads: 0,
          uploadsLast24h: bad,
        }),
      ).toThrow(/uploadsLast24h/);
    }
  });
});

// ─────────────────────────────── Storage path ───────────────────────────────

describe("stream storage path", () => {
  it("exports the sentinel bucket and segment names", () => {
    expect(STREAM_STORAGE_BUCKET).toBe("cloudflare-stream");
    expect(STREAM_PATH_SEGMENT).toBe("stream");
  });

  it("builds <owner>/stream/<uid> and lowercases the owner uuid", () => {
    expect(buildStreamStoragePath(OWNER.toUpperCase(), UID)).toBe(`${OWNER}/stream/${UID}`);
  });

  it("rejects a non-uuid owner and an invalid uid", () => {
    expect(() => buildStreamStoragePath("not-a-uuid", UID)).toThrow(/owner user id/);
    expect(() => buildStreamStoragePath(OWNER, "../etc/passwd")).toThrow(/video UID/);
    expect(() => buildStreamStoragePath(OWNER, "")).toThrow(/video UID/);
    expect(() => buildStreamStoragePath(OWNER, "a/b")).toThrow(/video UID/);
    expect(() => buildStreamStoragePath(OWNER, "a".repeat(65))).toThrow(/video UID/);
  });

  it("round-trips through parseStreamStoragePath", () => {
    expect(parseStreamStoragePath(buildStreamStoragePath(OWNER, UID))).toEqual({
      ownerUserId: OWNER,
      uid: UID,
    });
  });

  it.each([
    [`${OWNER}/${UID}`],
    [`${OWNER}/stream/${UID}/extra`],
    [`${OWNER}/other/${UID}`],
    [`not-a-uuid/stream/${UID}`],
    [`${OWNER}/stream/bad uid!`],
    [`${OWNER}/stream/..`],
    [42],
    [null],
    [""],
  ])("parse returns null for non-sentinel path %p", (path) => {
    expect(parseStreamStoragePath(path)).toBeNull();
  });

  it("checks ownership strictly and never matches malformed paths", () => {
    const path = buildStreamStoragePath(OWNER, UID);
    expect(streamStoragePathBelongsTo(path, OWNER)).toBe(true);
    expect(streamStoragePathBelongsTo(path, OWNER.toUpperCase())).toBe(true);
    expect(streamStoragePathBelongsTo(path, OTHER_OWNER)).toBe(false);
    expect(streamStoragePathBelongsTo("garbage", OWNER)).toBe(false);
  });

  it("validates uids conservatively (alphanumeric, 6..64)", () => {
    expect(isValidStreamUid(UID)).toBe(true);
    expect(isValidStreamUid("ABCdef123")).toBe(true);
    expect(isValidStreamUid("abc")).toBe(false);
    expect(isValidStreamUid("has-dash")).toBe(false);
    expect(isValidStreamUid(null)).toBe(false);
  });
});

// ─────────────────────────────── Status mapping ─────────────────────────────

describe("cfStateToStreamStatus", () => {
  it.each([
    ["pendingupload", "pending_upload"],
    ["downloading", "processing"],
    ["queued", "processing"],
    ["inprogress", "processing"],
    ["ready", "ready"],
    ["error", "error"],
  ] as const)("maps %s → %s", (state, expected) => {
    expect(cfStateToStreamStatus(state)).toBe(expected);
  });

  it("rejects live-inprogress (no live inputs in v1) and unknown states", () => {
    expect(() => cfStateToStreamStatus("live-inprogress")).toThrow(/live-inprogress/);
    expect(() => cfStateToStreamStatus("exploded")).toThrow(/exploded/);
    expect(() => cfStateToStreamStatus("")).toThrow();
  });

  it("rejects Object.prototype member names (no prototype-chain lookup)", () => {
    for (const poison of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(() => cfStateToStreamStatus(poison)).toThrow(/Unsupported Cloudflare video state/);
    }
    expect(() => parseStreamVideoPayload({ uid: UID, status: { state: "constructor" } })).toThrow(
      /Unsupported Cloudflare video state/,
    );
    // Every documented wire state is either mapped or explicitly rejected.
    for (const state of CLOUDFLARE_VIDEO_STATES) {
      if (state === "live-inprogress") continue;
      expect(STREAM_VIDEO_STATUSES).toContain(cfStateToStreamStatus(state));
    }
  });
});

describe("stream status transitions", () => {
  const MATRIX: Array<[StreamVideoStatus, StreamVideoStatus, boolean]> = [
    ["pending_upload", "pending_upload", true],
    ["pending_upload", "processing", true],
    ["pending_upload", "ready", true],
    ["pending_upload", "error", true],
    ["processing", "processing", true],
    ["processing", "ready", true],
    ["processing", "error", true],
    ["processing", "pending_upload", false],
    ["ready", "ready", true],
    ["ready", "processing", false],
    ["ready", "pending_upload", false],
    ["ready", "error", false],
    ["error", "error", true],
    ["error", "ready", false],
    ["error", "processing", false],
    ["error", "pending_upload", false],
  ];

  it.each(MATRIX)("%s → %s is %s", (from, to, allowed) => {
    expect(canTransitionStreamStatus(from, to)).toBe(allowed);
    if (allowed) {
      expect(() => assertStreamStatusTransition(from, to)).not.toThrow();
    } else {
      expect(() => assertStreamStatusTransition(from, to)).toThrow(
        `A ${from} stream video cannot become ${to}.`,
      );
    }
  });

  it("marks ready and error as terminal", () => {
    expect(isTerminalStreamStatus("ready")).toBe(true);
    expect(isTerminalStreamStatus("error")).toBe(true);
    expect(isTerminalStreamStatus("pending_upload")).toBe(false);
    expect(isTerminalStreamStatus("processing")).toBe(false);
  });
});

// ─────────────────────────────── Media-mix rules ────────────────────────────

describe("assertMediaMixAllowsAdding", () => {
  it("allows a video only onto an empty post", () => {
    expect(() => assertMediaMixAllowsAdding([], "video")).not.toThrow();
    expect(() => assertMediaMixAllowsAdding(["image"], "video")).toThrow(/only media/);
    expect(() => assertMediaMixAllowsAdding(["video"], "video")).toThrow(/only media/);
  });

  it("allows images below the cap on image-only posts", () => {
    expect(() => assertMediaMixAllowsAdding([], "image")).not.toThrow();
    expect(() => assertMediaMixAllowsAdding(Array(9).fill("image"), "image")).not.toThrow();
    expect(() => assertMediaMixAllowsAdding(Array(10).fill("image"), "image")).toThrow(
      /at most 10 images/,
    );
  });

  it("blocks images when a video or audio row exists", () => {
    expect(() => assertMediaMixAllowsAdding(["video"], "image")).toThrow(/cannot be mixed/);
    expect(() => assertMediaMixAllowsAdding(["audio"], "image")).toThrow(/cannot be mixed/);
    expect(() => assertMediaMixAllowsAdding(["image", "video"], "image")).toThrow(
      /cannot be mixed/,
    );
  });

  it("rejects audio uploads outright", () => {
    expect(() => assertMediaMixAllowsAdding([], "audio")).toThrow(/not supported/);
  });
});

// ─────────────────────────────── Publish gate ───────────────────────────────

describe("publishable media", () => {
  it("treats an empty media list as publishable (caption-only posts)", () => {
    expect(evaluatePublishableMedia([])).toEqual({ publishable: true, pending: 0, failed: 0 });
    expect(() => assertPublishableMedia([])).not.toThrow();
  });

  it("is publishable only when every row is ready", () => {
    expect(evaluatePublishableMedia([READY_PROCESSING_STATUS, "ready"])).toEqual({
      publishable: true,
      pending: 0,
      failed: 0,
    });
    expect(evaluatePublishableMedia(["ready", "processing"])).toEqual({
      publishable: false,
      pending: 1,
      failed: 0,
    });
    expect(evaluatePublishableMedia(["ready", "error", "uploading"])).toEqual({
      publishable: false,
      pending: 1,
      failed: 1,
    });
  });

  it("throws distinct messages for processing vs failed media", () => {
    expect(() => assertPublishableMedia(["processing"])).toThrow(/still processing/);
    expect(() => assertPublishableMedia(["error"])).toThrow(/failed processing/);
    // Failed media takes precedence in the message when both exist.
    expect(() => assertPublishableMedia(["processing", "error"])).toThrow(/failed processing/);
  });
});

// ─────────────────────────────── Playback URLs ──────────────────────────────

describe("buildStreamPlaybackUrls", () => {
  const TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYzEyMyJ9.eyJzdWIiOiJ2aWRlbzEifQ.c2lnbmF0dXJl";

  it("builds the four documented URL templates with the token in UID position", () => {
    expect(buildStreamPlaybackUrls(SUBDOMAIN, TOKEN)).toEqual({
      iframe: `https://${SUBDOMAIN}/${TOKEN}/iframe`,
      hls: `https://${SUBDOMAIN}/${TOKEN}/manifest/video.m3u8`,
      dash: `https://${SUBDOMAIN}/${TOKEN}/manifest/video.mpd`,
      thumbnail: `https://${SUBDOMAIN}/${TOKEN}/thumbnails/thumbnail.jpg`,
    });
  });

  it("appends validated thumbnail options", () => {
    const urls = buildStreamPlaybackUrls(SUBDOMAIN, TOKEN, {
      thumbnailTimeSeconds: 2,
      thumbnailHeight: 360,
    });
    expect(urls.thumbnail).toBe(
      `https://${SUBDOMAIN}/${TOKEN}/thumbnails/thumbnail.jpg?time=2s&height=360`,
    );
    expect(
      buildStreamPlaybackUrls(SUBDOMAIN, TOKEN, { thumbnailTimeSeconds: 0 }).thumbnail,
    ).toContain("?time=0s");
  });

  it.each([
    [{ thumbnailTimeSeconds: -1 }],
    [{ thumbnailTimeSeconds: Number.NaN }],
    [{ thumbnailHeight: 0 }],
    [{ thumbnailHeight: 1.5 }],
  ])("rejects invalid thumbnail options %p", (options) => {
    expect(() => buildStreamPlaybackUrls(SUBDOMAIN, TOKEN, options)).toThrow(/thumbnail/i);
  });

  it.each([
    ["CUSTOMER-abc.cloudflarestream.com"],
    ["customer-.cloudflarestream.com"],
    ["evil.com"],
    ["customer-abc.cloudflarestream.com.evil.com"],
    ["https://customer-abc.cloudflarestream.com"],
    ["customer-abc.cloudflarestream.com/path"],
    [""],
  ])("rejects invalid subdomain %p", (subdomain) => {
    expect(isValidCustomerSubdomain(subdomain)).toBe(false);
    expect(() => buildStreamPlaybackUrls(subdomain as string, TOKEN)).toThrow(/subdomain/);
  });

  it.each([[""], ["has space"], ["a/b"], ["a?b"], ["a%2Fb"], ["tok#en"], ["a".repeat(8193)]])(
    "rejects unsafe token %p",
    (token) => {
      expect(isValidPlaybackToken(token)).toBe(false);
      expect(() => buildStreamPlaybackUrls(SUBDOMAIN, token)).toThrow(/token/);
    },
  );

  it("accepts a raw uid-shaped value as a token (charset overlap is deliberate)", () => {
    expect(isValidPlaybackToken(UID)).toBe(true);
  });

  it("accepts a maximum-length (8192) token", () => {
    expect(isValidPlaybackToken("a".repeat(8192))).toBe(true);
  });

  it('rejects the relative-path segments "." and ".."', () => {
    for (const dots of [".", ".."]) {
      expect(isValidPlaybackToken(dots)).toBe(false);
      expect(() => buildStreamPlaybackUrls(SUBDOMAIN, dots)).toThrow(/token/);
    }
    // "..." is a literal path segment, not a traversal — still allowed.
    expect(isValidPlaybackToken("...")).toBe(true);
  });
});

// ─────────────────────────────── Envelope + payload parsing ─────────────────

describe("unwrapCloudflareEnvelope", () => {
  it("returns result on success", () => {
    expect(unwrapCloudflareEnvelope({ result: { a: 1 }, success: true })).toEqual({ a: 1 });
  });

  it("throws with error details on failure envelopes", () => {
    expect(() =>
      unwrapCloudflareEnvelope({
        result: null,
        success: false,
        errors: [{ code: 7003, message: "No route for the URI" }],
        messages: [],
      }),
    ).toThrow(/7003: No route for the URI/);
  });

  it("throws on non-object bodies, missing success, and missing result", () => {
    expect(() => unwrapCloudflareEnvelope("nope")).toThrow(/not a JSON object/);
    expect(() => unwrapCloudflareEnvelope(null)).toThrow(/not a JSON object/);
    expect(() => unwrapCloudflareEnvelope([])).toThrow(/not a JSON object/);
    expect(() => unwrapCloudflareEnvelope({ result: {} })).toThrow(/Cloudflare API error/);
    expect(() => unwrapCloudflareEnvelope({ success: true })).toThrow(/missing result/);
    expect(() => unwrapCloudflareEnvelope({ success: true, result: null })).toThrow(
      /missing result/,
    );
  });

  it("tolerates a failure envelope without an errors array", () => {
    expect(() => unwrapCloudflareEnvelope({ success: false })).toThrow(/Cloudflare API error\./);
  });

  it("tolerates malformed error entries (non-numeric code, missing message)", () => {
    expect(() =>
      unwrapCloudflareEnvelope({ success: false, errors: [{ code: "weird" }, "junk"] }),
    ).toThrow(/\?: /);
  });
});

describe("parseStreamVideoPayload", () => {
  /** Shape mirrors the documented webhook example body (a full video object). */
  const readyPayload = {
    uid: UID,
    readyToStream: true,
    status: { state: "ready", pctComplete: "39.000000", errorReasonCode: "", errorReasonText: "" },
    meta: { name: "My First Stream Video" },
    duration: 5.5,
    size: 4_190_963,
    input: { width: 1280, height: 720 },
    playback: { hls: "https://example.invalid/manifest/video.m3u8" },
  };

  it("parses a ready video into the domain snapshot", () => {
    expect(parseStreamVideoPayload(readyPayload)).toEqual({
      uid: UID,
      status: "ready",
      readyToStream: true,
      durationSeconds: 5.5,
      sizeBytes: 4_190_963,
      width: 1280,
      height: 720,
      errorCode: null,
      errorMessage: null,
      pctComplete: "39.000000",
    });
  });

  it("parses an error video with its documented error fields", () => {
    const snapshot = parseStreamVideoPayload({
      uid: UID,
      readyToStream: false,
      status: {
        state: "error",
        errorReasonCode: "ERR_NON_VIDEO",
        errorReasonText: "The upload is not a video",
      },
    });
    expect(snapshot.status).toBe("error");
    expect(snapshot.errorCode).toBe("ERR_NON_VIDEO");
    expect(snapshot.errorMessage).toBe("The upload is not a video");
  });

  it("maps the -1 unknown sentinels to null", () => {
    const snapshot = parseStreamVideoPayload({
      uid: UID,
      status: { state: "queued" },
      duration: -1,
      input: { width: -1, height: -1 },
    });
    expect(snapshot.durationSeconds).toBeNull();
    expect(snapshot.width).toBeNull();
    expect(snapshot.height).toBeNull();
    expect(snapshot.status).toBe("processing");
  });

  it("treats size:null like every other absent optional", () => {
    const snapshot = parseStreamVideoPayload({
      uid: UID,
      status: { state: "queued" },
      size: null,
    });
    expect(snapshot.sizeBytes).toBeNull();
  });

  it("defaults absent optionals to null/false", () => {
    expect(parseStreamVideoPayload({ uid: UID, status: { state: "pendingupload" } })).toEqual({
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
    });
  });

  it.each([
    ["not an object", "junk"],
    ["missing uid", { status: { state: "ready" } }],
    ["invalid uid", { uid: "../x", status: { state: "ready" } }],
    ["missing status", { uid: UID }],
    ["missing state", { uid: UID, status: {} }],
    ["unknown state", { uid: UID, status: { state: "live-inprogress" } }],
    ["readyToStream wrong type", { uid: UID, status: { state: "ready" }, readyToStream: "yes" }],
    ["duration wrong type", { uid: UID, status: { state: "ready" }, duration: "5.5" }],
    ["size negative", { uid: UID, status: { state: "ready" }, size: -2 }],
    ["size wrong type", { uid: UID, status: { state: "ready" }, size: "big" }],
    ["input wrong type", { uid: UID, status: { state: "ready" }, input: "wide" }],
    ["width wrong type", { uid: UID, status: { state: "ready" }, input: { width: "1280" } }],
    ["errorReasonCode wrong type", { uid: UID, status: { state: "ready", errorReasonCode: 7 } }],
  ])("rejects malformed payload: %s", (_label, payload) => {
    expect(() => parseStreamVideoPayload(payload)).toThrow(/Malformed|Unsupported/);
  });
});

describe("parseStreamTokenResponse", () => {
  it("extracts result.token from the envelope", () => {
    expect(parseStreamTokenResponse({ success: true, result: { token: "abc.def.ghi" } })).toBe(
      "abc.def.ghi",
    );
  });

  it.each([
    [{ success: true, result: {} }],
    [{ success: true, result: { token: "" } }],
    [{ success: true, result: { token: 42 } }],
    [{ success: true, result: { token: "bad/token" } }],
    [{ success: false, errors: [{ code: 10000, message: "Authentication error" }] }],
  ])("rejects malformed token response %p", (json) => {
    expect(() => parseStreamTokenResponse(json)).toThrow();
  });
});

describe("parseTusCreationHeaders", () => {
  it("returns the upload URL and uid from Location + stream-media-id", () => {
    expect(
      parseTusCreationHeaders({
        location: `https://upload.cloudflarestream.com/${UID}?tusv2=true`,
        mediaId: UID,
      }),
    ).toEqual({ uploadUrl: `https://upload.cloudflarestream.com/${UID}?tusv2=true`, uid: UID });
  });

  it.each([
    [{ location: null, mediaId: UID }],
    [{ location: "http://insecure.example.com/x", mediaId: UID }],
    [{ location: "not a url", mediaId: UID }],
    [{ location: "https://ok.example.com/x", mediaId: null }],
    [{ location: "https://ok.example.com/x", mediaId: "bad uid" }],
  ])("rejects malformed creation headers %p", (headers) => {
    expect(() => parseTusCreationHeaders(headers)).toThrow(/Malformed tus creation/);
  });
});

// ─────────────────────────────── Webhook verification ───────────────────────

describe("parseWebhookSignatureHeader", () => {
  const HEX = "60493ec9388b44585a29543bcf0de62e377d4da393246a8b1c901d0e3e672404";

  it("parses the documented example format, keeping the literal time string", () => {
    expect(parseWebhookSignatureHeader(`time=1230811200,sig1=${HEX}`)).toEqual({
      timeRaw: "1230811200",
      timeSeconds: 1230811200,
      signatures: [HEX],
    });
  });

  it("collects multiple sigN values, tolerates spaces, normalizes case", () => {
    const upper = HEX.toUpperCase();
    expect(parseWebhookSignatureHeader(`time=12, sig1=${HEX}, sig2=${upper}`)).toEqual({
      timeRaw: "12",
      timeSeconds: 12,
      signatures: [HEX, HEX],
    });
  });

  it("rejects non-canonical timestamps (leading zeros, oversized)", () => {
    // A re-stringified Number would differ from the literal the sender signed.
    expect(() => parseWebhookSignatureHeader(`time=0876543210,sig1=${HEX}`)).toThrow(/timestamp/);
    expect(() => parseWebhookSignatureHeader(`time=${"9".repeat(13)},sig1=${HEX}`)).toThrow(
      /timestamp/,
    );
  });

  it.each([
    [null],
    [""],
    ["   "],
    [`sig1=${HEX}`],
    ["time=1230811200"],
    [`time=notanumber,sig1=${HEX}`],
    [`time=-5,sig1=${HEX}`],
    ["time=1230811200,sig1=deadbeef"],
    ["time=1230811200,sig1=zz93ec9388b44585a29543bcf0de62e377d4da393246a8b1c901d0e3e672404"],
    [`time=1230811200,rogue=${HEX}`],
    [`=,sig1=${HEX}`],
    ["time=0,sig1=" + HEX],
  ])("throws on malformed header %p", (header) => {
    expect(() => parseWebhookSignatureHeader(header)).toThrow(/signature|Missing/);
  });

  it("exposes the documented header name", () => {
    expect(WEBHOOK_SIGNATURE_HEADER).toBe("Webhook-Signature");
  });
});

describe("webhook timestamp freshness", () => {
  const nowSeconds = Math.floor(NOW_MS / 1000);

  it("is inclusive at exactly the tolerance boundary, both directions", () => {
    expect(isWebhookTimestampFresh(nowSeconds, NOW_MS)).toBe(true);
    expect(isWebhookTimestampFresh(nowSeconds - DEFAULT_WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(
      true,
    );
    expect(
      isWebhookTimestampFresh(nowSeconds - DEFAULT_WEBHOOK_TOLERANCE_SECONDS - 1, NOW_MS),
    ).toBe(false);
    expect(isWebhookTimestampFresh(nowSeconds + DEFAULT_WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(
      true,
    );
    expect(
      isWebhookTimestampFresh(nowSeconds + DEFAULT_WEBHOOK_TOLERANCE_SECONDS + 1, NOW_MS),
    ).toBe(false);
  });

  it("honors a custom tolerance", () => {
    expect(isWebhookTimestampFresh(nowSeconds - 10, NOW_MS, 5)).toBe(false);
    expect(isWebhookTimestampFresh(nowSeconds - 10, NOW_MS, 10)).toBe(true);
  });
});

describe("verifyStreamWebhook", () => {
  const SECRET = "test-webhook-secret";
  const BODY = `{"uid":"${UID}","status":{"state":"ready"}}\n`;
  const hmacSha256Hex = (input: string) => createHmac("sha256", SECRET).update(input).digest("hex");

  function signedHeader(timeSeconds: number, body = BODY): string {
    return `time=${timeSeconds},sig1=${hmacSha256Hex(buildWebhookSigningInput(timeSeconds, body))}`;
  }

  it("accepts a genuinely signed request (real HMAC-SHA256 over time.body)", () => {
    const time = Math.floor(NOW_MS / 1000);
    expect(
      verifyStreamWebhook({
        signatureHeader: signedHeader(time),
        rawBody: BODY,
        nowMs: NOW_MS,
        hmacSha256Hex,
      }),
    ).toEqual({ valid: true });
  });

  it("rejects a tampered body as signature_mismatch", () => {
    const time = Math.floor(NOW_MS / 1000);
    expect(
      verifyStreamWebhook({
        signatureHeader: signedHeader(time),
        rawBody: BODY.replace("ready", "error"),
        nowMs: NOW_MS,
        hmacSha256Hex,
      }),
    ).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("rejects a stale timestamp before computing anything", () => {
    const time = Math.floor(NOW_MS / 1000) - DEFAULT_WEBHOOK_TOLERANCE_SECONDS - 1;
    expect(
      verifyStreamWebhook({
        signatureHeader: signedHeader(time),
        rawBody: BODY,
        nowMs: NOW_MS,
        hmacSha256Hex,
      }),
    ).toEqual({ valid: false, reason: "stale_timestamp" });
  });

  it("rejects malformed headers", () => {
    expect(
      verifyStreamWebhook({
        signatureHeader: "garbage",
        rawBody: BODY,
        nowMs: NOW_MS,
        hmacSha256Hex,
      }),
    ).toEqual({ valid: false, reason: "malformed_header" });
  });

  it("accepts when any one of several signatures matches", () => {
    const time = Math.floor(NOW_MS / 1000);
    const good = hmacSha256Hex(buildWebhookSigningInput(time, BODY));
    const bad = "0".repeat(64);
    expect(
      verifyStreamWebhook({
        signatureHeader: `time=${time},sig1=${bad},sig2=${good}`,
        rawBody: BODY,
        nowMs: NOW_MS,
        hmacSha256Hex,
      }),
    ).toEqual({ valid: true });
  });

  it("builds the signing input exactly as <time>.<body>", () => {
    expect(buildWebhookSigningInput(1230811200, "{}")).toBe("1230811200.{}");
    expect(buildWebhookSigningInput("1230811200", "{}")).toBe("1230811200.{}");
    expect(buildWebhookSigningInput(5, "")).toBe("5.");
  });

  it("forwards a custom toleranceSeconds to the freshness check", () => {
    const time = Math.floor(NOW_MS / 1000) - 10;
    const header = signedHeader(time);
    // 10s-old signature: stale under a 5s tolerance, fresh under the default.
    expect(
      verifyStreamWebhook({
        signatureHeader: header,
        rawBody: BODY,
        nowMs: NOW_MS,
        toleranceSeconds: 5,
        hmacSha256Hex,
      }),
    ).toEqual({ valid: false, reason: "stale_timestamp" });
    expect(
      verifyStreamWebhook({
        signatureHeader: header,
        rawBody: BODY,
        nowMs: NOW_MS,
        hmacSha256Hex,
      }),
    ).toEqual({ valid: true });
  });

  it("compares hex constant-time and rejects length mismatches", () => {
    expect(constantTimeEqualHex("abcd", "abcd")).toBe(true);
    expect(constantTimeEqualHex("abcd", "abce")).toBe(false);
    expect(constantTimeEqualHex("abcd", "abc")).toBe(false);
    expect(constantTimeEqualHex("", "")).toBe(true);
  });
});

// ─────────────────────────────── tus metadata ───────────────────────────────

describe("encodeBase64", () => {
  it.each([
    // Vectors taken verbatim from the official Cloudflare docs / OpenAPI spec.
    ["600", "NjAw"],
    ["2024-02-27T07:20:50Z", "MjAyNC0wMi0yN1QwNzoyMDo1MFo="],
    ["example.com,test.com", "ZXhhbXBsZS5jb20sdGVzdC5jb20="],
    ["hello world", "aGVsbG8gd29ybGQ="],
    ["", ""],
    ["a", "YQ=="],
    ["ab", "YWI="],
    ["abc", "YWJj"],
    ["é", "w6k="],
    ["€", "4oKs"],
    ["🎬", "8J+OrA=="],
  ])("encodes %p → %p", (input, expected) => {
    expect(encodeBase64(input)).toBe(expected);
  });

  it("replaces unpaired surrogates with U+FFFD (matches TextEncoder, valid UTF-8)", () => {
    // U+FFFD is EF BF BD → "77+9"; a raw lone surrogate would be invalid UTF-8.
    expect(encodeBase64("\uD800")).toBe("77+9");
    expect(encodeBase64("\uDFFF")).toBe("77+9");
    expect(encodeBase64("abc\uD83C")).toBe(encodeBase64("abc�"));
    // Properly paired surrogates still encode as the real code point.
    expect(encodeBase64("🎬")).toBe("8J+OrA==");
  });
});

describe("buildTusUploadMetadata", () => {
  it("reproduces the documented example header verbatim", () => {
    expect(
      buildTusUploadMetadata({
        maxDurationSeconds: 600,
        requireSignedUrls: true,
        expiry: "2024-02-27T07:20:50Z",
      }),
    ).toBe("maxDurationSeconds NjAw,requiresignedurls,expiry MjAyNC0wMi0yN1QwNzoyMDo1MFo=");
  });

  it("encodes allowed origins comma-joined and names base64-encoded", () => {
    expect(
      buildTusUploadMetadata({
        maxDurationSeconds: 600,
        requireSignedUrls: false,
        allowedOrigins: ["example.com", "test.com"],
        name: "hello world",
      }),
    ).toBe(
      "maxDurationSeconds NjAw,allowedorigins ZXhhbXBsZS5jb20sdGVzdC5jb20=,name aGVsbG8gd29ybGQ=",
    );
  });

  it("omits the requiresignedurls flag when false and skips empty origin lists", () => {
    const header = buildTusUploadMetadata({
      maxDurationSeconds: 1,
      requireSignedUrls: false,
      allowedOrigins: [],
    });
    expect(header).toBe(`maxDurationSeconds ${encodeBase64("1")}`);
  });

  it("accepts the documented duration bounds and rejects outside them", () => {
    expect(() =>
      buildTusUploadMetadata({ maxDurationSeconds: 36000, requireSignedUrls: true }),
    ).not.toThrow();
    for (const bad of [0, 36001, 1.5, Number.NaN]) {
      expect(() =>
        buildTusUploadMetadata({ maxDurationSeconds: bad, requireSignedUrls: true }),
      ).toThrow(/maxDurationSeconds/);
    }
  });

  it("rejects malformed expiry, origins, and names", () => {
    const base = { maxDurationSeconds: 600, requireSignedUrls: true };
    expect(() => buildTusUploadMetadata({ ...base, expiry: "tomorrow" })).toThrow(/RFC3339/);
    expect(() => buildTusUploadMetadata({ ...base, expiry: "2024-02-27 07:20:50" })).toThrow(
      /RFC3339/,
    );
    expect(() => buildTusUploadMetadata({ ...base, allowedOrigins: ["a,b"] })).toThrow(/origin/i);
    expect(() => buildTusUploadMetadata({ ...base, allowedOrigins: ["has space.com"] })).toThrow(
      /origin/i,
    );
    expect(() => buildTusUploadMetadata({ ...base, allowedOrigins: [""] })).toThrow(/origin/i);
    expect(() => buildTusUploadMetadata({ ...base, name: "" })).toThrow(/name/);
    expect(() => buildTusUploadMetadata({ ...base, name: "x".repeat(1025) })).toThrow(/name/);
  });

  it("accepts a maximum-length (1024) name", () => {
    expect(() =>
      buildTusUploadMetadata({
        maxDurationSeconds: 600,
        requireSignedUrls: true,
        name: "x".repeat(1024),
      }),
    ).not.toThrow();
  });

  it("accepts an offset-timezone RFC3339 expiry", () => {
    expect(() =>
      buildTusUploadMetadata({
        maxDurationSeconds: 600,
        requireSignedUrls: true,
        expiry: "2026-07-12T07:20:50+02:00",
      }),
    ).not.toThrow();
  });
});

describe("tus chunk sizes", () => {
  it("exposes the documented byte constants", () => {
    expect(TUS_MIN_CHUNK_BYTES).toBe(5_242_880);
    expect(TUS_RECOMMENDED_CHUNK_BYTES).toBe(52_428_800);
    expect(TUS_MAX_CHUNK_BYTES).toBe(209_715_200);
    expect(TUS_CHUNK_MULTIPLE_BYTES).toBe(256 * 1024);
  });

  it("validates the documented rules (min, max, 256 KiB multiple)", () => {
    expect(isValidTusChunkSize(TUS_MIN_CHUNK_BYTES)).toBe(true);
    expect(isValidTusChunkSize(TUS_RECOMMENDED_CHUNK_BYTES)).toBe(true);
    expect(isValidTusChunkSize(TUS_MAX_CHUNK_BYTES)).toBe(true);
    expect(isValidTusChunkSize(TUS_MIN_CHUNK_BYTES - TUS_CHUNK_MULTIPLE_BYTES)).toBe(false);
    expect(isValidTusChunkSize(TUS_MAX_CHUNK_BYTES + TUS_CHUNK_MULTIPLE_BYTES)).toBe(false);
    expect(isValidTusChunkSize(TUS_RECOMMENDED_CHUNK_BYTES + 1)).toBe(false);
    expect(isValidTusChunkSize(0)).toBe(false);
    expect(isValidTusChunkSize(1.5)).toBe(false);
  });
});

// ─────────────────────────────── Orphan selection ───────────────────────────

describe("selectOrphanCandidates", () => {
  const HOUR = 60 * 60 * 1000;

  function row(overrides: Partial<OrphanCandidateRow> = {}): OrphanCandidateRow {
    return {
      id: "sv1",
      status: "pending_upload",
      createdAt: NOW,
      uploadExpiresAt: null,
      attached: false,
      ...overrides,
    };
  }

  function at(offsetMs: number): string {
    return new Date(NOW_MS + offsetMs).toISOString();
  }

  it("selects pending rows whose upload URL has expired", () => {
    const expired = row({ uploadExpiresAt: at(-1) });
    const live = row({ id: "sv2", uploadExpiresAt: at(+HOUR) });
    expect(selectOrphanCandidates([expired, live], NOW_MS)).toEqual([
      { row: expired, reason: "upload_expired" },
    ]);
  });

  it("selects expiry-less pending rows only after the grace period", () => {
    const fresh = row({ createdAt: at(-DEFAULT_ORPHAN_GRACE.pendingMs) });
    const stale = row({ id: "sv2", createdAt: at(-DEFAULT_ORPHAN_GRACE.pendingMs - 1) });
    expect(selectOrphanCandidates([fresh, stale], NOW_MS)).toEqual([
      { row: stale, reason: "stale_pending" },
    ]);
  });

  it("selects failed rows after grace, keeping fresh failures visible", () => {
    const freshError = row({ status: "error", createdAt: at(-1) });
    const oldError = row({
      id: "sv2",
      status: "error",
      createdAt: at(-DEFAULT_ORPHAN_GRACE.errorMs - 1),
    });
    expect(selectOrphanCandidates([freshError, oldError], NOW_MS)).toEqual([
      { row: oldError, reason: "failed" },
    ]);
  });

  it("selects ready-but-never-attached rows after grace; never attached ones", () => {
    const attached = row({
      status: "ready",
      attached: true,
      createdAt: at(-30 * 24 * HOUR),
    });
    const unattached = row({
      id: "sv2",
      status: "ready",
      createdAt: at(-DEFAULT_ORPHAN_GRACE.readyUnattachedMs - 1),
    });
    const freshUnattached = row({
      id: "sv3",
      status: "ready",
      createdAt: at(-DEFAULT_ORPHAN_GRACE.readyUnattachedMs),
    });
    expect(selectOrphanCandidates([attached, unattached, freshUnattached], NOW_MS)).toEqual([
      { row: unattached, reason: "never_attached" },
    ]);
  });

  it("selects processing rows only when stuck past the long grace", () => {
    const encoding = row({ status: "processing", createdAt: at(-HOUR) });
    const stuck = row({
      id: "sv2",
      status: "processing",
      createdAt: at(-DEFAULT_ORPHAN_GRACE.processingStuckMs - 1),
    });
    expect(selectOrphanCandidates([encoding, stuck], NOW_MS)).toEqual([
      { row: stuck, reason: "stuck_processing" },
    ]);
  });

  it("never selects ATTACHED rows, whatever their status or age", () => {
    const ancient = at(-365 * 24 * HOUR);
    const attachedRows: OrphanCandidateRow[] = [
      row({ status: "error", attached: true, createdAt: ancient }),
      row({ id: "sv2", status: "processing", attached: true, createdAt: ancient }),
      row({ id: "sv3", status: "pending_upload", attached: true, uploadExpiresAt: at(-HOUR) }),
      row({ id: "sv4", status: "pending_upload", attached: true, createdAt: ancient }),
      row({ id: "sv5", status: "ready", attached: true, createdAt: ancient }),
    ];
    expect(selectOrphanCandidates(attachedRows, NOW_MS)).toEqual([]);
  });

  it("never selects rows with unparseable timestamps and never mutates input", () => {
    const junkCreated = row({ createdAt: "not a date" });
    const junkExpiry = row({ id: "sv2", uploadExpiresAt: "not a date" });
    const rows = [junkCreated, junkExpiry];
    expect(selectOrphanCandidates(rows, NOW_MS)).toEqual([]);
    expect(rows).toEqual([junkCreated, junkExpiry]);
    expect(selectOrphanCandidates([], NOW_MS)).toEqual([]);
  });

  it("honors custom grace periods", () => {
    const grace = { ...DEFAULT_ORPHAN_GRACE, errorMs: 0 };
    const failed = row({ status: "error", createdAt: at(-1) });
    expect(selectOrphanCandidates([failed], NOW_MS, grace)).toEqual([
      { row: failed, reason: "failed" },
    ]);
  });
});
