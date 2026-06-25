-- ============================================================================
-- CABANA — Phase 2B behavioral checks: account-type trigger branching + RLS
-- ============================================================================
-- Runs against a freshly reset local instance:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/member_accounts.sql
-- Self-cleaning (removes its synthetic auth.users at the end). Any failed
-- assertion raises and exits non-zero.
-- ============================================================================

-- Guard against residue from a previously aborted run.
delete from auth.users
where email in ('smoke_creator@example.com', 'smoke_member@example.com',
                'rls_a@example.com', 'rls_b@example.com');

-- ---------------------------------------------------------------------------
-- 1. Signup-trigger branching: creator vs member provisioning.
-- ---------------------------------------------------------------------------
do $$
declare
  creator_id uuid := gen_random_uuid();
  member_id  uuid := gen_random_uuid();
  v_acct public.account_type;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (creator_id, 'smoke_creator@example.com', '{"name":"Maker"}'::jsonb),
    (member_id,  'smoke_member@example.com',  '{"name":"Fan","account_type":"member"}'::jsonb);

  -- Creator → account_type creator, creator_profile + subscription, NO member_profile.
  select account_type into v_acct from public.profiles where id = creator_id;
  if v_acct is distinct from 'creator' then raise exception 'creator account_type = %', v_acct; end if;
  if not exists (select 1 from public.creator_profiles where user_id = creator_id) then
    raise exception 'creator missing creator_profile'; end if;
  if not exists (select 1 from public.subscriptions where user_id = creator_id) then
    raise exception 'creator missing subscription'; end if;
  if exists (select 1 from public.member_profiles where user_id = creator_id) then
    raise exception 'creator should NOT have member_profile'; end if;

  -- Member → account_type member, member_profile, NO creator_profile / subscription.
  select account_type into v_acct from public.profiles where id = member_id;
  if v_acct is distinct from 'member' then raise exception 'member account_type = %', v_acct; end if;
  if not exists (select 1 from public.member_profiles where user_id = member_id) then
    raise exception 'member missing member_profile'; end if;
  if exists (select 1 from public.creator_profiles where user_id = member_id) then
    raise exception 'member should NOT have creator_profile'; end if;
  if exists (select 1 from public.subscriptions where user_id = member_id) then
    raise exception 'member should NOT have subscription'; end if;

  -- Both accounts get the default authorization role; member name is seeded.
  if not public.has_role(creator_id, 'user') then raise exception 'creator missing user role'; end if;
  if not public.has_role(member_id, 'user') then raise exception 'member missing user role'; end if;
  if (select display_name from public.member_profiles where user_id = member_id) <> 'Fan' then
    raise exception 'member display_name not seeded'; end if;

  delete from auth.users where id in (creator_id, member_id);
  raise notice 'Phase 2B (1/2) trigger branching OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 2. member_profiles RLS: owner-scoped reads/writes; anon fully denied.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  cnt int; anon_denied boolean := false; b_bio text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'rls_a@example.com', '{"name":"A","account_type":"member"}'::jsonb),
    (b, 'rls_b@example.com', '{"name":"B","account_type":"member"}'::jsonb);

  -- As member A.
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into cnt from public.member_profiles;
  if cnt <> 1 then raise exception 'RLS: member A sees % rows (expected 1)', cnt; end if;

  update public.member_profiles set bio = 'hax' where user_id = b;  -- RLS → 0 rows
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'RLS: member A updated % of B''s rows', cnt; end if;
  reset role;

  -- As anon → hard permission denial (no base grant on the private table).
  set local role anon;
  begin
    perform 1 from public.member_profiles;
  exception when insufficient_privilege then anon_denied := true;
  end;
  reset role;
  if not anon_denied then raise exception 'SECURITY: anon was not denied on member_profiles'; end if;

  select bio into b_bio from public.member_profiles where user_id = b;
  if b_bio <> '' then raise exception 'RLS: B bio was mutated to %', b_bio; end if;

  delete from auth.users where id in (a, b);
  raise notice 'Phase 2B (2/2) member_profiles RLS OK.';
end $$;
