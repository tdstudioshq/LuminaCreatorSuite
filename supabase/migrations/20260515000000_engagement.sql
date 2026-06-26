-- ============================================================================
-- CABANA — Phase 3.2: Engagement foundation (comments, likes, saves)
-- ============================================================================
-- Adds low-risk engagement primitives on top of the Phase 3 post system.
-- Purely additive. No monetization, messaging, notifications, or real-time.
--
--   * comment_status enum ('visible','hidden','deleted')
--   * post_comments (soft-deletable; status-driven), post_likes, post_saves
--   * block-aware engagement: a user blocked by (or blocking) the post's creator
--     cannot comment/like/save
--   * authorization helpers is_engagement_blocked, is_current_user_post_owner
--   * ID-free RPCs post_engagement_state, post_comments_list, post_card
--
-- Visibility model is inherited from Phase 3's can_view_post(): you may only
-- engage with / read comments on posts you can view (public to everyone,
-- followers to followers, owner always). Anonymous users may read visible
-- comments on viewable (public) posts but cannot write anything.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enum
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.comment_status as enum ('visible', 'hidden', 'deleted');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  status public.comment_status not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_comments_body_length check (char_length(btrim(body)) between 1 and 2000)
);

create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_likes_unique unique (post_id, user_id)
);

create table if not exists public.post_saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_saves_unique unique (post_id, user_id)
);

-- FK / lookup indexes (unique constraints already index (post_id,user_id)).
create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at desc, id desc);
create index if not exists post_comments_author_idx on public.post_comments (author_id);
create index if not exists post_likes_user_idx on public.post_likes (user_id);
create index if not exists post_saves_user_idx on public.post_saves (user_id);

drop trigger if exists touch_post_comments_updated_at on public.post_comments;
create trigger touch_post_comments_updated_at
  before update on public.post_comments
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Authorization helpers (SECURITY DEFINER, identifier-free)
-- ----------------------------------------------------------------------------
-- True if the current user is the owner (creator) of the post's creator profile.
create or replace function public.is_current_user_post_owner(_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts p
    join public.creator_profiles cp on cp.id = p.creator_profile_id
    where p.id = _post_id
      and cp.user_id = (select auth.uid())
  )
$$;

revoke execute on function public.is_current_user_post_owner(uuid) from public;
grant execute on function public.is_current_user_post_owner(uuid) to anon, authenticated;

-- True if a block exists in EITHER direction between the current user and the
-- post's owning creator. Used to deny engagement across a block.
create or replace function public.is_engagement_blocked(_post_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_creator_user_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  select cp.user_id into v_creator_user_id
  from public.posts p
  join public.creator_profiles cp on cp.id = p.creator_profile_id
  where p.id = _post_id;

  if v_creator_user_id is null or v_creator_user_id = v_uid then
    return false;
  end if;

  return exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_uid and b.blocked_user_id = v_creator_user_id)
       or (b.blocker_id = v_creator_user_id and b.blocked_user_id = v_uid)
  );
end;
$$;

