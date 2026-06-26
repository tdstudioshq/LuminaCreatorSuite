import { describe, expect, it } from "vitest";
import {
  BLOCK_REASON_MAX,
  type RelationshipRepository,
  blockUserForUser,
  followCreatorForUser,
  getFollowerCountForUsername,
  getFollowingCountForUser,
  getRelationshipStateForUser,
  normalizeBlockReason,
  normalizeRelationshipUserId,
  normalizeRelationshipUsername,
  unblockUserForUser,
  unfollowCreatorForUser,
} from "./cabana-relationships";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";
const CREATOR_PROFILE_ID = "33333333-3333-4333-8333-333333333333";

class FakeRelationshipRepository implements RelationshipRepository {
  creator: { creatorProfileId: string; userId: string | null; username: string } | null = {
    creatorProfileId: CREATOR_PROFILE_ID,
    userId: TARGET_USER_ID,
    username: "aurora",
  };
  follows = new Set<string>();
  blocks = new Set<string>();
  followerCount = 4;

  async followCreator(username: string) {
    if (!this.creator || this.creator.username !== username) throw new Error("Creator not found.");
    if (this.creator.userId === USER_ID) {
      throw new Error("You cannot follow your own creator profile.");
    }
    if (this.creator.userId && this.blocks.has(`${USER_ID}:${this.creator.userId}`)) {
      throw new Error("Unblock this creator before following them.");
    }
    const key = `${USER_ID}:${this.creator.creatorProfileId}`;
    if (!this.follows.has(key)) this.followerCount += 1;
    this.follows.add(key);
  }

  async unfollowCreator(username: string) {
    if (!this.creator || this.creator.username !== username) throw new Error("Creator not found.");
    const key = `${USER_ID}:${this.creator.creatorProfileId}`;
    if (this.follows.delete(key)) this.followerCount -= 1;
  }

  async block(blockerId: string, blockedUserId: string) {
    this.blocks.add(`${blockerId}:${blockedUserId}`);
  }

  async unblock(blockerId: string, blockedUserId: string) {
    this.blocks.delete(`${blockerId}:${blockedUserId}`);
  }

  async getRelationshipState(username: string) {
    if (!this.creator || this.creator.username !== username) throw new Error("Creator not found.");
    const following = this.follows.has(`${USER_ID}:${this.creator.creatorProfileId}`);
    const blockedByMe = this.creator.userId
      ? this.blocks.has(`${USER_ID}:${this.creator.userId}`)
      : false;
    const isSelf = this.creator.userId === USER_ID;
    return {
      username,
      following,
      blockedByMe,
      followerCount: this.followerCount,
      followingCount: following ? 1 : 0,
      isSelf,
      canFollow: !isSelf && !blockedByMe,
    };
  }

  async getFollowerCount() {
    return this.followerCount;
  }

  async getFollowingCount(userId: string) {
    return [...this.follows].filter((key) => key.startsWith(`${userId}:`)).length;
  }
}

describe("relationship validation", () => {
  it("normalizes creator usernames", () => {
    expect(normalizeRelationshipUsername(" @Aurora ")).toBe("aurora");
  });

  it("rejects invalid creator usernames", () => {
    expect(() => normalizeRelationshipUsername(null)).toThrow("required");
    expect(() => normalizeRelationshipUsername("bad handle")).toThrow("must contain");
    expect(() => normalizeRelationshipUsername("x".repeat(65))).toThrow("must contain");
  });

  it("validates and normalizes UUIDs", () => {
    expect(normalizeRelationshipUserId(TARGET_USER_ID.toUpperCase())).toBe(TARGET_USER_ID);
    expect(() => normalizeRelationshipUserId("not-a-uuid")).toThrow("valid target user ID");
  });

  it("normalizes optional block reasons", () => {
    expect(normalizeBlockReason(undefined)).toBeNull();
    expect(normalizeBlockReason("  spam  ")).toBe("spam");
    expect(normalizeBlockReason("   ")).toBeNull();
    expect(() => normalizeBlockReason(12)).toThrow("must be text");
    expect(() => normalizeBlockReason("x".repeat(BLOCK_REASON_MAX + 1))).toThrow("characters");
  });
});

describe("relationship action behavior", () => {
  it("follows and unfollows a creator idempotently", async () => {
    const repository = new FakeRelationshipRepository();

    const followed = await followCreatorForUser(repository, USER_ID, "@Aurora");
    expect(followed).toMatchObject({
      username: "aurora",
      following: true,
      blockedByMe: false,
      followerCount: 5,
      followingCount: 1,
      isSelf: false,
      canFollow: true,
    });

    const unfollowed = await unfollowCreatorForUser(repository, USER_ID, "aurora");
    expect(unfollowed.following).toBe(false);
    expect(unfollowed.followerCount).toBe(4);
    expect(unfollowed.followingCount).toBe(0);
  });

  it("rejects missing creators, self-follows, and blocked targets", async () => {
    const missing = new FakeRelationshipRepository();
    missing.creator = null;
    await expect(followCreatorForUser(missing, USER_ID, "missing")).rejects.toThrow(
      "Creator not found",
    );

    const self = new FakeRelationshipRepository();
    self.creator = { ...self.creator!, userId: USER_ID };
    await expect(followCreatorForUser(self, USER_ID, "aurora")).rejects.toThrow("own");

    const blocked = new FakeRelationshipRepository();
    blocked.blocks.add(`${USER_ID}:${TARGET_USER_ID}`);
    await expect(followCreatorForUser(blocked, USER_ID, "aurora")).rejects.toThrow("Unblock");
  });

  it("returns state for ownerless demo creators", async () => {
    const repository = new FakeRelationshipRepository();
    repository.creator = { ...repository.creator!, userId: null };
    const state = await getRelationshipStateForUser(repository, USER_ID, "aurora");
    expect(state).toMatchObject({ blockedByMe: false, isSelf: false, canFollow: true });
  });

  it("blocks and unblocks another user", async () => {
    const repository = new FakeRelationshipRepository();
    await expect(
      blockUserForUser(repository, USER_ID, {
        targetUserId: TARGET_USER_ID,
        reason: "  spam  ",
      }),
    ).resolves.toEqual({ targetUserId: TARGET_USER_ID, blocked: true });
    expect(repository.blocks.has(`${USER_ID}:${TARGET_USER_ID}`)).toBe(true);

    await expect(unblockUserForUser(repository, USER_ID, TARGET_USER_ID)).resolves.toEqual({
      targetUserId: TARGET_USER_ID,
      blocked: false,
    });
    expect(repository.blocks.has(`${USER_ID}:${TARGET_USER_ID}`)).toBe(false);
  });

  it("rejects self-blocks", async () => {
    const repository = new FakeRelationshipRepository();
    await expect(blockUserForUser(repository, USER_ID, { targetUserId: USER_ID })).rejects.toThrow(
      "yourself",
    );
  });

  it("returns follower and following counts", async () => {
    const repository = new FakeRelationshipRepository();
    await repository.followCreator("aurora");
    await expect(getFollowerCountForUsername(repository, "@Aurora")).resolves.toBe(5);
    await expect(getFollowingCountForUser(repository, USER_ID)).resolves.toBe(1);
  });
});
