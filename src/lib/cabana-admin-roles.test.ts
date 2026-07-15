import { describe, expect, it } from "vitest";
import {
  isManageableStaffRole,
  mapRoleMutationError,
  normalizeRoleMutationInput,
} from "@/lib/cabana-admin-roles";

describe("admin role policy", () => {
  it("accepts only the current staff taxonomy", () => {
    expect(isManageableStaffRole("admin")).toBe(true);
    expect(isManageableStaffRole("moderator")).toBe(true);
    expect(isManageableStaffRole("user")).toBe(false);
    expect(isManageableStaffRole("finance")).toBe(false);
  });

  it("normalizes a valid mutation request", () => {
    expect(
      normalizeRoleMutationInput({
        targetUserId: " 0A000000-0000-0000-0000-000000000001 ",
        role: "moderator",
        reason: "  Queue coverage  ",
      }),
    ).toEqual({
      targetUserId: "0a000000-0000-0000-0000-000000000001",
      role: "moderator",
      reason: "Queue coverage",
    });
  });

  it("rejects malformed ids, unsupported roles, and invalid reasons", () => {
    expect(() => normalizeRoleMutationInput(null)).toThrow(/Invalid/);
    expect(() =>
      normalizeRoleMutationInput({ targetUserId: "no", role: "admin", reason: "ok" }),
    ).toThrow(/account ID/);
    expect(() =>
      normalizeRoleMutationInput({
        targetUserId: "0a000000-0000-0000-0000-000000000001",
        role: "user",
        reason: "ok",
      }),
    ).toThrow(/staff role/);
    expect(() =>
      normalizeRoleMutationInput({
        targetUserId: "0a000000-0000-0000-0000-000000000001",
        role: "admin",
        reason: " ",
      }),
    ).toThrow(/between 1 and 500/);
    expect(() =>
      normalizeRoleMutationInput({
        targetUserId: "0a000000-0000-0000-0000-000000000001",
        role: "admin",
        reason: "x".repeat(501),
      }),
    ).toThrow(/between 1 and 500/);
  });

  it("maps known database failures and hides unknown diagnostics", () => {
    expect(mapRoleMutationError({ code: "42501", message: "private" })).toMatch(/not authorized/);
    expect(mapRoleMutationError({ code: "23505" })).toMatch(/already assigned/);
    expect(mapRoleMutationError({ message: "That role is not assigned" })).toMatch(/not assigned/);
    expect(
      mapRoleMutationError({ message: "The final administrator role cannot be removed" }),
    ).toMatch(/final administrator/);
    expect(
      mapRoleMutationError({ message: "Administrators cannot change their own roles" }),
    ).toMatch(/own roles/);
    expect(mapRoleMutationError({ code: "P0002" })).toMatch(/not eligible/);
    expect(mapRoleMutationError({ message: "Target account is not eligible" })).toMatch(
      /not eligible/,
    );
    expect(
      mapRoleMutationError({ message: "A reason between 1 and 500 characters is required" }),
    ).toMatch(/between 1 and 500/);
    expect(mapRoleMutationError({ message: "Only staff roles may be granted" })).toMatch(
      /staff role/,
    );
    expect(mapRoleMutationError({ code: "23514", message: "SQL detail" })).toMatch(/not allowed/);
    expect(mapRoleMutationError({ code: "XX000", message: "secret internal detail" })).toBe(
      "The role change could not be completed. Please try again.",
    );
    expect(mapRoleMutationError("unexpected raw detail")).toBe(
      "The role change could not be completed. Please try again.",
    );
  });
});
