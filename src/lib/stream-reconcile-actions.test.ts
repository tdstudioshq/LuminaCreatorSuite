import { describe, expect, it } from "vitest";
import {
  type SweepDeps,
  SWEEP_DEFAULT_ROWS,
  SWEEP_MAX_ROWS,
  executeSweepFlow,
  normalizeSweepLimit,
} from "@/lib/stream-reconcile-actions";
import { DEFAULT_ORPHAN_GRACE } from "@/lib/cabana-stream";

// Entirely fake identifiers — no real accounts, tokens, or videos.
const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

type Row =
  Parameters<SweepDeps["fetchRows"]> extends never
    ? never
    : Awaited<ReturnType<SweepDeps["fetchRows"]>>[number];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "sv-1",
    uid: "6b9e68b07dfee8cc2d116e4c51d6a957",
    status: "pending_upload",
    createdAt: iso(2 * DAY),
    uploadExpiresAt: null,
    attached: false,
    ...overrides,
  };
}

function sweepDeps(overrides: Partial<SweepDeps> = {}) {
  const log: string[] = [];
  const deps: SweepDeps = {
    assertAdmin: async () => {
      log.push("assert-admin");
    },
    fetchRows: async () => [row()],
    reclaim: async (targets) => {
      log.push(`reclaim:${targets.map((t) => t.id).join(",")}`);
      return { reclaimed: targets.length, failed: 0, skipped: 0 };
    },
    nowMs: () => NOW,
    ...overrides,
  };
  return { deps, log };
}

describe("normalizeSweepLimit", () => {
  it("defaults when absent or unparseable", () => {
    for (const bad of [null, undefined, "abc", Number.NaN]) {
      expect(normalizeSweepLimit(bad)).toBe(SWEEP_DEFAULT_ROWS);
    }
  });

  it("clamps to a hard ceiling no caller can exceed", () => {
    expect(normalizeSweepLimit(10_000)).toBe(SWEEP_MAX_ROWS);
    expect(normalizeSweepLimit(SWEEP_MAX_ROWS + 1)).toBe(SWEEP_MAX_ROWS);
    expect(normalizeSweepLimit(0)).toBe(1);
    expect(normalizeSweepLimit(-5)).toBe(1);
    expect(normalizeSweepLimit(25.9)).toBe(25);
  });
});

