-- ============================================================================
-- CABANA — Phase 2B: Member accounts & account-type branching
-- ============================================================================
-- Adds the first real "member vs creator" backend foundation on top of the
-- Phase 2A baseline (20260511000000_baseline.sql). It is purely additive:
--
--   * introduces a `public.account_type` enum ('creator' | 'member')
--   * stamps every shared identity row (public.profiles) with an account_type
--   * adds a private `public.member_profiles` table (owner-only RLS)
--   * teaches the signup trigger to branch: creators keep their existing
--     provisioning (creator_profile + free platform subscription); members get
--     a member_profile instead
--
-- Explicit default: account_type defaults to 'creator'. Existing rows and any
-- signup that does NOT pass raw_user_meta_data.account_type = 'member' remain
-- creators, so all current creator signup/dashboard/public-page behavior is
-- preserved unchanged.
--
-- Intentionally NOT included (later phases): creator_subscriptions, posts,
-- feed, messaging, notifications, payments. `subscriptions` is NOT renamed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Account-type enum
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.account_type as enum ('creator', 'member');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Stamp shared identity rows with an account type (default preserves
--    today's behavior: everyone is a creator unless they opt into 'member').
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists account_type public.account_type not null default 'creator';

-- ----------------------------------------------------------------------------
-- 2. Member profile (private — never exposed on public routes/views).
-- ----------------------------------------------------------------------------
create table if not exists public.member_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The unique(user_id) above already provides the owner-lookup index used by RLS.

drop trigger if exists touch_member_profiles_updated_at on public.member_profiles;
create trigger touch_member_profiles_updated_at
  before update on public.member_profiles
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. RLS — member profiles are strictly owner-scoped (no public read).
-- ----------------------------------------------------------------------------
alter table public.member_profiles enable row level security;

create policy "Members can view own member profile"
  on public.member_profiles for select using (auth.uid() = user_id);
create policy "Members can insert own member profile"
  on public.member_profiles for insert with check (auth.uid() = user_id);
create policy "Members can update own member profile"
  on public.member_profiles for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No delete policy: member profile rows are removed only via auth.users cascade.

-- Table-level privileges (RLS governs rows, but the role still needs base
-- grants). Members are private: `authenticated` gets DML, `anon` gets nothing.
-- Explicit and environment-independent — does not rely on Supabase default
-- privileges (which on the cloud would otherwise also grant `anon`).
grant select, insert, update on public.member_profiles to authenticated;
revoke all on public.member_profiles from anon;

-- ----------------------------------------------------------------------------
-- 4. Signup provisioning — branch on account type.
--    Creators: unchanged (profile + creator_profile + free plan + role).
--    Members:  profile + member_profile + role (no creator_profile / plan).
-- ----------------------------------------------------------------------------
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

  -- Explicit 'member' opts into a member account; anything else (including
  -- absent metadata) defaults to 'creator' to preserve existing behavior.
  if (new.raw_user_meta_data->>'account_type') = 'member' then
    v_account_type := 'member';
  else
    v_account_type := 'creator';
  end if;

  insert into public.profiles (id, email, name, account_type)
    values (new.id, new.email, display_name, v_account_type);

  -- Every account gets the default authorization role.
  insert into public.user_roles (user_id, role) values (new.id, 'user');

  if v_account_type = 'creator' then
    base_handle := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_-]', '', 'g');
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
    insert into public.member_profiles (user_id, display_name)
      values (new.id, display_name);
  end if;

  return new;
end;
$$;

-- CREATE OR REPLACE preserves grants, but re-assert least-privilege explicitly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Reserve the new member-facing route slugs so creators cannot claim them.
-- ----------------------------------------------------------------------------
insert into public.reserved_handles (handle) values
  ('account'),('member')
on conflict (handle) do nothing;
