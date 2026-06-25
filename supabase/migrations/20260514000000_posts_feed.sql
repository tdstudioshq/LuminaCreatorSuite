-- ============================================================================
-- CABANA — Phase 3: Posts & Feed Foundation
-- ============================================================================
-- Adds the first real creator content layer on top of the Phase 2C social
-- graph. Purely additive:
--   * `post_visibility` / `post_status` / `post_media_kind` enums
--   * `posts` (creator-owned) and `post_media` (private media metadata)
--   * a PRIVATE `post-media` storage bucket (owner-scoped writes; non-owners
--     never read directly — access is via authorization-gated signed URLs)
--   * `is_following_creator` + `can_view_post` authorization helpers
--   * ID-free `feed_creator_posts` / `feed_home_posts` read RPCs
--
-- Visibility scope (Phase 3): only `public` and `followers` are usable by
-- non-creators. `subscribers` / `purchase` values exist on the enum for
-- forward compatibility but are NEVER returned to non-creators and are
-- rejected by the application write layer — there is no `creator_subscriptions`
-- table or monetization yet (Phase 4).
--
-- Intentionally NOT included: comments/likes/saves (Phase 3.2), subscriptions,
-- pricing, tips, payments, a publish scheduler, and any production Supabase
-- operation. `subscriptions` is NOT renamed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.post_visibility as enum ('public', 'followers', 'subscribers', 'purchase');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.post_status as enum ('draft', 'scheduled', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.post_media_kind as enum ('image', 'video', 'audio');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  caption text not null default '',
  visibility public.post_visibility not null default 'public',
  status public.post_status not null default 'draft',
  published_at timestamptz,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_caption_length check (char_length(caption) <= 5000)
);

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.post_media_kind not null,
  storage_bucket text not null default 'post-media',
  storage_path text not null,
  mime_type text,
  width integer,
  height integer,
  position integer not null default 0,
  processing_status text not null default 'ready',
  created_at timestamptz not null default now()
);

-- Feed reads order by (published_at desc, id desc) and filter by creator+status.
create index if not exists posts_creator_status_published_idx
  on public.posts (creator_profile_id, status, published_at desc);
create index if not exists posts_published_idx
  on public.posts (published_at desc)
  where status = 'published';
create index if not exists post_media_post_position_idx
  on public.post_media (post_id, position);
create index if not exists post_media_owner_user_id_idx
  on public.post_media (owner_user_id);

drop trigger if exists touch_posts_updated_at on public.posts;
create trigger touch_posts_updated_at
  before update on public.posts
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Authorization helpers (SECURITY DEFINER, identifier-free)
-- ----------------------------------------------------------------------------
-- Does the current user follow this creator? Mirrors is_current_user_creator:
-- reveals no identifiers and is usable by authenticated callers and policies.
create or replace function public.is_following_creator(_creator_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.follows f
    where f.follower_id = (select auth.uid())
      and f.following_creator_id = _creator_profile_id
  )
$$;

-- Granted to anon as well: the posts SELECT policies are OR-evaluated for every
-- caller (including anon reading public posts), so anon must be able to execute
-- the helpers referenced by the owner/follower policies. Both return false for a
-- null auth.uid(), so no information is exposed.
revoke execute on function public.is_following_creator(uuid) from public;
grant execute on function public.is_following_creator(uuid) to anon, authenticated;

-- is_current_user_creator (Phase 2C) is referenced by the posts owner policy and
-- is likewise evaluated for anon selects; extend its grant to anon.
grant execute on function public.is_current_user_creator(uuid) to anon;

