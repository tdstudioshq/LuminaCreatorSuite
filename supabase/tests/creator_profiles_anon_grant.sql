-- ============================================================================
-- CABANA — creator_profiles anon column-scoped SELECT checks (20260532):
--   * anon CAN read the public profile columns (id, handle, name, …)
--   * anon CANNOT read creator_profiles.user_id (the auth.users UUID) — 42501
--   * authenticated keeps full-table SELECT incl. user_id (owner reads)
--   * the "Public can view creator profiles" policy is unchanged (rows visible)
-- Runs against a freshly reset local instance:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/creator_profiles_anon_grant.sql
-- Self-cleaning; any failed assertion raises and exits non-zero.
-- ============================================================================

delete from auth.users where email = 'cpag_creator@example.com';

-- ---------------------------------------------------------------------------
-- 1. Catalog-level column privileges: the grant is column-scoped as intended.
--    (has_column_privilege reflects the grant regardless of row count.)
-- ---------------------------------------------------------------------------
do $$
declare
  public_cols text[] := array[
    'id','handle','name','bio','avatar_url','banner_url','theme','plan',
    'created_at','updated_at','headline','accent_color','button_style'
  ];
  col text;
begin
  -- anon can read every public column …
  foreach col in array public_cols loop
    if not has_column_privilege('anon', 'public.creator_profiles', col, 'select') then
      raise exception 'anon must be able to SELECT public.creator_profiles.% (public profile column)', col;
    end if;
  end loop;

  -- … but NOT user_id.
  if has_column_privilege('anon', 'public.creator_profiles', 'user_id', 'select') then
    raise exception
      'SECURITY: anon must NOT be able to SELECT public.creator_profiles.user_id (auth UUID leak)';
  end if;

  -- authenticated keeps full-table SELECT (owners read their own user_id).
  if not has_column_privilege('authenticated', 'public.creator_profiles', 'user_id', 'select') then
    raise exception 'authenticated must keep SELECT on creator_profiles.user_id (owner reads)';
  end if;
  if not has_table_privilege('authenticated', 'public.creator_profiles', 'select') then
    raise exception 'authenticated must keep full-table SELECT on creator_profiles';
  end if;

  raise notice 'creator_profiles_anon_grant (1/3) column privileges OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Behavioral: as anon, public columns succeed and user_id is hard-denied,
--    against a real seeded row (policy USING (true) keeps the row visible).
-- ---------------------------------------------------------------------------
do $$
declare
  c uuid := gen_random_uuid();
  v_handle text;
  visible int;
  userid_denied boolean := false;
begin
  -- handle_new_user provisions a creator_profiles row for this creator.
  insert into auth.users (id, email, raw_user_meta_data)
    values (c, 'cpag_creator@example.com', '{"name":"CPAG"}'::jsonb);
  update public.creator_profiles set handle = 'cpag_handle' where user_id = c;

  set local role anon;

  -- Public columns read fine, and the public SELECT policy still exposes the row.
  select handle into v_handle from public.creator_profiles where handle = 'cpag_handle';
  if v_handle is distinct from 'cpag_handle' then
    raise exception 'anon public read broken: expected cpag_handle, got %', v_handle;
  end if;
  select count(*) into visible from public.creator_profiles where handle = 'cpag_handle';
  if visible <> 1 then
    raise exception 'public-profile behavior broken: anon sees % rows for the seeded creator (expected 1)', visible;
  end if;

  -- user_id is column-denied — even selecting it raises insufficient_privilege.
  begin
    perform user_id from public.creator_profiles where handle = 'cpag_handle';
  exception when insufficient_privilege then userid_denied := true;
  end;

  reset role;

  if not userid_denied then
    raise exception 'SECURITY: anon SELECT of creator_profiles.user_id was NOT denied';
  end if;

  delete from auth.users where id = c;
  raise notice 'creator_profiles_anon_grant (2/3) anon behavioral read OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Behavioral: authenticated owner still reads user_id on their own row.
-- ---------------------------------------------------------------------------
do $$
declare
  c uuid := gen_random_uuid();
  v_uid uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (c, 'cpag_creator@example.com', '{"name":"CPAG"}'::jsonb);

  perform set_config('request.jwt.claims',
    json_build_object('sub', c::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select user_id into v_uid from public.creator_profiles where user_id = c;
  reset role;

  if v_uid is distinct from c then
    raise exception 'authenticated owner could not read own user_id (got %, expected %)', v_uid, c;
  end if;

  delete from auth.users where id = c;
  raise notice 'creator_profiles_anon_grant (3/3) authenticated owner read OK.';
end $$;

select 'creator_profiles_anon_grant checks passed' as result;
