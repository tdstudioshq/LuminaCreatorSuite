import { describe, expect, it } from "vitest";
import { createCloudflareStreamRepository, requireStreamEnv } from "@/lib/stream-cloudflare.server";

// Entirely fake values — no real account ids, tokens, or subdomains.
const FAKE_ENV = {
  CLOUDFLARE_ACCOUNT_ID: "abcdef0123456789abcdef0123456789",
  CLOUDFLARE_STREAM_TOKEN: "fake-token-fake-token-fake-token",
  CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN: "customer-testcode123.cloudflarestream.com",
};
const UID = "6b9e68b07dfee8cc2d116e4c51d6a957";
const BASE = `https://api.cloudflare.com/client/v4/accounts/${FAKE_ENV.CLOUDFLARE_ACCOUNT_ID}/stream`;

type Call = { url: string; init: RequestInit };

/** fetch fake: records calls, replays canned responses in order. */
function fakeFetch(...responses: Response[]) {
  const calls: Call[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("fakeFetch: no response queued");
    return next;
  }) as typeof fetch;
  return { calls, impl };
}

function repoWith(f: typeof fetch, nowMs?: () => number) {
  return createCloudflareStreamRepository({ env: FAKE_ENV, fetchImpl: f, nowMs });
}

describe("requireStreamEnv", () => {
  it("returns the three validated values", () => {
    expect(requireStreamEnv(FAKE_ENV)).toEqual({
      accountId: FAKE_ENV.CLOUDFLARE_ACCOUNT_ID,
      apiToken: FAKE_ENV.CLOUDFLARE_STREAM_TOKEN,
      customerSubdomain: FAKE_ENV.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN,
    });
  });

  it.each([
    ["CLOUDFLARE_ACCOUNT_ID"],
    ["CLOUDFLARE_STREAM_TOKEN"],
    ["CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN"],
  ] as const)("names %s when missing, without echoing any value", (name) => {
    const env = { ...FAKE_ENV, [name]: undefined };
    try {
      requireStreamEnv(env);
      expect.unreachable("should have thrown");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain(name);
      expect(message).not.toContain(FAKE_ENV.CLOUDFLARE_STREAM_TOKEN);
      expect(message).not.toContain(FAKE_ENV.CLOUDFLARE_ACCOUNT_ID);
    }
  });

  it("rejects malformed values by NAME, never echoing the value", () => {
    for (const [key, bad] of [
      ["CLOUDFLARE_ACCOUNT_ID", "not valid!"],
      ["CLOUDFLARE_STREAM_TOKEN", "short"],
      ["CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN", "https://customer-x.cloudflarestream.com"],
    ] as const) {
      try {
        requireStreamEnv({ ...FAKE_ENV, [key]: bad });
        expect.unreachable("should have thrown");
      } catch (e) {
        const message = (e as Error).message;
        expect(message).toContain(key);
        expect(message).not.toContain(bad);
      }
    }
  });

  it("never reads STREAM_SIGNING_KEY_ID", () => {
    const reads: string[] = [];
    const spyEnv = new Proxy({ ...FAKE_ENV } as Record<string, string | undefined>, {
      get(target, prop: string) {
        reads.push(prop);
        return target[prop];
      },
    });
    requireStreamEnv(spyEnv);
    expect(reads).not.toContain("STREAM_SIGNING_KEY_ID");
    expect(reads).not.toContain("CLOUDFLARE_STREAM_WEBHOOK_SECRET");
  });
});

describe("createDirectUpload", () => {
  it("sends the documented tus creation request and parses the two headers", async () => {
    const { calls, impl } = fakeFetch(
      new Response(null, {
        status: 201,
        headers: {
          location: `https://upload.cloudflarestream.com/${UID}?tusv2=true`,
          "stream-media-id": UID,
        },
      }),
    );
    const result = await repoWith(impl).createDirectUpload({
      sizeBytes: 1024,
      constraints: {
        maxDurationSeconds: 600,
        requireSignedUrls: true,
        expiry: "2026-07-12T07:20:50Z",
        name: "clip",
      },
      creator: "creator-profile-id",
    });
    expect(result).toEqual({
      uploadUrl: `https://upload.cloudflarestream.com/${UID}?tusv2=true`,
      uid: UID,
    });
    expect(calls[0].url).toBe(`${BASE}?direct_user=true`);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Tus-Resumable"]).toBe("1.0.0");
    expect(headers["Upload-Length"]).toBe("1024");
    expect(headers["Upload-Creator"]).toBe("creator-profile-id");
    expect(headers["Upload-Metadata"]).toContain("maxDurationSeconds NjAw");
    expect(headers["Upload-Metadata"]).toContain("requiresignedurls");
    expect(headers.Authorization).toBe(`Bearer ${FAKE_ENV.CLOUDFLARE_STREAM_TOKEN}`);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects invalid sizes before any network call", async () => {
    const { calls, impl } = fakeFetch();
    await expect(
      repoWith(impl).createDirectUpload({
        sizeBytes: 0,
        constraints: { maxDurationSeconds: 600, requireSignedUrls: true },
      }),
    ).rejects.toThrow(/positive integer/);
    expect(calls.length).toBe(0);
  });

  it("maps a non-201 to a safe error that never leaks the token", async () => {
    const { impl } = fakeFetch(
      new Response(JSON.stringify({ errors: [{ code: 10000, message: "Authentication error" }] }), {
        status: 403,
      }),
    );
    try {
      await repoWith(impl).createDirectUpload({
        sizeBytes: 1,
        constraints: { maxDurationSeconds: 600, requireSignedUrls: true },
      });
      expect.unreachable("should have thrown");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("HTTP 403");
      expect(message).toContain("Authentication error");
      expect(message).not.toContain(FAKE_ENV.CLOUDFLARE_STREAM_TOKEN);
    }
  });

  it("reports status alone for a non-JSON error body", async () => {
    const { impl } = fakeFetch(new Response("plain text tus error", { status: 413 }));
    await expect(
      repoWith(impl).createDirectUpload({
        sizeBytes: 1,
        constraints: { maxDurationSeconds: 600, requireSignedUrls: true },
      }),
    ).rejects.toThrow(/HTTP 413\)\./);
  });
});

