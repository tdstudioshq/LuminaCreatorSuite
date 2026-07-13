// Route-level tests for the Cloudflare Stream webhook: real Request/Response
// objects through handleStreamWebhookRequest with injected env, clock, HMAC
// (real node:crypto — no network), and a recording fake DB. No real Cloudflare
// endpoint, Supabase instance, or webhook registration is touched.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { StreamVideoStatus } from "@/lib/cabana-stream";
import type { OwnedVideoRow } from "@/lib/stream-actions";
import {
  type StreamWebhookDb,
  handleStreamWebhookRequest,
  requireStreamWebhookSecret,
} from "@/lib/stream-webhook.server";

const SECRET = "whsec_test_0123456789abcdef";
const ENV = { CLOUDFLARE_STREAM_WEBHOOK_SECRET: SECRET };
const NOW_MS = 1_752_300_000_000; // fixed clock
const NOW_SEC = Math.floor(NOW_MS / 1000);
const UID = "31c9pdcbdb904dcd90f9c4a41b1cf9f8";
const ROUTE_URL = "https://cabanagrp.com/api/webhooks/stream";

function hmacHex(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

function signatureFor(rawBody: string, timeSec: number = NOW_SEC, secret: string = SECRET): string {
  return `time=${timeSec},sig1=${hmacHex(secret, `${timeSec}.${rawBody}`)}`;
}

function cfBody(state: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    uid: UID,
    status: { state },
    readyToStream: state === "ready",
    ...extra,
  });
}

function makeRequest(body: string, signature?: string | null, method = "POST"): Request {
  return new Request(ROUTE_URL, {
    method,
    body: method === "GET" || method === "HEAD" ? undefined : body,
    headers: signature ? { "Webhook-Signature": signature } : {},
  });
}

type Recorded = {
  videoUpdates: {
    id: string;
    guardStatus: StreamVideoStatus;
    patch: Record<string, unknown>;
  }[];
  mediaUpdates: { streamVideoId: string; patch: Record<string, unknown> }[];
  lookups: string[];
};

function fakeDb(
  row: OwnedVideoRow | null,
  options: { updateMatches?: boolean; failFind?: boolean; failUpdate?: boolean } = {},
): { db: StreamWebhookDb; recorded: Recorded } {
  const recorded: Recorded = { videoUpdates: [], mediaUpdates: [], lookups: [] };
  const db: StreamWebhookDb = {
    async findVideoByUid(uid) {
      recorded.lookups.push(uid);
      if (options.failFind) throw new Error("db down");
      return row;
    },
    async applyVideoUpdate(id, guardStatus, patch) {
      if (options.failUpdate) throw new Error("db down");
      recorded.videoUpdates.push({ id, guardStatus, patch });
      return options.updateMatches ?? true;
    },
    async applyMediaUpdate(streamVideoId, patch) {
      recorded.mediaUpdates.push({ streamVideoId, patch });
    },
  };
  return { db, recorded };
}

function videoRow(
  status: StreamVideoStatus,
  overrides: Partial<OwnedVideoRow> = {},
): OwnedVideoRow {
  return {
    id: "9f4d2e6a-1b3c-4d5e-8f7a-0b1c2d3e4f5a",
    uid: UID,
    status,
    duration_seconds: null,
    width: null,
    height: null,
    error_code: null,
    error_message: null,
    ready_at: null,
    ...overrides,
  };
}

function run(
  request: Request,
  db: StreamWebhookDb,
  extra: { env?: Record<string, string | undefined>; log?: (m: string) => void } = {},
): Promise<Response> {
  return handleStreamWebhookRequest(request, {
    env: extra.env ?? ENV,
    nowMs: () => NOW_MS,
    db,
    log: extra.log ?? (() => {}),
  });
}

