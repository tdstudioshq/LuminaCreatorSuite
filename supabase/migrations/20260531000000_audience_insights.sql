-- ============================================================================
-- CABANA — Phase 11C (Option B): creator audience insights RPC
-- ----------------------------------------------------------------------------
-- Additive, no table/column/enum/RLS/trigger change. Adds ONE creator-scoped
-- SECURITY DEFINER read function (the Phase 11B pattern) covering exactly what
-- RLS hides from a creator about their own audience:
--
--   1. Engaged-follower rate + activity recency — COUNT-ONLY. `post_likes` and
--      `post_saves` are private to the acting user under RLS, so a creator
--      cannot compute "how many of my followers engaged recently" from base
--      tables. This returns distinct-follower counts bucketed by recency and
--      NEVER the identity of who liked/saved (privacy-consistent with
--      `post_engagement_state` / `creator_content_analytics`).
--
--   2. Top supporters — NAMED, creator-only. Identities here are only ones the
--      creator can ALREADY see row-by-row under existing RLS ("Creators read
--      tips to own profile", "Creators read purchases of own content", own
--      `creator_subscriptions`, and `creator_subscribers_list`); the definer
--      only adds the aggregation + safe name resolution (username /
--      display_name / avatar via member_profiles or creator_profiles — no
--      UUIDs, no emails), the same identity shape `creator_subscribers_list`
--      returns. Spend is summed from the caller's own `transactions` rows
--      (`creator_net_cents` on succeeded rows) — fees are never re-derived.
--      Payers with no linked profile (deleted accounts, payer_user_id null)
--      are aggregated but returned unnamed as "former member". DEMO-ONLY money.
--
-- Returns jsonb (two differently-shaped sections; mirrors the single-RPC
-- decision recorded in the handoff). Caller's own creator profile only,
-- resolved from auth.uid(); granted to `authenticated`, revoked from
-- public/anon.
-- ============================================================================

create or replace function public.creator_audience_insights(
  _supporter_limit integer default 10,
  _window_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_creator_profile_id uuid;
  v_window interval;
  v_limit integer := greatest(1, least(coalesce(_supporter_limit, 10), 50));
  v_follower_count bigint;
  v_engaged_window bigint;
  v_active_7d bigint;
  v_active_30d bigint;
  v_active_90d bigint;
  v_supporters jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select cp.id into v_creator_profile_id
  from public.creator_profiles cp
  where cp.user_id = v_uid
  limit 1;
  if v_creator_profile_id is null then
    raise exception 'Only creators have audience insights' using errcode = 'insufficient_privilege';
  end if;

  v_window := make_interval(days => greatest(1, least(coalesce(_window_days, 30), 365)));

  select count(*) into v_follower_count
  from public.follows f
  where f.following_creator_id = v_creator_profile_id;

  -- Distinct followers who engaged (like / visible comment / save) with any of
  -- this creator's posts. Counts only — engagement identities are never returned.
  with creator_posts as (
    select p.id from public.posts p
    where p.creator_profile_id = v_creator_profile_id
  ),
  follower_engagement as (
    select f.follower_id, max(e.engaged_at) as last_engaged_at
    from public.follows f
    join lateral (
      select max(x.created_at) as engaged_at
      from (
        select l.created_at from public.post_likes l
          where l.user_id = f.follower_id and l.post_id in (select id from creator_posts)
        union all
        select c.created_at from public.post_comments c
          where c.author_id = f.follower_id and c.status = 'visible'
            and c.post_id in (select id from creator_posts)
        union all
        select s.created_at from public.post_saves s
          where s.user_id = f.follower_id and s.post_id in (select id from creator_posts)
      ) x
    ) e on e.engaged_at is not null
    where f.following_creator_id = v_creator_profile_id
    group by f.follower_id
  )
  select
    count(*) filter (where last_engaged_at >= now() - v_window),
    count(*) filter (where last_engaged_at >= now() - interval '7 days'),
    count(*) filter (where last_engaged_at >= now() - interval '30 days'),
    count(*) filter (where last_engaged_at >= now() - interval '90 days')
  into v_engaged_window, v_active_7d, v_active_30d, v_active_90d
  from follower_engagement;

  -- Top supporters by lifetime creator-net, from the caller's own ledger rows.
  select coalesce(jsonb_agg(row_json order by total_net_cents desc, last_support_at desc), '[]'::jsonb)
  into v_supporters
  from (
    select
      jsonb_build_object(
        'username', coalesce(mp.username, cp2.handle),
        'display_name', coalesce(mp.display_name, cp2.name, 'Former member'),
        'avatar_url', coalesce(mp.avatar_url, cp2.avatar_url),
        'total_net_cents', s.total_net_cents,
        'tip_cents', s.tip_cents,
        'purchase_cents', s.purchase_cents,
        'subscription_cents', s.subscription_cents,
        'support_count', s.support_count,
        'first_support_at', s.first_support_at,
        'last_support_at', s.last_support_at,
        'is_follower', exists (
          select 1 from public.follows f
          where f.following_creator_id = v_creator_profile_id
            and f.follower_id = s.payer_user_id
        )
      ) as row_json,
      s.total_net_cents,
      s.last_support_at
    from (
      select
        t.payer_user_id,
        sum(t.creator_net_cents) as total_net_cents,
        sum(t.creator_net_cents) filter (where t.type = 'tip') as tip_cents,
        sum(t.creator_net_cents) filter (where t.type = 'post_unlock') as purchase_cents,
        sum(t.creator_net_cents) filter (where t.type = 'creator_subscription') as subscription_cents,
        count(*) as support_count,
        min(t.created_at) as first_support_at,
        max(t.created_at) as last_support_at
      from public.transactions t
      where t.creator_profile_id = v_creator_profile_id
        and t.status = 'succeeded'
        and t.type in ('tip', 'post_unlock', 'creator_subscription')
      group by t.payer_user_id
      order by sum(t.creator_net_cents) desc, max(t.created_at) desc
      limit v_limit
    ) s
    left join public.member_profiles mp on mp.user_id = s.payer_user_id
    left join public.creator_profiles cp2 on cp2.user_id = s.payer_user_id
  ) ranked;

  return jsonb_build_object(
    'follower_count', v_follower_count,
    'engaged_followers_in_window', coalesce(v_engaged_window, 0),
    'window_days', extract(day from v_window)::integer,
    'active_followers_7d', coalesce(v_active_7d, 0),
    'active_followers_30d', coalesce(v_active_30d, 0),
    'active_followers_90d', coalesce(v_active_90d, 0),
    'top_supporters', v_supporters
  );
end;
$$;

revoke execute on function public.creator_audience_insights(integer, integer) from public, anon;
grant execute on function public.creator_audience_insights(integer, integer) to authenticated;