describe("getVideo", () => {
  it("unwraps the envelope and parses the video payload", async () => {
    const { calls, impl } = fakeFetch(
      new Response(
        JSON.stringify({
          success: true,
          result: { uid: UID, readyToStream: true, status: { state: "ready" }, duration: 5.5 },
        }),
        { status: 200 },
      ),
    );
    const snapshot = await repoWith(impl).getVideo(UID);
    expect(snapshot?.status).toBe("ready");
    expect(snapshot?.durationSeconds).toBe(5.5);
    expect(calls[0].url).toBe(`${BASE}/${UID}`);
  });

  it("returns null on 404 (video unknown to Cloudflare)", async () => {
    const { impl } = fakeFetch(new Response("not found", { status: 404 }));
    expect(await repoWith(impl).getVideo(UID)).toBeNull();
  });

  it("rejects a malformed envelope instead of guessing", async () => {
    const { impl } = fakeFetch(new Response(JSON.stringify({ weird: true }), { status: 200 }));
    await expect(repoWith(impl).getVideo(UID)).rejects.toThrow(/Cloudflare API error/);
  });

  it("rejects an invalid uid before any network call", async () => {
    const { calls, impl } = fakeFetch();
    await expect(repoWith(impl).getVideo("../escape")).rejects.toThrow(/Invalid stream video UID/);
    expect(calls.length).toBe(0);
  });
});

describe("createPlaybackToken", () => {
  it("posts exp/downloadable and returns the parsed token", async () => {
    const { calls, impl } = fakeFetch(
      new Response(JSON.stringify({ success: true, result: { token: "abc.def.ghi" } }), {
        status: 200,
      }),
    );
    const nowMs = () => 1_800_000_000_000; // fixed clock
    const token = await repoWith(impl, nowMs).createPlaybackToken(UID, 3600);
    expect(token).toBe("abc.def.ghi");
    expect(calls[0].url).toBe(`${BASE}/${UID}/token`);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      exp: 1_800_000_000 + 3600,
      downloadable: false,
    });
  });

  it("bounds the TTL and validates the uid", async () => {
    const { calls, impl } = fakeFetch();
    const repo = repoWith(impl);
    await expect(repo.createPlaybackToken(UID, 0)).rejects.toThrow(/TTL/);
    await expect(repo.createPlaybackToken(UID, 100_000)).rejects.toThrow(/TTL/);
    await expect(repo.createPlaybackToken("bad uid", 60)).rejects.toThrow(/Invalid stream/);
    expect(calls.length).toBe(0);
  });

  it("surfaces envelope failures safely", async () => {
    const { impl } = fakeFetch(
      new Response(
        JSON.stringify({ success: false, errors: [{ code: 10005, message: "Not found" }] }),
        {
          status: 404,
        },
      ),
    );
    await expect(repoWith(impl).createPlaybackToken(UID, 60)).rejects.toThrow(/HTTP 404/);
  });
});

describe("deleteVideo", () => {
  it("returns deleted on 200 and not_found on 404 (idempotent)", async () => {
    const first = fakeFetch(new Response(null, { status: 200 }));
    expect(await repoWith(first.impl).deleteVideo(UID)).toBe("deleted");
    expect(first.calls[0].init.method).toBe("DELETE");

    const second = fakeFetch(new Response("gone already", { status: 404 }));
    expect(await repoWith(second.impl).deleteVideo(UID)).toBe("not_found");
  });

  it("throws a safe error on other failures", async () => {
    const { impl } = fakeFetch(new Response("boom", { status: 500 }));
    await expect(repoWith(impl).deleteVideo(UID)).rejects.toThrow(/HTTP 500/);
  });
});

describe("timeouts", () => {
  it("attaches an AbortSignal to every one of the four methods", async () => {
    const responses = [
      new Response(null, {
        status: 201,
        headers: { location: "https://u.example.invalid/x", "stream-media-id": UID },
      }),
      new Response(
        JSON.stringify({ success: true, result: { uid: UID, status: { state: "ready" } } }),
        { status: 200 },
      ),
      new Response(JSON.stringify({ success: true, result: { token: "t.t.t" } }), { status: 200 }),
      new Response(null, { status: 200 }),
    ];
    const { calls, impl } = fakeFetch(...responses);
    const repo = repoWith(impl);
    await repo.createDirectUpload({
      sizeBytes: 1,
      constraints: { maxDurationSeconds: 600, requireSignedUrls: true },
    });
    await repo.getVideo(UID);
    await repo.createPlaybackToken(UID, 60);
    await repo.deleteVideo(UID);
    expect(calls.length).toBe(4);
    for (const call of calls) {
      expect(call.init.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