describe("requireStreamWebhookSecret", () => {
  it("returns the secret when present", () => {
    expect(requireStreamWebhookSecret(ENV)).toBe(SECRET);
  });

  it("throws naming only the variable when missing", () => {
    expect(() => requireStreamWebhookSecret({})).toThrowError(/CLOUDFLARE_STREAM_WEBHOOK_SECRET/);
    try {
      requireStreamWebhookSecret({});
    } catch (e) {
      expect((e as Error).message).not.toContain(SECRET);
    }
  });

  it("rejects placeholder-length values without echoing them", () => {
    try {
      requireStreamWebhookSecret({ CLOUDFLARE_STREAM_WEBHOOK_SECRET: "short" });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain("CLOUDFLARE_STREAM_WEBHOOK_SECRET");
      expect((e as Error).message).not.toContain("short");
    }
  });

  it("never reads STREAM_SIGNING_KEY_ID", () => {
    const reads: string[] = [];
    const spyEnv = new Proxy(
      { ...ENV },
      {
        get(target, prop) {
          if (typeof prop === "string") reads.push(prop);
          return (target as Record<string, string>)[prop as string];
        },
      },
    );
    requireStreamWebhookSecret(spyEnv as Record<string, string | undefined>);
    expect(reads).not.toContain("STREAM_SIGNING_KEY_ID");
    expect(reads).toEqual(["CLOUDFLARE_STREAM_WEBHOOK_SECRET"]);
  });
});

