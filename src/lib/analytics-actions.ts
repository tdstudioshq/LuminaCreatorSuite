// ============================================================================
// CABANA — creator analytics server action (Phase 11B)
// ----------------------------------------------------------------------------
// One RLS-scoped read that gathers the creator's settled ledger transactions,
// their own subscription rows, and per-post engagement counts (via the
// `creator_content_analytics` definer RPC), then returns the raw bundle the
// pure `cabana-creator-analytics` aggregator turns into the analytics view. The
// handler stays thin: it only fetches rows the caller owns (never the service
// role) and shapes them into the pure module's structural inputs. All revenue/
// growth/engagement derivation lives in the unit-tested pure layer.
//
// Compiles to a client RPC bridge — must NOT live under any `**/server/**` path.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type {
  AnalyticsPost,
  AnalyticsSubscription,
  AnalyticsTransaction,
  CreatorAnalyticsData,
} from "@/lib/cabana-creator-analytics";

type Db = SupabaseClient<Database>;

async function findCreatorProfileId(supabase: Db, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

async function readTransactions(
  supabase: Db,
  creatorProfileId: string,
): Promise<AnalyticsTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("type, status, creator_net_cents, currency, created_at")
    .eq("creator_profile_id", creatorProfileId)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    type: r.type,
    status: r.status,
    creatorNetCents: r.creator_net_cents,
    currency: r.currency,
    createdAt: r.created_at,
  }));
}

async function readSubscriptions(
  supabase: Db,
  creatorProfileId: string,
): Promise<AnalyticsSubscription[]> {
  const { data, error } = await supabase
    .from("creator_subscriptions")
    .select("status, started_at, canceled_at")
    .eq("creator_profile_id", creatorProfileId)
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    status: r.status,
    startedAt: r.started_at,
    canceledAt: r.canceled_at,
  }));
}

async function readPosts(supabase: Db): Promise<AnalyticsPost[]> {
  const { data, error } = await supabase.rpc("creator_content_analytics", { _limit: 200 });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    postId: r.post_id,
    caption: r.caption,
    visibility: r.visibility,
    status: r.status,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    likeCount: Number(r.like_count),
    commentCount: Number(r.comment_count),
    saveCount: Number(r.save_count),
  }));
}

function emptyData(): CreatorAnalyticsData {
  return { currency: "USD", transactions: [], subscriptions: [], posts: [] };
}

/**
 * The calling creator's analytics bundle (RLS-scoped). Returns empty
 * collections for accounts without a creator profile so the dashboard renders
 * its empty state rather than erroring.
 */
export const getCreatorAnalytics = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorAnalyticsData> => {
    const { supabase, userId } = context;
    const db = supabase as Db;
    const creatorProfileId = await findCreatorProfileId(db, userId);
    if (!creatorProfileId) return emptyData();

    const [transactions, subscriptions, posts] = await Promise.all([
      readTransactions(db, creatorProfileId),
      readSubscriptions(db, creatorProfileId),
      readPosts(db),
    ]);

    return {
      currency: transactions[0]?.currency ?? "USD",
      transactions,
      subscriptions,
      posts,
    };
  });
