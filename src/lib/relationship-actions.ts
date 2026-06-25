// ============================================================================
// CABANA — protected relationship server actions (Phase 2C)
// ----------------------------------------------------------------------------
// All functions use the caller's bearer token and an RLS-scoped Supabase
// client. No service-role client is used. The exported server functions remain
// outside a `**/server/**` path because TanStack compiles them to client RPC
// bridges.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
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
} from "@/lib/cabana-relationships";

function createRelationshipRepository(supabase: SupabaseClient<Database>): RelationshipRepository {
  return {
    async followCreator(username) {
      const { error } = await supabase.rpc("relationship_follow_creator", {
        _username: username,
      });
      if (error) throw new Error(error.message);
    },

    async unfollowCreator(username) {
      const { error } = await supabase.rpc("relationship_unfollow_creator", {
        _username: username,
      });
      if (error) throw new Error(error.message);
    },

    async block(blockerId, blockedUserId, reason) {
      const { error } = await supabase
        .from("blocks")
        .upsert(
          { blocker_id: blockerId, blocked_user_id: blockedUserId, reason },
          { onConflict: "blocker_id,blocked_user_id", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    },

    async unblock(blockerId, blockedUserId) {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", blockerId)
        .eq("blocked_user_id", blockedUserId);
      if (error) throw new Error(error.message);
    },

    async getRelationshipState(username) {
      const { data, error } = await supabase.rpc("relationship_state", {
        _username: username,
      });
      if (error) throw new Error(error.message);
      const state = data[0];
      if (!state) throw new Error("Creator not found.");
      return {
        username: state.username,
        following: state.following,
        blockedByMe: state.blocked_by_me,
        followerCount: Number(state.follower_count),
        followingCount: Number(state.following_count),
        isSelf: state.is_self,
        canFollow: !state.is_self && !state.blocked_by_me,
      };
    },

    async getFollowerCount(username) {
      const { data, error } = await supabase
        .from("public_creator_profiles")
        .select("follower_count")
        .eq("username", username)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Creator not found.");
      return Number(data.follower_count ?? 0);
    },

    async getFollowingCount(userId) {
      const { count, error } = await supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_id", userId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  };
}

const relationshipMiddleware = [attachSupabaseToken, requireSupabaseAuth] as const;

export const followCreator = createServerFn({ method: "POST" })
  .middleware(relationshipMiddleware)
  .inputValidator((raw: { username?: unknown }) => ({
    username: normalizeRelationshipUsername(raw?.username),
  }))
  .handler(async ({ context, data }) =>
    followCreatorForUser(
      createRelationshipRepository(context.supabase),
      context.userId,
      data.username,
    ),
  );

export const unfollowCreator = createServerFn({ method: "POST" })
  .middleware(relationshipMiddleware)
  .inputValidator((raw: { username?: unknown }) => ({
    username: normalizeRelationshipUsername(raw?.username),
  }))
  .handler(async ({ context, data }) =>
    unfollowCreatorForUser(
      createRelationshipRepository(context.supabase),
      context.userId,
      data.username,
    ),
  );

export const blockUser = createServerFn({ method: "POST" })
  .middleware(relationshipMiddleware)
  .inputValidator((raw: { targetUserId?: unknown; reason?: unknown }) => ({
    targetUserId: normalizeRelationshipUserId(raw?.targetUserId),
    reason: normalizeBlockReason(raw?.reason),
  }))
  .handler(async ({ context, data }) =>
    blockUserForUser(createRelationshipRepository(context.supabase), context.userId, data),
  );

export const unblockUser = createServerFn({ method: "POST" })
  .middleware(relationshipMiddleware)
  .inputValidator((raw: { targetUserId?: unknown }) => ({
    targetUserId: normalizeRelationshipUserId(raw?.targetUserId),
  }))
  .handler(async ({ context, data }) =>
    unblockUserForUser(
      createRelationshipRepository(context.supabase),
      context.userId,
      data.targetUserId,
    ),
  );

export const getRelationshipState = createServerFn({ method: "GET" })
  .middleware(relationshipMiddleware)
  .inputValidator((raw: { username?: unknown }) => ({
    username: normalizeRelationshipUsername(raw?.username),
  }))
  .handler(async ({ context, data }) =>
    getRelationshipStateForUser(
      createRelationshipRepository(context.supabase),
      context.userId,
      data.username,
    ),
  );

export const getFollowerCount = createServerFn({ method: "GET" })
  .middleware(relationshipMiddleware)
  .inputValidator((raw: { username?: unknown }) => ({
    username: normalizeRelationshipUsername(raw?.username),
  }))
  .handler(async ({ context, data }) =>
    getFollowerCountForUsername(createRelationshipRepository(context.supabase), data.username),
  );

export const getFollowingCount = createServerFn({ method: "GET" })
  .middleware(relationshipMiddleware)
  .handler(async ({ context }) =>
    getFollowingCountForUser(createRelationshipRepository(context.supabase), context.userId),
  );