-- Authoritative content-access check for a single post. The owning creator can
-- always view; everyone else only sees published posts, and only public ones
-- (or followers-only ones they follow). subscribers/purchase are never granted
-- to non-creators in Phase 3. Used by the signed-URL server action.
create or replace function public.can_view_post(_post_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_post public.posts%rowtype;
  v_creator_user_id uuid;
begin
  select * into v_post from public.posts where id = _post_id;
  if not found then
    return false;
  end if;

  select cp.user_id into v_creator_user_id
  from public.creator_profiles cp
  where cp.id = v_post.creator_profile_id;

  -- Owner always sees their own content (any status/visibility).
  if v_creator_user_id is not null and v_creator_user_id = v_uid then
    return true;
  end if;

  -- Non-owners only see published content.
  if v_post.status <> 'published'
     or v_post.published_at is null
     or v_post.published_at > now() then
    return false;
  end if;

  if v_post.visibility = 'public' then
    return true;
  elsif v_post.visibility = 'followers' then
    return v_uid is not null and public.is_following_creator(v_post.creator_profile_id);
  else
    -- subscribers / purchase: not available to non-creators in Phase 3.
    return false;
  end if;
end;
$$;

revoke execute on function public.can_view_post(uuid) from public;
grant execute on function public.can_view_post(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS + base privileges
-- ----------------------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.post_media enable row level security;

-- posts: owner full management via the creator-ownership helper.
create policy "Creators manage own posts"
  on public.posts for all
  using ((select public.is_current_user_creator(creator_profile_id)))
  with check ((select public.is_current_user_creator(creator_profile_id)));

-- posts: anyone may read PUBLISHED PUBLIC posts (anon + authenticated).
create policy "Anyone can read public published posts"
  on public.posts for select
  using (
    status = 'published'
    and published_at is not null
    and published_at <= now()
    and visibility = 'public'
  );

-- posts: followers may read PUBLISHED FOLLOWERS posts of creators they follow.
create policy "Followers can read followers posts"
  on public.posts for select
  using (
    status = 'published'
    and published_at is not null
    and published_at <= now()
    and visibility = 'followers'
    and (select public.is_following_creator(creator_profile_id))
  );

-- post_media: owner only. All non-owner media access flows through the
-- can_view_post-gated signed-URL server action, so the table itself never needs
-- a public/follower read policy (leak-proof — paths stay server-side).
create policy "Owners manage own post media"
  on public.post_media for all
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;
grant select, insert, update, delete on public.post_media to authenticated;
revoke all on public.post_media from anon;

-- ----------------------------------------------------------------------------
-- 4. ID-free feed read RPCs
-- ----------------------------------------------------------------------------
-- Both return the same safe, identifier-free shape (no profile/user UUIDs;
-- post_id is required for media fetches/engagement). Media is returned as path
-- metadata only — NEVER signed URLs (those require authorization + the storage
-- API and are issued by getPostMediaUrls). Keyset pagination on
-- (published_at desc, post_id desc) via the `_cursor` published_at.

-- A creator's public profile feed. Public posts are returned to everyone;
-- followers-only posts are returned to non-followers as LOCKED stubs (caption
-- and media blanked, `locked = true`) so the UI can tease them behind a Follow
-- CTA. subscribers/purchase posts are never returned here (managed in the
-- dashboard until Phase 4).
create or replace function public.feed_creator_posts(
  _username text,
  _cursor timestamptz default null,
  _limit integer default 20
)
returns table (
  post_id uuid,
  username text,
  display_name text,
  avatar_url text,
  caption text,
  visibility public.post_visibility,
  published_at timestamptz,
  locked boolean,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_creator public.creator_profiles%rowtype;
  v_is_owner boolean;
  v_is_follower boolean;
begin
  select * into v_creator
  from public.creator_profiles cp
  where lower(cp.handle) = lower(btrim(_username))
  limit 1;

  if not found then
    raise exception 'Creator not found' using errcode = 'no_data_found';
  end if;

  v_is_owner := v_uid is not null
    and v_creator.user_id is not null
    and v_creator.user_id = v_uid;
  v_is_follower := v_uid is not null and public.is_following_creator(v_creator.id);

  return query
  select
    p.id,
    lower(v_creator.handle),
    v_creator.name,
    v_creator.avatar_url,
    case
      when p.visibility = 'followers' and not (v_is_owner or v_is_follower) then ''
      else p.caption
    end,
    p.visibility,
    p.published_at,
    (p.visibility = 'followers' and not (v_is_owner or v_is_follower)) as locked,
    case
      when p.visibility = 'followers' and not (v_is_owner or v_is_follower) then '[]'::jsonb
      else (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', pm.id,
              'kind', pm.kind,
              'width', pm.width,
              'height', pm.height,
              'position', pm.position
            ) order by pm.position, pm.id
          ),
          '[]'::jsonb
        )
        from public.post_media pm
        where pm.post_id = p.id
      )
    end
  from public.posts p
  where p.creator_profile_id = v_creator.id
    and p.status = 'published'
    and p.published_at is not null
    and p.published_at <= now()
    and p.visibility in ('public', 'followers')
    and (_cursor is null or p.published_at < _cursor)
  order by p.published_at desc, p.id desc
  limit greatest(1, least(coalesce(_limit, 20), 50));