describe("signature verification (route level)", () => {
  it("accepts a valid signature and returns 200", async () => {
    const body = cfBody("inprogress");
    const { db } = fakeDb(videoRow("pending_upload"));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("rejects an invalid signature with 401", async () => {
    const body = cfBody("ready");
    const { db, recorded } = fakeDb(videoRow("processing"));
    const wrong = `time=${NOW_SEC},sig1=${"0".repeat(64)}`;
    const res = await run(makeRequest(body, wrong), db);
    expect(res.status).toBe(401);
    expect(recorded.lookups).toEqual([]); // rejected before any DB access
  });

  it("rejects a missing signature header with 401", async () => {
    const body = cfBody("ready");
    const { db, recorded } = fakeDb(videoRow("processing"));
    const res = await run(makeRequest(body, null), db);
    expect(res.status).toBe(401);
    expect(recorded.lookups).toEqual([]);
  });

  it("rejects a malformed signature header with 401", async () => {
    const body = cfBody("ready");
    const { db } = fakeDb(videoRow("processing"));
    for (const header of ["garbage", "time=abc,sig1=ff", "sig1=zz", "time=123"]) {
      const res = await run(makeRequest(body, header), db);
      expect(res.status).toBe(401);
    }
  });

  it("accepts when any of multiple sigN values matches", async () => {
    const body = cfBody("inprogress");
    const good = hmacHex(SECRET, `${NOW_SEC}.${body}`);
    const header = `time=${NOW_SEC},sig1=${"a".repeat(64)},sig2=${good}`;
    const { db } = fakeDb(videoRow("pending_upload"));
    const res = await run(makeRequest(body, header), db);
    expect(res.status).toBe(200);
  });

  it("rejects when all of multiple sigN values mismatch", async () => {
    const body = cfBody("inprogress");
    const header = `time=${NOW_SEC},sig1=${"a".repeat(64)},sig2=${"b".repeat(64)}`;
    const { db } = fakeDb(videoRow("pending_upload"));
    const res = await run(makeRequest(body, header), db);
    expect(res.status).toBe(401);
  });

  it("rejects a stale timestamp outside the 300s tolerance", async () => {
    const body = cfBody("ready");
    const { db } = fakeDb(videoRow("processing"));
    const res = await run(makeRequest(body, signatureFor(body, NOW_SEC - 301)), db);
    expect(res.status).toBe(401);
    // Boundary: exactly 300s old is still fresh.
    const boundary = await run(makeRequest(body, signatureFor(body, NOW_SEC - 300)), db);
    expect(boundary.status).toBe(200);
  });

  it("rejects a future timestamp outside the tolerance", async () => {
    const body = cfBody("ready");
    const { db } = fakeDb(videoRow("processing"));
    const res = await run(makeRequest(body, signatureFor(body, NOW_SEC + 301)), db);
    expect(res.status).toBe(401);
  });

  it("signs the header's literal time string, not a re-parsed number", async () => {
    const body = cfBody("inprogress");
    // Sign with one time but present another in the header: must fail even
    // though both are fresh — proving the literal header string is the input.
    const sig = hmacHex(SECRET, `${NOW_SEC - 10}.${body}`);
    const header = `time=${NOW_SEC},sig1=${sig}`;
    const { db } = fakeDb(videoRow("pending_upload"));
    const res = await run(makeRequest(body, header), db);
    expect(res.status).toBe(401);
  });

  it("rejects a tampered body with 401", async () => {
    const body = cfBody("ready");
    const signature = signatureFor(body);
    const tampered = body.replace('"ready"', '"error"');
    const { db } = fakeDb(videoRow("processing"));
    const res = await run(makeRequest(tampered, signature), db);
    expect(res.status).toBe(401);
  });
});

describe("payload validation", () => {
  it("rejects invalid JSON with 400 (after a valid signature)", async () => {
    const body = "{not json";
    const { db } = fakeDb(videoRow("processing"));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(400);
  });

  it("rejects malformed Cloudflare video objects with 400", async () => {
    const { db, recorded } = fakeDb(videoRow("processing"));
    const bad = [
      JSON.stringify({ status: { state: "ready" } }), // no uid
      JSON.stringify({ uid: UID }), // no status.state
      JSON.stringify({ uid: UID, status: { state: 5 } }),
      JSON.stringify({ uid: UID, status: { state: "ready" }, readyToStream: "yes" }),
      JSON.stringify([1, 2, 3]),
    ];
    for (const body of bad) {
      const res = await run(makeRequest(body, signatureFor(body)), db);
      expect(res.status).toBe(400);
    }
    expect(recorded.lookups).toEqual([]);
  });

  it("rejects live-input states with 400 (CABANA has no livestreaming)", async () => {
    const body = cfBody("live-inprogress");
    const { db, recorded } = fakeDb(videoRow("processing"));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(400);
    expect(recorded.videoUpdates).toEqual([]);
  });
});

describe("unknown UID", () => {
  it("returns 200, creates nothing, attaches nothing, logs server-side only", async () => {
    const body = cfBody("ready");
    const { db, recorded } = fakeDb(null);
    const logs: string[] = [];
    const res = await run(makeRequest(body, signatureFor(body)), db, {
      log: (m) => logs.push(m),
    });
    expect(res.status).toBe(200); // no retry amplification
    expect(recorded.videoUpdates).toEqual([]);
    expect(recorded.mediaUpdates).toEqual([]);
    const responseText = JSON.stringify(await res.json());
    expect(responseText).not.toContain(UID); // no identifiers in the body
    expect(logs.some((l) => l.includes("ignored"))).toBe(true);
  });
});

describe("lifecycle transitions", () => {
  it("pending_upload → processing updates the row and linked media", async () => {
    const body = cfBody("inprogress", {
      duration: -1,
      size: 1024,
      input: { width: -1, height: -1 },
    });
    const row = videoRow("pending_upload");
    const { db, recorded } = fakeDb(row);
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(recorded.videoUpdates).toHaveLength(1);
    expect(recorded.videoUpdates[0]).toMatchObject({
      id: row.id,
      guardStatus: "pending_upload",
      patch: { status: "processing", size_bytes: 1024, duration_seconds: null, ready_at: null },
    });
    expect(recorded.mediaUpdates).toEqual([
      {
        streamVideoId: row.id,
        patch: { processing_status: "processing", width: null, height: null },
      },
    ]);
  });

  it("processing → ready sets ready_at, dimensions, duration, size and clears errors", async () => {
    const body = cfBody("ready", {
      duration: 12.5,
      size: 4_000_000,
      input: { width: 1920, height: 1080 },
    });
    const row = videoRow("processing", { error_code: "stale", error_message: "stale" });
    const { db, recorded } = fakeDb(row);
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    const update = recorded.videoUpdates[0];
    expect(update.guardStatus).toBe("processing");
    expect(update.patch).toEqual({
      status: "ready",
      duration_seconds: 12.5,
      size_bytes: 4_000_000,
      width: 1920,
      height: 1080,
      error_code: null, // stale error fields cleared
      error_message: null,
      ready_at: new Date(NOW_MS).toISOString(),
    });
    expect(recorded.mediaUpdates).toEqual([
      { streamVideoId: row.id, patch: { processing_status: "ready", width: 1920, height: 1080 } },
    ]);
  });

  it("processing → error persists safe error fields", async () => {
    const body = cfBody("error", {
      status: { state: "error", errorReasonCode: "ERR_DURATION", errorReasonText: "Too long" },
    });
    const row = videoRow("processing");
    const { db, recorded } = fakeDb(row);
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(recorded.videoUpdates[0].patch).toMatchObject({
      status: "error",
      error_code: "ERR_DURATION",
      error_message: "Too long",
      ready_at: null,
    });
    expect(recorded.mediaUpdates[0].patch.processing_status).toBe("error");
  });

  it("duplicate ready event is a 200 no-op (terminal row skips everything)", async () => {
    const body = cfBody("ready");
    const { db, recorded } = fakeDb(videoRow("ready", { ready_at: "2026-07-12T00:00:00Z" }));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(recorded.videoUpdates).toEqual([]);
    expect(recorded.mediaUpdates).toEqual([]);
  });

  it("duplicate error event is a 200 no-op", async () => {
    const body = cfBody("error");
    const { db, recorded } = fakeDb(videoRow("error", { error_code: "X" }));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(recorded.videoUpdates).toEqual([]);
  });

  it("processing cannot overwrite ready", async () => {
    const body = cfBody("inprogress");
    const { db, recorded } = fakeDb(videoRow("ready"));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(recorded.videoUpdates).toEqual([]);
  });

  it("processing cannot overwrite error", async () => {
    const body = cfBody("queued");
    const { db, recorded } = fakeDb(videoRow("error"));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(recorded.videoUpdates).toEqual([]);
  });

  it("error cannot overwrite ready", async () => {
    const body = cfBody("error");
    const { db, recorded } = fakeDb(videoRow("ready"));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(recorded.videoUpdates).toEqual([]);
  });

  it("ready cannot overwrite error (both terminal states are locked)", async () => {
    const body = cfBody("ready");
    const { db, recorded } = fakeDb(videoRow("error"));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(recorded.videoUpdates).toEqual([]);
  });

  it("pending cannot overwrite processing, ready, or error", async () => {
    const body = cfBody("pendingupload");
    for (const status of ["processing", "ready", "error"] as const) {
      const { db, recorded } = fakeDb(videoRow(status));
      const res = await run(makeRequest(body, signatureFor(body)), db);
      expect(res.status).toBe(200);
      expect(recorded.videoUpdates).toEqual([]);
    }
  });

  it("same-state processing update is applied (idempotent progress refresh)", async () => {
    const body = cfBody("inprogress", { size: 2048 });
    const { db, recorded } = fakeDb(videoRow("processing"));
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200);
    expect(recorded.videoUpdates).toHaveLength(1);
    expect(recorded.videoUpdates[0].patch.status).toBe("processing");
  });
});

describe("race safety", () => {
  it("a lost compare-and-set race returns 200 and never syncs media", async () => {
    // Simulates the poller winning between our read and our guarded UPDATE
    // (e.g. it recorded `ready` first): the guard matches nothing.
    const body = cfBody("inprogress");
    const { db, recorded } = fakeDb(videoRow("pending_upload"), { updateMatches: false });
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(200); // idempotent: the winner's state stands
    expect(recorded.videoUpdates).toHaveLength(1); // attempted, guarded
    expect(recorded.mediaUpdates).toEqual([]); // no media write after a lost race
  });

  it("the guard is the read status — enforced in the update, not a pre-read", async () => {
    const body = cfBody("ready");
    const row = videoRow("processing");
    const { db, recorded } = fakeDb(row);
    await run(makeRequest(body, signatureFor(body)), db);
    expect(recorded.videoUpdates[0].guardStatus).toBe("processing");
  });
});

describe("post_media synchronization boundaries", () => {
  it("touches only processing_status, width, and height", async () => {
    const body = cfBody("ready", { input: { width: 1280, height: 720 } });
    const row = videoRow("processing");
    const { db, recorded } = fakeDb(row);
    await run(makeRequest(body, signatureFor(body)), db);
    expect(Object.keys(recorded.mediaUpdates[0].patch).sort()).toEqual([
      "height",
      "processing_status",
      "width",
    ]);
    expect(recorded.mediaUpdates[0].streamVideoId).toBe(row.id);
  });

  it("width/height come only from the normalized Cloudflare snapshot (-1 → null)", async () => {
    const body = cfBody("ready", { input: { width: -1, height: -1 } });
    const { db, recorded } = fakeDb(videoRow("processing"));
    await run(makeRequest(body, signatureFor(body)), db);
    expect(recorded.mediaUpdates[0].patch).toMatchObject({ width: null, height: null });
  });
});

describe("failure handling and non-disclosure", () => {
  it("a database failure on lookup returns a safe 500", async () => {
    const body = cfBody("ready");
    const { db } = fakeDb(videoRow("processing"), { failFind: true });
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" }); // no raw DB error
  });

  it("a database failure on update returns a safe 500 (Cloudflare will retry)", async () => {
    const body = cfBody("ready");
    const { db } = fakeDb(videoRow("processing"), { failUpdate: true });
    const res = await run(makeRequest(body, signatureFor(body)), db);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
  });

  it("a missing webhook secret returns 500 without echoing anything", async () => {
    const body = cfBody("ready");
    const { db, recorded } = fakeDb(videoRow("processing"));
    const logs: string[] = [];
    const res = await handleStreamWebhookRequest(makeRequest(body, signatureFor(body)), {
      env: {},
      nowMs: () => NOW_MS,
      db,
      log: (m) => logs.push(m),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
    expect(recorded.lookups).toEqual([]);
    expect(logs.join(" ")).toContain("CLOUDFLARE_STREAM_WEBHOOK_SECRET"); // variable name only
  });

  it("no secret value ever appears in responses or logs", async () => {
    const logs: string[] = [];
    const cases: [string, string | null][] = [
      [cfBody("ready"), null], // 401
      ["{broken", signatureFor("{broken")], // 400
      [cfBody("ready"), signatureFor(cfBody("ready"))], // 200/500 paths
    ];
    for (const [body, sig] of cases) {
      const { db } = fakeDb(null, { failFind: body === cfBody("ready") && sig !== null });
      const res = await run(makeRequest(body, sig), db, { log: (m) => logs.push(m) });
      const text = await res.text();
      expect(text).not.toContain(SECRET);
      expect(text.toLowerCase()).not.toContain("authorization");
    }
    expect(logs.join("\n")).not.toContain(SECRET);
  });
});

describe("route method handling", () => {
  it("POST is accepted (200 on a valid signed event)", async () => {
    const body = cfBody("inprogress");
    const { db } = fakeDb(videoRow("pending_upload"));
    const res = await run(makeRequest(body, signatureFor(body), "POST"), db);
    expect(res.status).toBe(200);
  });

  it("unsigned POST returns 401", async () => {
    const { db } = fakeDb(videoRow("processing"));
    const res = await run(makeRequest(cfBody("ready"), null, "POST"), db);
    expect(res.status).toBe(401);
  });

  it("non-POST methods are rejected with 405 by the handler belt", async () => {
    const { db, recorded } = fakeDb(videoRow("processing"));
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const res = await run(makeRequest(cfBody("ready"), null, method), db);
      expect(res.status).toBe(405);
    }
    expect(recorded.lookups).toEqual([]);
  });
});
