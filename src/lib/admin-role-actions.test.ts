import { describe, expect, it } from "vitest";
import {
  type AdminRoleDeps,
  type AdminRoleRpc,
  grantUserRole,
  removeUserRole,
} from "@/lib/admin-role-actions";

const TARGET = "0a000000-0000-0000-0000-000000000001";

function makeDeps(options: { admin?: boolean; error?: { code?: string; message?: string } } = {}) {
  const calls: Array<{ fn: AdminRoleRpc; args: Record<string, unknown> }> = [];
  const deps: AdminRoleDeps = {
    assertAdmin: async () => {
      if (options.admin === false)
        throw new Error("You are not authorized to perform this action.");
    },
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return { data: null, error: options.error ?? null };
    },
  };
  return { deps, calls };
}

describe("admin role actions", () => {
  it("rejects a non-admin before either RPC", async () => {
    const { deps, calls } = makeDeps({ admin: false });
    await expect(
      grantUserRole(deps, { targetUserId: TARGET, role: "moderator", reason: "Coverage" }),
    ).rejects.toThrow(/not authorized/);
    await expect(
      removeUserRole(deps, { targetUserId: TARGET, role: "moderator", reason: "Coverage" }),
    ).rejects.toThrow(/not authorized/);
    expect(calls).toHaveLength(0);
  });

  it("normalizes and forwards grant arguments", async () => {
    const { deps, calls } = makeDeps();
    await expect(
      grantUserRole(deps, {
        targetUserId: TARGET.toUpperCase(),
        role: "moderator",
        reason: "  Incident rotation  ",
      }),
    ).resolves.toEqual({ ok: true });
    expect(calls).toEqual([
      {
        fn: "admin_grant_user_role",
        args: {
          _target_user_id: TARGET,
          _role: "moderator",
          _reason: "Incident rotation",
        },
      },
    ]);
  });

  it("forwards removal and safely maps RPC errors", async () => {
    const { deps, calls } = makeDeps({
      error: { code: "23514", message: "The final administrator role cannot be removed" },
    });
    await expect(
      removeUserRole(deps, { targetUserId: TARGET, role: "admin", reason: "Offboarding" }),
    ).rejects.toThrow(/final administrator/);
    expect(calls[0]?.fn).toBe("admin_remove_user_role");
  });

  it("validates before calling an RPC", async () => {
    const { deps, calls } = makeDeps();
    await expect(
      grantUserRole(deps, { targetUserId: "bad", role: "admin", reason: "Coverage" }),
    ).rejects.toThrow(/account ID/);
    await expect(
      grantUserRole(deps, { targetUserId: TARGET, role: "user" as never, reason: "Coverage" }),
    ).rejects.toThrow(/staff role/);
    await expect(
      grantUserRole(deps, { targetUserId: TARGET, role: "admin", reason: "" }),
    ).rejects.toThrow(/between 1 and 500/);
    expect(calls).toHaveLength(0);
  });
});