revoke execute on function public.is_engagement_blocked(uuid) from public, anon;
grant execute on function public.is_engagement_blocked(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS + base privileges
-- ----------------------------------------------------------------------------
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;

-- comments: read visible comments on any viewable post (anon gets public only,
-- via can_view_post); authors read their own; post owners read all on their posts.
create policy "Read visible comments on viewable posts"
  on public.post_comments for select
  using (status = 'visible' and (select public.can_view_post(post_id)));
create policy "Authors read own comments"
  on public.post_comments for select
  using (author_id = (select auth.uid()));
create policy "Post owners read comments on own posts"
  on public.post_comments for select
  using ((select public.is_current_user_post_owner(post_id)));

-- comments: an authenticated, non-blocked user may comment on a viewable post.
create policy "Comment on viewable posts"
  on public.post_comments for insert
  with check (
    author_id = (select auth.uid())
    and status = 'visible'
    and (select public.can_view_post(post_id))
    and not (select public.is_engagement_blocked(post_id))
  );

-- comments: authors edit their own still-visible comment; post owners may update
-- (used to hide). No DELETE policy — comments are soft-deleted via status.
create policy "Authors edit own visible comments"
  on public.post_comments for update
  using (author_id = (select auth.uid()) and status = 'visible')
  with check (author_id = (select auth.uid()));
create policy "Post owners moderate comments on own posts"
  on public.post_comments for update
  using ((select public.is_current_user_post_owner(post_id)))
  with check ((select public.is_current_user_post_owner(post_id)));

-- likes: private to the actor; insert requires viewability + no block.
create policy "Read own likes"
  on public.post_likes for select
  using (user_id = (select auth.uid()));
create policy "Like viewable posts"
  on public.post_likes for insert
  with check (
    user_id = (select auth.uid())
    and (select public.can_view_post(post_id))
    and not (select public.is_engagement_blocked(post_id))
  );
create policy "Remove own likes"
  on public.post_likes for delete
  using (user_id = (select auth.uid()));

-- saves: same shape as likes, strictly private.
create policy "Read own saves"
  on public.post_saves for select
  using (user_id = (select auth.uid()));
create policy "Save viewable posts"
  on public.post_saves for insert
  with check (
    user_id = (select auth.uid())
    and (select public.can_view_post(post_id))
    and not (select public.is_engagement_blocked(post_id))
  );
create policy "Remove own saves"
  on public.post_saves for delete
  using (user_id = (select auth.uid()));

grant select on public.post_comments to anon, authenticated;
grant insert, update on public.post_comments to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.post_saves to authenticated;
revoke all on public.post_likes from anon;
revoke all on public.post_saves from anon;

-- ----------------------------------------------------------------------------
-- 4. ID-free engagement RPCs
-- ----------------------------------------------------------------------------
-- Aggregate counts + the caller's own like/save state for one post. Counts are
-- computed with owner privileges (likes/saves are otherwise private), but only
-- after can_view_post authorizes the caller.
create or replace function public.post_engagement_state(_post_id uuid)
returns table (
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean,
  saved_by_me boolean,
  can_engage boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not (select public.can_view_post(_post_id)) then
    raise exception 'Post not found' using errcode = 'no_data_found';
  end if;

  return query
  select
    (select count(*) from public.post_likes l where l.post_id = _post_id),
    (select count(*) from public.post_comments c
      where c.post_id = _post_id and c.status = 'visible'),
    (v_uid is not null and exists (
      select 1 from public.post_likes l where l.post_id = _post_id and l.user_id = v_uid)),
    (v_uid is not null and exists (
      select 1 from public.post_saves s where s.post_id = _post_id and s.user_id = v_uid)),
    (v_uid is not null and not (select public.is_engagement_blocked(_post_id)));
end;
$$;

-- Visible comments for a viewable post, newest first, with safe author identity
-- (no UUIDs beyond the comment id). `mine` flags the caller's own comments.
create or replace function public.post_comments_list(
  _post_id uuid,
  _cursor timestamptz default null,
  _limit integer default 30
)
returns table (
  comment_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not (select public.can_view_post(_post_id)) then
    raise exception 'Post not found' using errcode = 'no_data_found';
  end if;

  return query
  select
    c.id,
    coalesce(mp.username, cp.handle),
    coalesce(mp.display_name, cp.name, pr.name),
    coalesce(mp.avatar_url, cp.avatar_url),
    c.body,
    c.created_at,
    (v_uid is not null and c.author_id = v_uid)
  from public.post_comments c
  join public.profiles pr on pr.id = c.author_id
  left join public.member_profiles mp on mp.user_id = c.author_id
  left join public.creator_profiles cp on cp.user_id = c.author_id
  where c.post_id = _post_id
    and c.status = 'visible'
    and (_cursor is null or c.created_at < _cursor)
  order by c.created_at desc, c.id desc
  limit greatest(1, least(coalesce(_limit, 30), 100));
end;
$$;

-- Single safe post card by id (locked-aware), for the post detail page. Mirrors
-- feed_creator_posts' row shape for one post.
create or replace function public.post_card(_post_id uuid)
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
  v_post public.posts%rowtype;
  v_creator public.creator_profiles%rowtype;
  v_is_owner boolean;
  v_is_follower boolean;
begin
  select * into v_post from public.posts where id = _post_id;
  if not found then
    raise exception 'Post not found' using errcode = 'no_data_found';
  end if;

  select * into v_creator from public.creator_profiles where id = v_post.creator_profile_id;
  v_is_owner := v_uid is not null and v_creator.user_id is not null and v_creator.user_id = v_uid;
  v_is_follower := v_uid is not null and public.is_following_creator(v_creator.id);

  -- Non-owners only see published public/followers posts.
  if not v_is_owner and (
    v_post.status <> 'published'
    or v_post.published_at is null
    or v_post.published_at > now()
    or v_post.visibility not in ('public', 'followers')
  ) then
    raise exception 'Post not found' using errcode = 'no_data_found';
  end if;

  return query
  select
    v_post.id,
    lower(v_creator.handle),
    v_creator.name,
    v_creator.avatar_url,
    case when v_post.visibility = 'followers' and not (v_is_owner or v_is_follower)
      then '' else v_post.caption end,
    v_post.visibility,
    v_post.published_at,
    (v_post.visibility = 'followers' and not (v_is_owner or v_is_follower)),
    case when v_post.visibility = 'followers' and not (v_is_owner or v_is_follower)
      then '[]'::jsonb
      else (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'id', pm.id, 'kind', pm.kind, 'width', pm.width,
            'height', pm.height, 'position', pm.position
          ) order by pm.position, pm.id), '[]'::jsonb)
        from public.post_media pm where pm.post_id = v_post.id
      )
    end;
end;
$$;

revoke execute on function public.post_engagement_state(uuid) from public;
revoke execute on function public.post_comments_list(uuid, timestamptz, integer) from public;
revoke execute on function public.post_card(uuid) from public;
grant execute on function public.post_engagement_state(uuid) to anon, authenticated;
grant execute on function public.post_comments_list(uuid, timestamptz, integer) to anon, authenticated;
grant execute on function public.post_card(uuid) to anon, authenticated;