end;
$$;

create or replace function public.feed_home_posts(
  _cursor timestamptz default null,
  _limit integer default 20
)
returns table (
  post_id uuid,
  username text,
  display_name text,
  avatar_url text,
  caption text,
  visibility public.post_visibility,
  published_at timestamptz,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    p.id,
    lower(cp.handle),
    cp.name,
    cp.avatar_url,
    p.caption,
    p.visibility,
    p.published_at,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', pm.id,
            'kind', pm.kind,
            'width', pm.width,
            'height', pm.height,
            'position', pm.position
          ) order by pm.position, pm.id
        ),
        '[]'::jsonb
      )
      from public.post_media pm
      where pm.post_id = p.id
    )
  from public.posts p
  join public.creator_profiles cp on cp.id = p.creator_profile_id
  join public.follows f
    on f.following_creator_id = p.creator_profile_id
   and f.follower_id = v_uid
  where p.status = 'published'
    and p.published_at is not null
    and p.published_at <= now()
    and p.visibility in ('public', 'followers')
    and (_cursor is null or p.published_at < _cursor)
  order by p.published_at desc, p.id desc
  limit greatest(1, least(coalesce(_limit, 20), 50));
end;
$$;

revoke execute on function public.feed_creator_posts(text, timestamptz, integer) from public;
revoke execute on function public.feed_home_posts(timestamptz, integer) from public, anon;
grant execute on function public.feed_creator_posts(text, timestamptz, integer) to anon, authenticated;
grant execute on function public.feed_home_posts(timestamptz, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Private post-media storage bucket + owner-scoped object policies
-- ----------------------------------------------------------------------------
-- PRIVATE bucket: not CDN-served. Layout is "<user_id>/<post_id>/<file>", so
-- owner scoping keys on the first path segment, matching the baseline buckets.
-- Non-owners never read objects directly — the getPostMediaUrls server action
-- signs URLs with the service role after can_view_post() authorization.
insert into storage.buckets (id, name, public) values
  ('post-media', 'post-media', false)
on conflict (id) do nothing;

do $$
begin
  execute 'create policy "post-media owner select" on storage.objects for select using (bucket_id = ''post-media'' and auth.uid()::text = (storage.foldername(name))[1])';
  execute 'create policy "post-media owner insert" on storage.objects for insert with check (bucket_id = ''post-media'' and auth.uid()::text = (storage.foldername(name))[1])';
  execute 'create policy "post-media owner update" on storage.objects for update using (bucket_id = ''post-media'' and auth.uid()::text = (storage.foldername(name))[1])';
  execute 'create policy "post-media owner delete" on storage.objects for delete using (bucket_id = ''post-media'' and auth.uid()::text = (storage.foldername(name))[1])';
end $$;

-- ----------------------------------------------------------------------------
-- 6. Reserve member/creator-facing route slugs so handles cannot collide.
-- ----------------------------------------------------------------------------
insert into public.reserved_handles (handle) values
  ('feed'), ('post'), ('discover'), ('messages'), ('notifications')
on conflict (handle) do nothing;
