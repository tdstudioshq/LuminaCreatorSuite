// ============================================================================
// CABANA — audited staff-role mutation policy (PURE)
// ============================================================================
// The database remains authoritative. This module gives the server-action
// boundary deterministic input validation and safe, non-diagnostic errors.

export const MANAGEABLE_STAFF_ROLES = ["admin", "moderator"] as const;
export type ManageableStaffRole = (typeof MANAGEABLE_STAFF_ROLES)[number];

export interface RoleMutationInput {
  targetUserId: string;
  role: ManageableStaffRole;
  reason: string;
}

export type RoleDbError =
  | { code?: string | null; message?: string | null }
  | string
  | null
  | undefined;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isManageableStaffRole(value: unknown): value is ManageableStaffRole {
  return typeof value === "string" && (MANAGEABLE_STAFF_ROLES as readonly string[]).includes(value);
}

export function normalizeRoleMutationInput(raw: unknown): RoleMutationInput {
  if (!raw || typeof raw !== "object") throw new Error("Invalid role-management request.");

  const candidate = raw as Record<string, unknown>;
  const targetUserId =
    typeof candidate.targetUserId === "string" ? candidate.targetUserId.trim().toLowerCase() : "";
  const reason = typeof candidate.reason === "string" ? candidate.reason.trim() : "";

  if (!UUID_PATTERN.test(targetUserId)) throw new Error("A valid account ID is required.");
  if (!isManageableStaffRole(candidate.role)) throw new Error("A valid staff role is required.");
  if (reason.length === 0 || reason.length > 500) {
    throw new Error("A reason between 1 and 500 characters is required.");
  }

  return { targetUserId, role: candidate.role, reason };
}

/** Map database failures without exposing SQL, identifiers, or internal data. */
export function mapRoleMutationError(error: RoleDbError): string {
  const code = typeof error === "object" && error ? (error.code ?? "") : "";
  const message = typeof error === "string" ? error : (error?.message ?? "");
  const normalized = message.toLowerCase();

  if (code === "42501" || normalized.includes("admin role required")) {
    return "You are not authorized to perform this action.";
  }
  if (normalized.includes("final administrator")) {
    return "The final administrator role cannot be removed.";
  }
  if (normalized.includes("own roles")) {
    return "Administrators cannot change their own roles.";
  }
  if (code === "23505" || normalized.includes("already assigned")) {
    return "That role is already assigned.";
  }
  if (normalized.includes("not assigned")) return "That role is not assigned.";
  if (code === "P0002" || normalized.includes("target account")) {
    return "That account is not eligible for role management.";
  }
  if (normalized.includes("reason between")) {
    return "A reason between 1 and 500 characters is required.";
  }
  if (normalized.includes("only staff roles")) return "A valid staff role is required.";
  if (code === "23514") return "That role change is not allowed.";
  return "The role change could not be completed. Please try again.";
}
