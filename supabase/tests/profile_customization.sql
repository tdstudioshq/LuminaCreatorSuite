-- ============================================================================
-- CABANA — profile customization behavioral checks (20260527 + 20260528):
--   * creator_profiles.headline / accent_color / button_style defaults + checks
--   * public.profiles authenticated own-row SELECT grant (dashboard guard fix)
-- Runs against a freshly reset local instance:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/profile_customization.sql
-- Self-cleaning; any failed assertion raises and exits non-zero.
-- ============================================================================

delete from auth.users where email in ('pc_creator@example.com', 'pc_other@example.com');

-- ---------------------------------------------------------------------------
-- 1. New profiles get correct defaults; CHECK constraints reject bad values.
-- ---------------------------------------------------------------------------
do $$
declare
  c uuid := gen_random_uuid();
  v_headline text; v_accent text; v_button text;
  rejected boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (c, 'pc_creator@example.com', '{"name":"PC"}'::jsonb);

  select headline, accent_color, button_style
    into v_headline, v_accent, v_button
    from public.creator_profiles where user_id = c;
  if v_headline <> '' then raise exception 'headline default = %', v_headline; end if;
  if v_accent <> '' then raise exception 'accent_color default = %', v_accent; end if;
  if v_button <> 'rounded' then raise exception 'button_style default = %', v_button; end if;

  -- Valid updates succeed.
  update public.creator_profiles
    set headline = 'Photographer', accent_color = '#c084fc', button_style = 'pill'
    where user_id = c;

  -- Invalid button_style rejected.
  rejected := false;
  begin
    update public.creator_profiles set button_style = 'triangle' where user_id = c;
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'button_style CHECK did not reject bad value'; end if;

  -- Invalid (non-hex) accent_color rejected; empty string allowed.
  rejected := false;
  begin
    update public.creator_profiles set accent_color = 'purple' where user_id = c;
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'accent_color CHECK did not reject non-hex'; end if;
  update public.creator_profiles set accent_color = '' where user_id = c;  -- '' allowed

  delete from auth.users where id = c;
  raise notice 'profile_customization (1/2) columns + checks OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 2. public.profiles: authenticated reads own row (grant), anon denied.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  cnt int; anon_denied boolean := false;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'pc_creator@example.com', '{"name":"A"}'::jsonb),
    (b, 'pc_other@example.com',   '{"name":"B"}'::jsonb);

  -- As authenticated user A → sees exactly own profiles row (grant + own-row RLS).
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.profiles;
  if cnt <> 1 then raise exception 'profiles: authenticated A sees % rows (expected 1)', cnt; end if;
  reset role;

  -- As anon → hard permission denial (no base grant; profiles stays private).
  set local role anon;
  begin
    perform 1 from public.profiles;
  exception when insufficient_privilege then anon_denied := true;
  end;
  reset role;
  if not anon_denied then raise exception 'SECURITY: anon was not denied on profiles'; end if;

  delete from auth.users where id in (a, b);
  raise notice 'profile_customization (2/2) profiles SELECT grant OK.';
end $$;
