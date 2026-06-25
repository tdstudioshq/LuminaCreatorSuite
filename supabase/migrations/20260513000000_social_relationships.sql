-- ============================================================================
-- CABANA — Phase 2C: Social relationship foundation
-- ============================================================================
-- Adds the relationship graph only:
--   * member usernames for safe public identity
--   * follows (account -> creator)
--   * blocks (account -> account)
--   * ID-free public creator/member profile views with aggregate counts
--
-- No posts, feed, comments, likes, saves, messaging, notifications,
-- subscriptions, payments, or production Supabase operations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Public member usernames
-- ----------------------------------------------------------------------------
-- Member profiles were private in Phase 2B. Phase 2C adds a stable public
-- username so the safe public view never needs to expose user/profile UUIDs.
alter table public.member_profiles
  add column if not exists username text;

update public.member_profiles
set username = 'member_' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12)
where username is null or btrim(username) = '';

alter table public.member_profiles
  alter column username set not null;

alter table public.member_profiles
  alter column username set default (
    'member_' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12)
  );

create unique index if not exists member_profiles_username_lower_idx
  on public.member_profiles (lower(username));

create or replace function public.validate_member_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.username := lower(btrim(new.username));

  if new.username !~ '^[a-z0-9_-]{1,64}$' then
    raise exception 'Member username must contain 1-64 lowercase letters, numbers, underscores, or hyphens'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.reserved_handles where handle = new.username) then
    raise exception 'Username "%" is reserved', new.username using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_member_username_trigger on public.member_profiles;
create trigger validate_member_username_trigger
  before insert or update of username on public.member_profiles
  for each row execute function public.validate_member_username();

-- Extend signup provisioning so new members receive a collision-safe username.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
  candidate text;
  n int := 0;
  display_name text;
  v_account_type public.account_type;
begin
  display_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  if (new.raw_user_meta_data->>'account_type') = 'member' then
    v_account_type := 'member';
  else
    v_account_type := 'creator';
  end if;

  insert into public.profiles (id, email, name, account_type)
    values (new.id, new.email, display_name, v_account_type);

  insert into public.user_roles (user_id, role) values (new.id, 'user');

  base_handle := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_-]', '', 'g');

  if v_account_type = 'creator' then
    if base_handle = '' or base_handle is null then
      base_handle := 'creator';
    end if;
    candidate := base_handle;
    while exists (select 1 from public.creator_profiles where lower(handle) = candidate)
          or exists (select 1 from public.reserved_handles where handle = candidate) loop
      n := n + 1;
      candidate := base_handle || n::text;
    end loop;

    insert into public.creator_profiles (user_id, handle, name, bio, theme)
      values (new.id, candidate, display_name, '', 'iridescent');

    insert into public.subscriptions (user_id, plan, status)
      values (new.id, 'free', 'active');
  else
    if base_handle = '' or base_handle is null then
      base_handle := 'member';
    end if;
    candidate := base_handle;
    while exists (select 1 from public.member_profiles where lower(username) = candidate)
          or exists (select 1 from public.reserved_handles where handle = candidate) loop
      n := n + 1;
      candidate := base_handle || n::text;
    end loop;

    insert into public.member_profiles (user_id, username, display_name)
      values (new.id, candidate, display_name);
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_member_username() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Relationship tables
-- ----------------------------------------------------------------------------
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_follower_creator_unique unique (follower_id, following_creator_id)
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_user_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  constraint blocks_blocker_blocked_unique unique (blocker_id, blocked_user_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_user_id),
  constraint blocks_reason_length check (reason is null or char_length(reason) <= 280)
);

-- Unique constraints index follower_id/blocker_id first. Add the reverse-side
-- indexes used by follower counts, creator reads, FK cascades, and future
-- block enforcement.
create index if not exists follows_following_creator_id_idx
  on public.follows (following_creator_id);
create index if not exists blocks_blocked_user_id_idx
  on public.blocks (blocked_user_id);

-- ----------------------------------------------------------------------------
-- 3. RLS + base privileges
-- ----------------------------------------------------------------------------
alter table public.follows enable row level security;
alter table public.blocks enable row level security;

-- RLS cannot safely query creator_profiles directly because authenticated
-- callers intentionally do not have table-level SELECT (that would expose
-- user_id). This boolean helper reveals no identifiers and is usable only by
-- authenticated callers and policies.
create or replace function public.is_current_user_creator(_creator_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.creator_profiles cp
    where cp.id = _creator_profile_id
      and cp.user_id = (select auth.uid())
  )
$$;

revoke execute on function public.is_current_user_creator(uuid) from public, anon;
grant execute on function public.is_current_user_creator(uuid) to authenticated;

-- Followers can read and modify their own relationship rows. A creator can
-- read rows targeting their own creator profile, enabling exact follower
-- counts/listing without exposing other creators' relationships.
create policy "Users can view own follows"
  on public.follows for select
  using ((select auth.uid()) = follower_id);

create policy "Creators can view own followers"
  on public.follows for select
  using ((select public.is_current_user_creator(following_creator_id)));

create policy "Users can create own follows"
  on public.follows for insert
  with check (
    (select auth.uid()) = follower_id
    and not (select public.is_current_user_creator(following_creator_id))
  );

create policy "Users can delete own follows"
  on public.follows for delete
  using ((select auth.uid()) = follower_id);

