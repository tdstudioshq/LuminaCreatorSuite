import { describe, expect, it } from "vitest";
import { type ReclaimDeps, executeReclaimFlow } from "@/lib/stream-reclaim.server";

// Entirely fake identifiers — no real accounts, tokens, or videos.
const SV_A = "2d7f3c2a-1b08-4d5c-9a6b-5e4d3c2b1a09";
const SV_B = "3e8a4d3b-2c19-4e6d-8b7c-6f5e4d3c2b1a";
const UID_A = "6b9e68b07dfee8cc2d116e4c51d6a957";
const UID_B = "7c0f79c18efff9dd3e227f5d62e7ba68";

function reclaimDeps(overrides: Partial<ReclaimDeps> = {}) {
  const log: string[] = [];
  const deps: ReclaimDeps = {
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

const A = { id: SV_A, uid: UID_A };
const B = { id: SV_B, uid: UID_B };

describe("executeReclaimFlow", () => {
  it("reclaims an unattached video remote-first, then the row", async () => {
    const { deps, log } = reclaimDeps();
    const summary = await executeReclaimFlow(deps, [A]);
    expect(summary).toMatchObject({ reclaimed: 1, failed: 0, skipped: 0 });
    // Order is the safety property: the row is the only record of the asset, so
    // it may only go away once the asset is confirmed gone.
    expect(log).toEqual([`cf-delete:${UID_A}`, `row-delete:${SV_A}`]);
  });

  it("treats an already-absent Cloudflare asset as success (idempotent repeats)", async () => {
    const { deps, log } = reclaimDeps({ deleteCfVideo: async () => "not_found" });
    const summary = await executeReclaimFlow(deps, [A]);
    expect(summary.reclaimed).toBe(1);
    expect(log).toContain(`row-delete:${SV_A}`);
  });

  it("KEEPS the row when the remote delete fails, so the asset stays retryable", async () => {
    const { deps, log } = reclaimDeps({
      deleteCfVideo: async () => {
        throw new Error("cf down");
      },
    });
    const summary = await executeReclaimFlow(deps, [A]);
    expect(summary).toMatchObject({ reclaimed: 0, failed: 1 });
    expect(summary.outcomes[0].result).toBe("remote_failed");
    // Deleting the row here would strand the asset forever with nothing
    // pointing at it — the one thing this flow must never do.
    expect(log).not.toContain(`row-delete:${SV_A}`);
  });

  it("reports row_failed when the remote is gone but the row delete fails", async () => {
    const { deps } = reclaimDeps({
      deleteRow: async () => {
        throw new Error("rls");
      },
    });
    const summary = await executeReclaimFlow(deps, [A]);
    expect(summary).toMatchObject({ reclaimed: 0, failed: 1 });
    expect(summary.outcomes[0].result).toBe("row_failed");
  });

  it("refuses to touch a still-attached video, destroying nothing", async () => {
    const { deps, log } = reclaimDeps({ isAttached: async () => true });
    const summary = await executeReclaimFlow(deps, [A]);
    expect(summary).toMatchObject({ reclaimed: 0, failed: 0, skipped: 1 });
    expect(summary.outcomes[0].result).toBe("still_attached");
    expect(log).toEqual([]);
  });

  it("re-checks attachment per video, so one skip does not stop the batch", async () => {
    const { deps, log } = reclaimDeps({ isAttached: async (id) => id === SV_A });
    const summary = await executeReclaimFlow(deps, [A, B]);
    expect(summary).toMatchObject({ reclaimed: 1, skipped: 1 });
    expect(log).toEqual([`cf-delete:${UID_B}`, `row-delete:${SV_B}`]);
  });

  it("never throws — one video's failure does not abort the others", async () => {
    const { deps, log } = reclaimDeps({
      deleteCfVideo: async (uid) => {
        if (uid === UID_A) throw new Error("boom");
        log.push(`cf-delete:${uid}`);
        return "deleted";
      },
    });
    const summary = await executeReclaimFlow(deps, [A, B]);
    expect(summary).toMatchObject({ reclaimed: 1, failed: 1 });
    expect(log).toContain(`row-delete:${SV_B}`);
  });

  it("propagates an attachment-check failure as a non-destructive failure", async () => {
    const { deps, log } = reclaimDeps({
      isAttached: async () => {
        throw new Error("db down");
      },
    });
    const summary = await executeReclaimFlow(deps, [A]);
    expect(summary.outcomes[0].result).toBe("remote_failed");
    // Cannot prove it is unattached → must not delete anything.
    expect(log).toEqual([]);
  });

  it("handles an empty batch", async () => {
    const { deps } = reclaimDeps();
    expect(await executeReclaimFlow(deps, [])).toEqual({
      reclaimed: 0,
      failed: 0,
      skipped: 0,
      outcomes: [],
    });
  });
});
