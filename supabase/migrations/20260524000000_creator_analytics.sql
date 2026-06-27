-- ============================================================================
-- CABANA — Phase 11B: creator content analytics RPC (additive, no table change)
-- ----------------------------------------------------------------------------
-- Adds ONE SECURITY DEFINER read function and nothing else: no table, column,
-- enum, RLS, or trigger change. Creator analytics over revenue and subscribers
-- is computed from data the creator can already read (the creator-owned
-- `transactions` table and the `creator_subscriptions` rows for their profile),
-- so those need no new SQL. Per-post engagement *counts* are the exception:
-- `post_likes` and `post_saves` are private under RLS (only the actor can read
-- their own row), so a creator cannot aggregate likes/saves on their own posts
-- through the base tables. This definer function fills exactly that gap.
--
-- It returns the CALLER'S OWN posts only (joined on `creator_profiles.user_id =
-- auth.uid()`), with like / comment / save totals. It exposes only aggregate
-- counts — never the identities of who liked or saved — so it is privacy-
-- consistent with `post_engagement_state`, which already surfaces a post's
-- like/comment counts to any viewer. Granted to `authenticated` only; `anon`
-- and `public` are revoked.
-- ============================================================================

create or replace function public.creator_content_analytics(_limit integer default 200)
returns table (
  post_id uuid,
  caption text,
  visibility public.post_visibility,
  status public.post_status,
  published_at timestamptz,
  created_at timestamptz,
  like_count bigint,
  comment_count bigint,
  save_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.caption,
    p.visibility,
    p.status,
    p.published_at,
    p.created_at,
    (select count(*) from public.post_likes l where l.post_id = p.id),
    (select count(*) from public.post_comments c
       where c.post_id = p.id and c.status = 'visible'),
    (select count(*) from public.post_saves s where s.post_id = p.id)
  from public.posts p
  join public.creator_profiles cp on cp.id = p.creator_profile_id
  where cp.user_id = (select auth.uid())
  order by p.created_at desc
  limit greatest(1, least(coalesce(_limit, 200), 500));
$$;

revoke execute on function public.creator_content_analytics(integer) from public, anon;
grant execute on function public.creator_content_analytics(integer) to authenticated;