describe("executeSweepFlow", () => {
  it("authorizes BEFORE reading anything", async () => {
    let read = false;
    const { deps } = sweepDeps({
      assertAdmin: async () => {
        throw new Error("You are not authorized to perform this action.");
      },
      fetchRows: async () => {
        read = true;
        return [];
      },
    });
    await expect(executeSweepFlow(deps, { dryRun: true, limit: 10 })).rejects.toThrow(
      /not authorized/,
    );
    expect(read).toBe(false);
  });

  it("dry run reports candidates and destroys nothing", async () => {
    const { deps, log } = sweepDeps();
    const report = await executeSweepFlow(deps, { dryRun: true, limit: 10 });
    expect(report).toMatchObject({ dryRun: true, scanned: 1, reclaimed: 0, failed: 0 });
    expect(report.candidates).toEqual([
      { streamVideoId: "sv-1", reason: "stale_pending", createdAt: iso(2 * DAY) },
    ]);
    expect(log).not.toContain("reclaim:sv-1");
  });

  it("a real run reclaims exactly the candidates the dry run named", async () => {
    const rows = [
      row({ id: "old", createdAt: iso(3 * DAY) }),
      row({ id: "new", createdAt: iso(1) }),
    ];
    const dry = await executeSweepFlow(sweepDeps({ fetchRows: async () => rows }).deps, {
      dryRun: true,
      limit: 10,
    });
    const { deps, log } = sweepDeps({ fetchRows: async () => rows });
    const wet = await executeSweepFlow(deps, { dryRun: false, limit: 10 });

    expect(dry.candidates.map((c) => c.streamVideoId)).toEqual(["old"]);
    expect(wet.candidates.map((c) => c.streamVideoId)).toEqual(["old"]);
    expect(log).toContain("reclaim:old");
    expect(wet).toMatchObject({ dryRun: false, reclaimed: 1, scanned: 2 });
  });

  // The single most important safety property: an attached video belongs to a
  // live post, and no background job may ever remove it.
  it("never reclaims an attached video, however old", async () => {
    const { deps, log } = sweepDeps({
      fetchRows: async () => [row({ createdAt: iso(400 * DAY), attached: true })],
    });
    const report = await executeSweepFlow(deps, { dryRun: false, limit: 10 });
    expect(report.candidates).toEqual([]);
    expect(report.reclaimed).toBe(0);
    expect(log).not.toContain("reclaim:sv-1");
  });

  it("never reclaims a video still inside its grace window", async () => {
    const fresh = [
      row({ id: "a", status: "pending_upload", createdAt: iso(1000) }),
      row({ id: "b", status: "ready", createdAt: iso(3 * DAY) }), // 7-day window
      row({ id: "c", status: "error", createdAt: iso(1000) }),
      row({ id: "d", status: "processing", createdAt: iso(DAY) }),
    ];
    const report = await executeSweepFlow(sweepDeps({ fetchRows: async () => fresh }).deps, {
      dryRun: false,
      limit: 10,
    });
    expect(report.candidates).toEqual([]);
  });

  it("keeps a ready-but-unattached upload for a full week before reclaiming it", async () => {
    // The Friday-upload/Monday-compose case: a real finished video the creator
    // has not posted yet must survive the weekend.
    expect(DEFAULT_ORPHAN_GRACE.readyUnattachedMs).toBe(7 * DAY);
    const weekend = await executeSweepFlow(
      sweepDeps({ fetchRows: async () => [row({ status: "ready", createdAt: iso(3 * DAY) })] })
        .deps,
      { dryRun: true, limit: 10 },
    );
    expect(weekend.candidates).toEqual([]);

    const stale = await executeSweepFlow(
      sweepDeps({ fetchRows: async () => [row({ status: "ready", createdAt: iso(8 * DAY) })] })
        .deps,
      { dryRun: true, limit: 10 },
    );
    expect(stale.candidates[0]).toMatchObject({ reason: "never_attached" });
  });

  it("reclaims an expired upload ticket by its expiry, not its age", async () => {
    const report = await executeSweepFlow(
      sweepDeps({
        fetchRows: async () => [
          row({ createdAt: iso(60_000), uploadExpiresAt: iso(1_000) }), // young, expired
        ],
      }).deps,
      { dryRun: true, limit: 10 },
    );
    expect(report.candidates[0]).toMatchObject({ reason: "upload_expired" });
  });

  it("passes the caller's row budget through to the read", async () => {
    let seen = -1;
    const { deps } = sweepDeps({
      fetchRows: async (limit) => {
        seen = limit;
        return [];
      },
    });
    await executeSweepFlow(deps, { dryRun: true, limit: 7 });
    expect(seen).toBe(7);
  });

  it("reports partial failure honestly instead of claiming success", async () => {
    const { deps } = sweepDeps({
      reclaim: async () => ({ reclaimed: 0, failed: 1, skipped: 0 }),
    });
    const report = await executeSweepFlow(deps, { dryRun: false, limit: 10 });
    expect(report).toMatchObject({ reclaimed: 0, failed: 1 });
    // The row survives a failure, so it is still named as a candidate — which is
    // exactly how the next pass retries it.
    expect(report.candidates).toHaveLength(1);
  });

  it("surfaces a still-attached refusal from the reclaim layer as skipped", async () => {
    const { deps } = sweepDeps({
      reclaim: async () => ({ reclaimed: 0, failed: 0, skipped: 1 }),
    });
    expect(await executeSweepFlow(deps, { dryRun: false, limit: 10 })).toMatchObject({
      skipped: 1,
    });
  });

  it("does not call the reclaim layer when nothing qualifies", async () => {
    const { deps, log } = sweepDeps({ fetchRows: async () => [] });
    const report = await executeSweepFlow(deps, { dryRun: false, limit: 10 });
    expect(report).toMatchObject({ scanned: 0, reclaimed: 0 });
    expect(log).toEqual(["assert-admin"]);
  });
});
