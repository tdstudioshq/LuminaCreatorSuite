
-- ============ 1. USER ROLES ============
create type public.app_role as enum ('admin', 'moderator', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

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

create policy "Users can view own roles"
  on public.user_roles for select
  using (auth.uid() = user_id);

create policy "Admins can view all roles"
  on public.user_roles for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can manage roles"
  on public.user_roles for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ============ 2. HANDLE UNIQUENESS ============
create unique index creator_profiles_handle_lower_idx
  on public.creator_profiles (lower(handle));

-- ============ 3. RESERVED HANDLES ============
create table public.reserved_handles (
  handle text primary key
);
alter table public.reserved_handles enable row level security;
create policy "Anyone can view reserved handles"
  on public.reserved_handles for select using (true);

insert into public.reserved_handles (handle) values
  ('admin'),('dashboard'),('login'),('signup'),('pricing'),
  ('features'),('api'),('docs'),('demo'),('aurora'),
  ('settings'),('onboarding'),('reset-password'),('forgot-password'),
  ('support'),('help'),('terms'),('privacy');

-- Validation trigger: block reserved handles (except aurora seed row)
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

  -- Aurora is the seeded public demo profile (user_id is null) — allow it.
  if exists (select 1 from public.reserved_handles where handle = lower(new.handle))
     and not (new.handle = 'aurora' and new.user_id is null) then
    raise exception 'Handle "%" is reserved', new.handle using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger validate_creator_handle_trigger
  before insert or update of handle on public.creator_profiles
  for each row execute function public.validate_creator_handle();

-- ============ 4. UPDATE SIGNUP TRIGGER to skip reserved handles ============
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

  -- Default app role
  insert into public.user_roles (user_id, role) values (new.id, 'user');

  return new;
end;
$$;

-- Ensure the trigger exists on auth.users (created originally; safe to re-create idempotently)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ 5. STORAGE RLS — path-scoped writes ============
-- Drop any existing policies on the three buckets, then re-add scoped ones.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (policyname like '%avatars%' or policyname like '%banners%' or policyname like '%products%'
           or policyname like 'avatar%' or policyname like 'banner%' or policyname like 'product%')
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

-- AVATARS
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars owner insert"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars owner update"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars owner delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- BANNERS
create policy "banners public read"
  on storage.objects for select
  using (bucket_id = 'banners');
create policy "banners owner insert"
  on storage.objects for insert
  with check (bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "banners owner update"
  on storage.objects for update
  using (bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "banners owner delete"
  on storage.objects for delete
  using (bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]);

-- PRODUCTS
create policy "products public read"
  on storage.objects for select
  using (bucket_id = 'products');
create policy "products owner insert"
  on storage.objects for insert
  with check (bucket_id = 'products' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "products owner update"
  on storage.objects for update
  using (bucket_id = 'products' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "products owner delete"
  on storage.objects for delete
  using (bucket_id = 'products' and auth.uid()::text = (storage.foldername(name))[1]);
