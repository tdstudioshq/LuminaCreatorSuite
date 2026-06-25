-- ============================================================================
-- CABANA — post-reset smoke checks
-- ============================================================================
-- Run against a freshly reset local instance with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
-- Any failed assertion raises and exits non-zero.
-- ============================================================================

do $$
declare
  expected_tables text[] := array[
    'profiles','creator_profiles','links','products',
    'analytics_events','subscriptions','user_roles','reserved_handles'
  ];
  t text;
begin
  -- Tables
  foreach t in array expected_tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'MISSING TABLE: public.%', t;
    end if;
  end loop;

  -- Enum
  if not exists (select 1 from pg_type where typname = 'app_role') then
    raise exception 'MISSING ENUM: app_role';
  end if;

  -- Functions
  if to_regprocedure('public.handle_new_user()') is null then
    raise exception 'MISSING FUNCTION: handle_new_user';
  end if;
  if to_regprocedure('public.has_role(uuid, public.app_role)') is null then
    raise exception 'MISSING FUNCTION: has_role';
  end if;
  if to_regprocedure('public.validate_creator_handle()') is null then
    raise exception 'MISSING FUNCTION: validate_creator_handle';
  end if;
  if to_regprocedure('public.touch_updated_at()') is null then
    raise exception 'MISSING FUNCTION: touch_updated_at';
  end if;

  -- Signup trigger on auth.users
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    raise exception 'MISSING TRIGGER: on_auth_user_created';
  end if;

  -- RLS enabled on owner-sensitive tables
  if not (select relrowsecurity from pg_class where oid = 'public.creator_profiles'::regclass) then
    raise exception 'RLS NOT ENABLED: creator_profiles';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass) then
    raise exception 'RLS NOT ENABLED: subscriptions';
  end if;

  -- Storage buckets
  if (select count(*) from storage.buckets where id in ('avatars','banners','products')) <> 3 then
    raise exception 'MISSING STORAGE BUCKETS (expected avatars, banners, products)';
  end if;

  -- Seed: aurora demo creator present and wired up
  if not exists (select 1 from public.creator_profiles where handle = 'aurora' and user_id is null) then
    raise exception 'MISSING SEED: aurora creator profile';
  end if;
  if (select count(*) from public.links     where profile_id = '00000000-0000-4000-a000-000000000001') < 1 then
    raise exception 'MISSING SEED: aurora links';
  end if;
  if (select count(*) from public.products  where profile_id = '00000000-0000-4000-a000-000000000001') < 1 then
    raise exception 'MISSING SEED: aurora products';
  end if;

  -- Reserved handles loaded (handle validation depends on them)
  if (select count(*) from public.reserved_handles) < 10 then
    raise exception 'MISSING SEED: reserved_handles';
  end if;

  raise notice 'CABANA smoke checks passed: schema, functions, triggers, RLS, storage, and seed are present.';
end $$;
