-- ============================================================================
-- CABANA — BASELINE SCHEMA (squashed, rebuildable-from-zero)
-- ============================================================================
-- This single migration reconstructs the COMPLETE current production schema so
-- a fresh local/staging Supabase instance can be built from zero with
-- `supabase db reset`.
--
-- Provenance: reconstructed from the four incremental migrations (archived under
-- supabase/_archive/pre_baseline_migrations/), the generated type definitions in
-- src/integrations/supabase/types.ts, and CABANA_ARCHITECTURE.md. The incremental
-- migrations were NOT self-sufficient (they ALTER tables whose CREATE statements
-- lived only in the remote project), which is exactly why this baseline exists.
--
-- Scope (Phase 2A): captures the EXISTING schema only. It intentionally does NOT
-- add member_profiles, posts, messaging, notifications, payments, or
-- creator_subscriptions, and does NOT rename `subscriptions`.
--
-- Idempotency: written so it can run on a clean database. Supabase provisions the
-- auth schema, storage schema, and the anon/authenticated/service_role roles and
-- their default privileges before user migrations run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'moderator', 'user');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Core tables
-- ----------------------------------------------------------------------------

-- Shared account identity (1:1 with auth.users), provisioned by handle_new_user.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public creator presence. user_id is nullable to allow ownerless seed profiles
-- (e.g. the `aurora` demo). Drives the public /$username page.
create table if not exists public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  handle text not null,
  name text not null default '',
  bio text not null default '',
  avatar_url text,
  banner_url text,
  theme text not null default 'iridescent',
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Smart-link blocks on the public page.
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  title text not null default 'New link',
  url text not null default 'https://',
  icon text not null default 'globe',
  featured boolean not null default false,
  scheduled text,
  position integer not null default 0,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);

-- Storefront products.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  title text not null default 'New product',
  price text not null default '$0',
  type text not null default 'Physical',
  image_url text,
  sales integer not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- First-party page/link/product analytics events.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.creator_profiles (id) on delete set null,
  event_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- CABANA PLATFORM (SaaS) plan per account. NOT fan-to-creator subscriptions.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Authorization roles.
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Handles that cannot be claimed by creators.
create table if not exists public.reserved_handles (
  handle text primary key
);

-- ----------------------------------------------------------------------------
-- 2. Indexes (as represented in the prior migrations)
-- ----------------------------------------------------------------------------
create unique index if not exists creator_profiles_handle_lower_idx
  on public.creator_profiles (lower(handle));

-- ----------------------------------------------------------------------------
-- 3. Functions
-- ----------------------------------------------------------------------------

-- updated_at touch trigger function.
create or replace function public.touch_updated_at()
returns trigger language plpgsql
security invoker
set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;

-- Role check helper (invoked only by RLS policies / trusted code).
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Block reserved handles (the `aurora` seed with a null user_id is allowed).
create or replace function public.validate_creator_handle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.handle is null or length(trim(new.handle)) = 0 then
    raise exception 'Handle cannot be empty';
  end if;

  if exists (select 1 from public.reserved_handles where handle = lower(new.handle))
     and not (new.handle = 'aurora' and new.user_id is null) then
    raise exception 'Handle "%" is reserved', new.handle using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Signup provisioning: profile + creator profile + free plan + default role.
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
begin
  display_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

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

  insert into public.profiles (id, email, name)
    values (new.id, new.email, display_name);

  insert into public.creator_profiles (user_id, handle, name, bio, theme)
    values (new.id, candidate, display_name, '', 'iridescent');

  insert into public.subscriptions (user_id, plan, status)
    values (new.id, 'free', 'active');

  insert into public.user_roles (user_id, role) values (new.id, 'user');

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Triggers
-- ----------------------------------------------------------------------------
drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_creator_profiles_updated_at on public.creator_profiles;
create trigger touch_creator_profiles_updated_at
  before update on public.creator_profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_subscriptions_updated_at on public.subscriptions;
create trigger touch_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists validate_creator_handle_trigger on public.creator_profiles;
create trigger validate_creator_handle_trigger
  before insert or update of handle on public.creator_profiles
  for each row execute function public.validate_creator_handle();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.creator_profiles  enable row level security;
