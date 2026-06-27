-- ============================================================================
-- CABANA — user_roles admin policy behavioral checks
-- ============================================================================
-- Proves the fix in 20260526000000_user_roles_admin_policy.sql: an authenticated
-- user can read their OWN role (the useHasRole path that previously failed with
-- `permission denied for function has_role`), cannot read other users' roles,
-- and cannot self-escalate; an admin can still read and manage all roles via the
-- is_current_user_admin() wrapper; anon is denied entirely. Self-cleaning; any
-- failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'ur_admin@example.com',
  'ur_user@example.com',
  'ur_other@example.com'
);

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_user_id  uuid := gen_random_uuid();
  v_other_id uuid := gen_random_uuid();
  cnt int;
  denied boolean;
begin
  -- handle_new_user provisions a ('user') role row for each on insert.
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_admin_id, 'ur_admin@example.com', '{"name":"UR Admin"}'::jsonb),
    (v_user_id,  'ur_user@example.com',  '{"name":"UR User","account_type":"member"}'::jsonb),
    (v_other_id, 'ur_other@example.com', '{"name":"UR Other","account_type":"member"}'::jsonb);

  -- Promote one user to admin.
  insert into public.user_roles (user_id, role) values (v_admin_id, 'admin');

  -- ---------------------------------------------------------------------------
  -- 1. A regular authenticated user (non-admin): the useHasRole query shape.
  --    Pre-fix this whole block raised `permission denied for function has_role`.
  -- ---------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- 1a. reads their own role (exact useHasRole filter: user_id + role).
  select count(*) into cnt
    from public.user_roles where user_id = v_user_id and role = 'user';
  if cnt <> 1 then
    raise exception 'authenticated user cannot read own role (got %)', cnt;
  end if;

  -- 1b. an unfiltered read returns ONLY their own row (no leakage, no error).
  select count(*) into cnt from public.user_roles;
  if cnt <> 1 then
    raise exception 'authenticated user saw % role rows (expected own 1)', cnt;
  end if;

  -- 1c. cannot read another user's roles.
  select count(*) into cnt from public.user_roles where user_id = v_other_id;
  if cnt <> 0 then
    raise exception 'authenticated user read % other-user role rows (expected 0)', cnt;
  end if;

  -- 1d. cannot self-escalate (admin-manage WITH CHECK denies the insert).
  denied := false;
  begin
    insert into public.user_roles (user_id, role) values (v_user_id, 'admin');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then
    raise exception 'non-admin escalated by inserting an admin role';
  end if;
  reset role;

  -- ---------------------------------------------------------------------------
  -- 2. An authenticated admin: read + manage all roles still function.
  -- ---------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- 2a. sees every role row for the three test users (admin 2 + user 1 + other 1).
  select count(*) into cnt
    from public.user_roles where user_id in (v_admin_id, v_user_id, v_other_id);
  if cnt <> 4 then
    raise exception 'admin sees % role rows for the 3 test users (expected 4)', cnt;
  end if;

  -- 2b. can manage roles (grant another user a moderator role).
  insert into public.user_roles (user_id, role) values (v_other_id, 'moderator');
  select count(*) into cnt
    from public.user_roles where user_id = v_other_id and role = 'moderator';
  if cnt <> 1 then
    raise exception 'admin could not insert a role (got %)', cnt;
  end if;
  reset role;

  -- ---------------------------------------------------------------------------
  -- 3. Anonymous is denied entirely (no grant on user_roles).
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin perform 1 from public.user_roles limit 1;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then
    raise exception 'anon could read user_roles';
  end if;
  reset role;

  delete from auth.users where id in (v_admin_id, v_user_id, v_other_id);
  raise notice 'CABANA user_roles admin policy checks passed.';
end $$;