-- Blocks are intentionally private. Only the blocker can observe or modify
-- their block rows. The blocked account cannot infer who blocked them.
create policy "Users can view own blocks"
  on public.blocks for select
  using ((select auth.uid()) = blocker_id);

create policy "Users can create own blocks"
  on public.blocks for insert
  with check ((select auth.uid()) = blocker_id);

create policy "Users can delete own blocks"
  on public.blocks for delete
  using ((select auth.uid()) = blocker_id);

grant select, insert, delete on public.follows to authenticated;
grant select, insert, delete on public.blocks to authenticated;
revoke all on public.follows from anon;
revoke all on public.blocks from anon;

-- ----------------------------------------------------------------------------
-- 4. Narrow relationship RPCs for protected server actions
-- ----------------------------------------------------------------------------
-- These functions accept public creator usernames and always derive the actor
-- from auth.uid(). They expose no UUIDs and cannot act for another account.
create or replace function public.relationship_state(_username text)
returns table (
  username text,
  following boolean,
  blocked_by_me boolean,
  follower_count bigint,
  following_count bigint,
  is_self boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_creator public.creator_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select *
    into v_creator
  from public.creator_profiles cp
  where lower(cp.handle) = lower(btrim(_username))
  limit 1;

  if not found then
    raise exception 'Creator not found' using errcode = 'no_data_found';
  end if;

  return query
  select
    lower(v_creator.handle),
    exists (
      select 1
      from public.follows f
      where f.follower_id = v_user_id
        and f.following_creator_id = v_creator.id
    ),
    (
      v_creator.user_id is not null
      and exists (
        select 1
        from public.blocks b
        where b.blocker_id = v_user_id
          and b.blocked_user_id = v_creator.user_id
      )
    ),
    (
      select count(*)
      from public.follows f
      where f.following_creator_id = v_creator.id
    ),
    (
      select count(*)
      from public.follows f
      where f.follower_id = v_user_id
    ),
    v_creator.user_id = v_user_id;
end;
$$;

create or replace function public.relationship_follow_creator(_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_creator public.creator_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select *
    into v_creator
  from public.creator_profiles cp
  where lower(cp.handle) = lower(btrim(_username))
  limit 1;

  if not found then
    raise exception 'Creator not found' using errcode = 'no_data_found';
  end if;
  if v_creator.user_id = v_user_id then
    raise exception 'You cannot follow your own creator profile' using errcode = 'check_violation';
  end if;
  if v_creator.user_id is not null and exists (
    select 1
    from public.blocks b
    where b.blocker_id = v_user_id
      and b.blocked_user_id = v_creator.user_id
  ) then
    raise exception 'Unblock this creator before following them' using errcode = 'check_violation';
  end if;

  insert into public.follows (follower_id, following_creator_id)
    values (v_user_id, v_creator.id)
  on conflict (follower_id, following_creator_id) do nothing;
end;
$$;

create or replace function public.relationship_unfollow_creator(_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_creator_profile_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select cp.id
    into v_creator_profile_id
  from public.creator_profiles cp
  where lower(cp.handle) = lower(btrim(_username))
  limit 1;

  if v_creator_profile_id is null then
    raise exception 'Creator not found' using errcode = 'no_data_found';
  end if;

  delete from public.follows
  where follower_id = v_user_id
    and following_creator_id = v_creator_profile_id;
end;
$$;

revoke execute on function public.relationship_state(text) from public, anon;
revoke execute on function public.relationship_follow_creator(text) from public, anon;
revoke execute on function public.relationship_unfollow_creator(text) from public, anon;
grant execute on function public.relationship_state(text) to authenticated;
grant execute on function public.relationship_follow_creator(text) to authenticated;
grant execute on function public.relationship_unfollow_creator(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. ID-free public profile views
-- ----------------------------------------------------------------------------
-- These views intentionally run with owner privileges so they can aggregate
-- private relationship rows while exposing only the explicit safe columns.
-- No auth UUID, profile UUID, email, plan, theme, or private metadata leaves
-- either view.
drop view if exists public.public_creator_profiles;
create view public.public_creator_profiles
with (security_barrier = true, security_invoker = false)
as
select
  cp.handle as username,
  cp.name as display_name,
  cp.avatar_url,
  cp.banner_url,
  cp.bio,
  false::boolean as verified,
  (
    select count(*)
    from public.follows f
    where f.following_creator_id = cp.id
  )::bigint as follower_count,
  (
    select count(*)
    from public.follows f
    where f.follower_id = cp.user_id
  )::bigint as following_count,
  0::bigint as post_count
from public.creator_profiles cp;

drop view if exists public.public_member_profiles;
create view public.public_member_profiles
with (security_barrier = true, security_invoker = false)
as
select
  mp.username,
  mp.display_name,
  mp.avatar_url,
  null::text as banner_url,
  mp.bio,
  false::boolean as verified,
  0::bigint as follower_count,
  (
    select count(*)
    from public.follows f
    where f.follower_id = mp.user_id
  )::bigint as following_count,
  0::bigint as post_count
from public.member_profiles mp;

revoke all on public.public_creator_profiles from public, anon, authenticated;
revoke all on public.public_member_profiles from public, anon, authenticated;
grant select on public.public_creator_profiles to anon, authenticated;
grant select on public.public_member_profiles to anon, authenticated;