alter table public.links             enable row level security;
alter table public.products          enable row level security;
alter table public.analytics_events  enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.user_roles        enable row level security;
alter table public.reserved_handles  enable row level security;

-- profiles: owner only.
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- creator_profiles: public read (drives /$username); owner writes.
-- NOTE: public select currently exposes user_id. Preserved to match current
-- behavior; a public-safe view that omits user_id is Phase 2B work.
create policy "Public can view creator profiles"
  on public.creator_profiles for select using (true);
create policy "Owners can insert own creator profile"
  on public.creator_profiles for insert with check (auth.uid() = user_id);
create policy "Owners can update own creator profile"
  on public.creator_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- links: public read; owner full management.
create policy "Public can view links"
  on public.links for select using (true);
create policy "Owners manage own links"
  on public.links for all
  using (exists (
    select 1 from public.creator_profiles cp
    where cp.id = links.profile_id and cp.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.creator_profiles cp
    where cp.id = links.profile_id and cp.user_id = auth.uid()
  ));

-- products: public read; owner full management.
create policy "Public can view products"
  on public.products for select using (true);
create policy "Owners manage own products"
  on public.products for all
  using (exists (
    select 1 from public.creator_profiles cp
    where cp.id = products.profile_id and cp.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.creator_profiles cp
    where cp.id = products.profile_id and cp.user_id = auth.uid()
  ));

-- analytics_events: anyone may record events for a real profile; owners read own.
create policy "Visitors can record events on real profiles"
  on public.analytics_events for insert
  with check (
    profile_id is not null
    and exists (select 1 from public.creator_profiles cp where cp.id = profile_id)
  );
create policy "Creators read own analytics"
  on public.analytics_events for select
  using (exists (
    select 1 from public.creator_profiles cp
    where cp.id = analytics_events.profile_id and cp.user_id = auth.uid()
  ));

-- subscriptions: owner read only (writes are trigger/service-side).
create policy "Users can view own subscription"
  on public.subscriptions for select using (auth.uid() = user_id);

-- user_roles.
create policy "Users can view own roles"
  on public.user_roles for select using (auth.uid() = user_id);
create policy "Admins can view all roles"
  on public.user_roles for select using (public.has_role(auth.uid(), 'admin'));
create policy "Admins can manage roles"
  on public.user_roles for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- reserved_handles: public read.
create policy "Anyone can view reserved handles"
  on public.reserved_handles for select using (true);

-- ----------------------------------------------------------------------------
-- 6. Storage buckets + object policies (final owner-scoped state)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('avatars',  'avatars',  true),
  ('banners',  'banners',  true),
  ('products', 'products', true)
on conflict (id) do nothing;

-- Public buckets serve files over the CDN regardless of object RLS; these
-- policies govern API access (listing/upload/update/delete) and are owner-scoped
-- by the first path segment ("<user_id>/<file>").
do $$
declare b text;
begin
  foreach b in array array['avatars','banners','products'] loop
    execute format(
      'create policy %1$I on storage.objects for select using (bucket_id = %2$L and auth.uid()::text = (storage.foldername(name))[1])',
      b || ' owner select', b);
    execute format(
      'create policy %1$I on storage.objects for insert with check (bucket_id = %2$L and auth.uid()::text = (storage.foldername(name))[1])',
      b || ' owner insert', b);
    execute format(
      'create policy %1$I on storage.objects for update using (bucket_id = %2$L and auth.uid()::text = (storage.foldername(name))[1])',
      b || ' owner update', b);
    execute format(
      'create policy %1$I on storage.objects for delete using (bucket_id = %2$L and auth.uid()::text = (storage.foldername(name))[1])',
      b || ' owner delete', b);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 7. Reserved handle data (handle validation depends on these rows)
-- ----------------------------------------------------------------------------
insert into public.reserved_handles (handle) values
  ('admin'),('dashboard'),('login'),('signup'),('pricing'),
  ('features'),('api'),('docs'),('demo'),('aurora'),
  ('settings'),('onboarding'),('reset-password'),('forgot-password'),
  ('support'),('help'),('terms'),('privacy')
on conflict (handle) do nothing;

-- ----------------------------------------------------------------------------
-- 8. Least-privilege: SECURITY DEFINER helpers are invoked by RLS/triggers only.
-- ----------------------------------------------------------------------------
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_creator_handle() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
