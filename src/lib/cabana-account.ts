// ============================================================================
// CABANA — account-type domain layer (PURE)
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. This is the
// single source of truth for "creator vs member" resolution, member-profile
// shaping/normalization, and the account-context shape returned by the
// protected server actions. Hooks live in `use-account.ts`; server actions in
// `server/account-actions.ts`. Keeping this pure makes it unit-testable and
// safe to import from both client and server code.
//
// Explicit default: an account is a CREATOR unless it explicitly opts into
// 'member'. This preserves all existing creator behavior.
// ============================================================================
import type { Database } from "@/integrations/supabase/types";

export type AccountType = Database["public"]["Enums"]["account_type"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const ACCOUNT_TYPES: readonly AccountType[] = ["creator", "member"] as const;
export const DEFAULT_ACCOUNT_TYPE: AccountType = "creator";

/**
 * Resolve an account type from arbitrary signup/metadata input. Only the exact
 * string "member" opts into a member account; everything else (including
 * `undefined`, `null`, unknown values) resolves to the default `creator`.
 * Mirrors the `handle_new_user` SQL branch so client and DB never disagree.
 */
export function resolveAccountType(raw: unknown): AccountType {
  return raw === "member" ? "member" : "creator";
}

export function isMember(type: AccountType): boolean {
  return type === "member";
}

export function isCreator(type: AccountType): boolean {
  return type === "creator";
}

/** Post-auth landing path for an account type. */
export function accountHomePath(type: AccountType): "/dashboard" | "/account" {
  return type === "member" ? "/account" : "/dashboard";
}

// ─────────────────────────── Member profile ────────────────────────────────

export type MemberProfile = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type MemberProfileRow = Database["public"]["Tables"]["member_profiles"]["Row"];

/** Map a raw DB row to the camelCase domain shape. */
export function mapMemberProfile(row: MemberProfileRow): MemberProfile {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type MemberProfileDraft = { displayName: string; bio: string };

export const MEMBER_DISPLAY_NAME_MAX = 60;
export const MEMBER_BIO_MAX = 280;

/** Sensible defaults for a member who has not customized their profile yet. */
export function defaultMemberProfile(opts?: { name?: string | null }): MemberProfileDraft {
  const name = (opts?.name ?? "").trim();
  return { displayName: name || "Member", bio: "" };
}

/** Trim + length-cap member edits before they are persisted. */
export function normalizeMemberProfileInput(input: {
  displayName?: string | null;
  bio?: string | null;
}): MemberProfileDraft {
  const displayName = (input.displayName ?? "").trim().slice(0, MEMBER_DISPLAY_NAME_MAX);
  const bio = (input.bio ?? "").trim().slice(0, MEMBER_BIO_MAX);
  return { displayName, bio };
}

// ────────────────────────── Account context ─────────────────────────────────

export type AccountContext = {
  userId: string;
  accountType: AccountType;
  roles: AppRole[];
  name: string | null;
  email: string | null;
};

/**
 * Shape the authenticated account context from the raw `profiles` row and
 * `user_roles` rows. Pure so the `getAccountContext` server action is just a
 * thin data-fetch around this. Defaults to `creator` if the profile row is
 * somehow missing, matching the DB default.
 */
export function shapeAccountContext(input: {
  userId: string;
  profile: { account_type: AccountType; name: string | null; email: string | null } | null;
  roleRows: { role: AppRole }[] | null;
}): AccountContext {
  return {
    userId: input.userId,
    accountType: input.profile?.account_type ?? DEFAULT_ACCOUNT_TYPE,
    roles: (input.roleRows ?? []).map((r) => r.role),
    name: input.profile?.name ?? null,
    email: input.profile?.email ?? null,
  };
}
