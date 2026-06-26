// ============================================================================
// CABANA — relationship domain/service layer
// ----------------------------------------------------------------------------
// Shared validation and action behavior for Phase 2C. Database access is
// supplied through RelationshipRepository so the protected server functions
// remain thin and the behavior is unit-testable without a browser or Supabase.
// ============================================================================

export const RELATIONSHIP_USERNAME_MAX = 64;
export const BLOCK_REASON_MAX = 280;

const USERNAME_PATTERN = /^[a-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RelationshipState = {
  username: string;
  following: boolean;
  blockedByMe: boolean;
  followerCount: number;
  followingCount: number;
  isSelf: boolean;
  canFollow: boolean;
};

export type BlockState = {
  targetUserId: string;
  blocked: boolean;
};

export type RelationshipRepository = {
  followCreator(username: string): Promise<void>;
  unfollowCreator(username: string): Promise<void>;
  block(blockerId: string, blockedUserId: string, reason: string | null): Promise<void>;
  unblock(blockerId: string, blockedUserId: string): Promise<void>;
  getRelationshipState(username: string): Promise<RelationshipState>;
  getFollowerCount(username: string): Promise<number>;
  getFollowingCount(userId: string): Promise<number>;
};

export function normalizeRelationshipUsername(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Creator username is required.");
  const username = raw.trim().replace(/^@/, "").toLowerCase();
  if (
    !username ||
    username.length > RELATIONSHIP_USERNAME_MAX ||
    !USERNAME_PATTERN.test(username)
  ) {
    throw new Error(
      "Creator username must contain only letters, numbers, underscores, or hyphens.",
    );
  }
  return username;
}

export function normalizeRelationshipUserId(raw: unknown): string {
  if (typeof raw !== "string" || !UUID_PATTERN.test(raw)) {
    throw new Error("A valid target user ID is required.");
  }
  return raw.toLowerCase();
}

export function normalizeBlockReason(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") throw new Error("Block reason must be text.");
  const reason = raw.trim();
  if (!reason) return null;
  if (reason.length > BLOCK_REASON_MAX) {
    throw new Error(`Block reason must be ${BLOCK_REASON_MAX} characters or fewer.`);
  }
  return reason;
}

export async function followCreatorForUser(
  repository: RelationshipRepository,
  userId: string,
  rawUsername: unknown,
): Promise<RelationshipState> {
  void userId;
  const username = normalizeRelationshipUsername(rawUsername);
  await repository.followCreator(username);
  return repository.getRelationshipState(username);
}

export async function unfollowCreatorForUser(
  repository: RelationshipRepository,
  _userId: string,
  rawUsername: unknown,
): Promise<RelationshipState> {
  const username = normalizeRelationshipUsername(rawUsername);
  await repository.unfollowCreator(username);
  return repository.getRelationshipState(username);
}

export async function blockUserForUser(
  repository: RelationshipRepository,
  userId: string,
  input: { targetUserId?: unknown; reason?: unknown },
): Promise<BlockState> {
  const targetUserId = normalizeRelationshipUserId(input.targetUserId);
  if (targetUserId === userId) throw new Error("You cannot block yourself.");
  await repository.block(userId, targetUserId, normalizeBlockReason(input.reason));
  return { targetUserId, blocked: true };
}

export async function unblockUserForUser(
  repository: RelationshipRepository,
  userId: string,
  rawTargetUserId: unknown,
): Promise<BlockState> {
  const targetUserId = normalizeRelationshipUserId(rawTargetUserId);
  await repository.unblock(userId, targetUserId);
  return { targetUserId, blocked: false };
}

export async function getRelationshipStateForUser(
  repository: RelationshipRepository,
  userId: string,
  rawUsername: unknown,
): Promise<RelationshipState> {
  void userId;
  return repository.getRelationshipState(normalizeRelationshipUsername(rawUsername));
}

export async function getFollowerCountForUsername(
  repository: RelationshipRepository,
  rawUsername: unknown,
): Promise<number> {
  return repository.getFollowerCount(normalizeRelationshipUsername(rawUsername));
}

export async function getFollowingCountForUser(
  repository: RelationshipRepository,
  userId: string,
): Promise<number> {
  return repository.getFollowingCount(userId);
}
