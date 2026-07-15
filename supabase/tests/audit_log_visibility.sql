-- ============================================================================
-- CABANA — Phase 2A.3 behavioral checks: audit visibility + role management
-- ============================================================================
-- Proves the migration's two privileged-control-plane boundaries:
--   * admins can read every audit category, moderators can read only the exact
--     operational report allowlist, and ordinary/anonymous users see nothing;
--   * authenticated role-table DML is closed and role changes succeed only via
--     the admin-only, audited RPCs with their validation/safety invariants.
--
-- Test rows use generated UUIDs so assertions are independent of demo seed data.
-- Audit rows are intentionally retained because audit_logs is append-only; user
-- cleanup nulls actor_user_id through the table's permitted FK-null path.
-- ============================================================================

delete from auth.users
where email in (
  'alv_admin@example.com',
  'alv_moderator@example.com',
  'alv_user@example.com',
  'alv_target@example.com',
  'alv_staff_target@example.com'
);

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_moderator_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_target_id uuid := gen_random_uuid();
  v_staff_target_id uuid := gen_random_uuid();
  v_scope_id uuid := gen_random_uuid();
  v_missing_id uuid := gen_random_uuid();
  v_audit_id uuid;
  v_error text;
  cnt integer;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_admin_id, 'alv_admin@example.com', '{"name":"ALV Admin"}'::jsonb),
    (v_moderator_id, 'alv_moderator@example.com', '{"name":"ALV Moderator"}'::jsonb),
    (v_user_id, 'alv_user@example.com',
      '{"name":"ALV User","role":"admin","is_admin":true}'::jsonb),
    (v_target_id, 'alv_target@example.com', '{"name":"ALV Target"}'::jsonb),
    (v_staff_target_id, 'alv_staff_target@example.com',
      '{"name":"ALV Staff Target"}'::jsonb);

  -- Fixture setup runs as postgres. Every client-side role mutation below runs
  -- as authenticated and must use the audited RPC boundary.
  insert into public.user_roles (user_id, role) values
    (v_admin_id, 'admin'),
    (v_moderator_id, 'moderator');

  -- -------------------------------------------------------------------------
  -- 1. Catalog-level least privilege: SELECT remains for useHasRole, while
  --    role DML and anonymous RPC execution are absent.
  -- -------------------------------------------------------------------------
  if not has_table_privilege('authenticated', 'public.user_roles', 'select') then
    raise exception 'authenticated lost required SELECT on user_roles';
  end if;
  if has_table_privilege('authenticated', 'public.user_roles', 'insert')
     or has_table_privilege('authenticated', 'public.user_roles', 'update')
     or has_table_privilege('authenticated', 'public.user_roles', 'delete') then
    raise exception 'authenticated retains direct user_roles write privileges';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.admin_grant_user_role(uuid,public.app_role,text)',
    'execute'
  ) or not has_function_privilege(
    'authenticated',
    'public.admin_remove_user_role(uuid,public.app_role,text)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute a role-management RPC';
  end if;
  if has_function_privilege(
    'anon',
    'public.admin_grant_user_role(uuid,public.app_role,text)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.admin_remove_user_role(uuid,public.app_role,text)',
    'execute'
  ) then
    raise exception 'anon can execute a role-management RPC';
  end if;
  if not has_function_privilege(
    'authenticated', 'public.is_current_user_moderator()', 'execute'
  ) or has_function_privilege(
    'anon', 'public.is_current_user_moderator()', 'execute'
  ) then
    raise exception 'moderator helper EXECUTE grants are incorrect';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'Admins can manage roles'
  ) then
    raise exception 'legacy direct role-management policy still exists';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'Staff read audit logs'
  ) then
    raise exception 'legacy broad staff audit policy still exists';
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Seed every audit category under one generated scope. The moderator
  --    allowlist contains exactly five report actions; similarly named future
  --    actions and a valid action on the wrong target type must fail closed.
  -- -------------------------------------------------------------------------
  insert into public.audit_logs (
    actor_user_id, actor_role, action, target_type, target_id, reason
  ) values
    (v_admin_id, 'admin', 'report.assigned', 'report', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'report.open', 'report', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'report.reviewing', 'report', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'report.resolved', 'report', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'report.dismissed', 'report', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'report.evidence_exported', 'report', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'report.resolved', 'creator_profile', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'payout.approved', 'payout', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'finance.adjusted', 'finance', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'ledger.reconciled', 'ledger', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'user_role.granted', 'user_role', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'identity.reviewed', 'identity', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'kyc.reviewed', 'kyc', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'tax.documented', 'tax', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'compliance.case_opened', 'compliance', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'legal.hold_created', 'legal', v_scope_id, 'fixture'),
    (v_admin_id, 'admin', 'creator_page.transferred', 'creator_profile', v_scope_id, 'fixture');

  -- Admin sees all categories, including the rows intentionally hidden from a
  -- moderator and the future report action outside the exact allowlist.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select count(*) into cnt from public.audit_logs where target_id = v_scope_id;
  if cnt <> 17 then
    raise exception 'admin sees % scoped audit rows (expected 17)', cnt;
  end if;
  if not exists (
    select 1 from public.audit_logs
    where target_id = v_scope_id and action = 'payout.approved'
  ) or not exists (
    select 1 from public.audit_logs
    where target_id = v_scope_id and action = 'creator_page.transferred'
  ) then
    raise exception 'admin cannot read a sensitive audit category';
  end if;
  reset role;

  -- Moderator sees exactly the five operational report actions.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_moderator_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select count(*) into cnt from public.audit_logs where target_id = v_scope_id;
  if cnt <> 5 then
    raise exception 'moderator sees % scoped audit rows (expected exact allowlist of 5)', cnt;
  end if;
  if exists (
    select 1 from public.audit_logs
    where target_id = v_scope_id
      and (
        target_type <> 'report'
        or action not in (
          'report.assigned',
          'report.open',
          'report.reviewing',
          'report.resolved',
          'report.dismissed'
        )
      )
  ) then
    raise exception 'moderator can read an audit row outside the exact allowlist';
  end if;
  reset role;

  -- Ordinary users see no audit data. User-editable metadata and forged JWT
  -- claim fields do not confer authority because authorization comes from the
  -- live user_roles table.
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_user_id::text,
      'role', 'authenticated',
      'user_metadata', json_build_object('role', 'admin', 'is_admin', true),
      'app_metadata', json_build_object('role', 'admin')
    )::text,
    true
  );
  set local role authenticated;
  select count(*) into cnt from public.audit_logs where target_id = v_scope_id;
  if cnt <> 0 then
    raise exception 'forged-claim ordinary user sees % audit rows (expected 0)', cnt;
  end if;

  denied := false;
  begin
    perform public.admin_grant_user_role(v_target_id, 'moderator', 'forged authority');
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'forged-claim ordinary user called admin role RPC';
  end if;
  reset role;

  -- Moderator audit access does not imply role-management authority.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_moderator_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  denied := false;
  begin
    perform public.admin_grant_user_role(v_target_id, 'moderator', 'moderator escalation');
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'moderator called admin role RPC';
  end if;
  reset role;

  if exists (
    select 1 from public.user_roles
    where user_id = v_target_id and role = 'moderator'
  ) or exists (
    select 1 from public.audit_logs
    where target_id = v_target_id and action like 'user_role.%'
  ) then
    raise exception 'denied RPC attempt changed a role or wrote an audit row';
  end if;

  -- Anonymous callers cannot read audit_logs or enter either RPC.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin
    perform 1 from public.audit_logs limit 1;
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'anon could read audit_logs';
  end if;

  denied := false;
  begin
    perform public.admin_grant_user_role(v_target_id, 'moderator', 'anonymous grant');
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'anon could execute admin_grant_user_role';
  end if;

  denied := false;
  begin
    perform public.admin_remove_user_role(v_target_id, 'moderator', 'anonymous remove');
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'anon could execute admin_remove_user_role';
  end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- 3. Admin RPC input validation fails atomically: no role row and no audit.
  -- -------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  denied := false;
  begin
    perform public.admin_grant_user_role(v_target_id, 'moderator', '   ');
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'blank role-grant reason was accepted'; end if;

  denied := false;
  begin
    perform public.admin_grant_user_role(v_target_id, 'moderator', repeat('x', 501));
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'overlong role-grant reason was accepted'; end if;

  denied := false;
  begin
    perform public.admin_grant_user_role(v_target_id, 'user', 'unsupported default role');
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'default user role was accepted by staff RPC'; end if;

  denied := false;
  begin
    perform public.admin_grant_user_role(
      v_target_id, null::public.app_role, 'missing staff role'
    );
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'null staff role was accepted'; end if;

  denied := false;
  begin
    perform public.admin_grant_user_role(v_missing_id, 'moderator', 'missing target');
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'nonexistent role target was accepted'; end if;

  denied := false;
  begin
    perform public.admin_grant_user_role(v_admin_id, 'moderator', 'self grant');
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'admin self-grant was accepted'; end if;

  if exists (
    select 1 from public.user_roles
    where user_id = v_target_id and role = 'moderator'
  ) or exists (
    select 1 from public.audit_logs
    where target_id in (v_target_id, v_missing_id)
      and action like 'user_role.%'
  ) then
    raise exception 'failed role-grant validation left a mutation or audit row';
  end if;

  -- -------------------------------------------------------------------------
  -- 4. Successful moderator grant/remove each produce exactly one canonical,
  --    trimmed audit record. Duplicate/missing mutations fail without extras.
  -- -------------------------------------------------------------------------
  perform public.admin_grant_user_role(v_target_id, 'moderator', '  support rotation  ');

  select count(*) into cnt from public.user_roles
  where user_id = v_target_id and role = 'moderator';
  if cnt <> 1 then raise exception 'moderator grant produced % role rows', cnt; end if;

  select count(*) into cnt from public.audit_logs
  where actor_user_id = v_admin_id
    and actor_role = 'admin'
    and action = 'user_role.granted'
    and target_type = 'user_role'
    and target_id = v_target_id
    and before = '{"role":"moderator","assigned":false}'::jsonb
    and after = '{"role":"moderator","assigned":true}'::jsonb
    and reason = 'support rotation';
  if cnt <> 1 then
    raise exception 'moderator grant has % canonical audit rows (expected 1)', cnt;
  end if;
  if exists (
    select 1 from public.audit_logs
    where target_id = v_target_id
      and action = 'user_role.granted'
      and (
        coalesce(before, '{}'::jsonb) ?| array['email', 'token', 'secret', 'password']
        or coalesce(after, '{}'::jsonb) ?| array['email', 'token', 'secret', 'password']
      )
  ) then
    raise exception 'role audit payload contains an email/token/secret/password field';
  end if;

  denied := false;
  begin
    perform public.admin_grant_user_role(v_target_id, 'moderator', 'duplicate grant');
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'duplicate moderator grant was accepted'; end if;
  select count(*) into cnt from public.audit_logs
  where target_id = v_target_id and action = 'user_role.granted';
  if cnt <> 1 then raise exception 'duplicate grant changed audit count to %', cnt; end if;

  perform public.admin_remove_user_role(v_target_id, 'moderator', '  rotation complete  ');
  select count(*) into cnt from public.user_roles
  where user_id = v_target_id and role = 'moderator';
  if cnt <> 0 then raise exception 'moderator remove left % role rows', cnt; end if;

  select count(*) into cnt from public.audit_logs
  where actor_user_id = v_admin_id
    and actor_role = 'admin'
    and action = 'user_role.removed'
    and target_type = 'user_role'
    and target_id = v_target_id
    and before = '{"role":"moderator","assigned":true}'::jsonb
    and after = '{"role":"moderator","assigned":false}'::jsonb
    and reason = 'rotation complete';
  if cnt <> 1 then
    raise exception 'moderator remove has % canonical audit rows (expected 1)', cnt;
  end if;

  denied := false;
  begin
    perform public.admin_remove_user_role(v_target_id, 'moderator', 'duplicate remove');
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'missing moderator removal was accepted'; end if;
  select count(*) into cnt from public.audit_logs
  where target_id = v_target_id and action = 'user_role.removed';
  if cnt <> 1 then raise exception 'missing removal changed audit count to %', cnt; end if;

  -- -------------------------------------------------------------------------
  -- 5. Admin grants/removals work for another account. Self-mutation remains
  --    denied even with a second admin, and the final admin cannot be removed.
  -- -------------------------------------------------------------------------
  perform public.admin_grant_user_role(v_staff_target_id, 'admin', 'backup administrator');
  select count(*) into cnt from public.user_roles where role = 'admin';
  if cnt <> 2 then
    raise exception 'admin fixture count is % after second grant (expected 2)', cnt;
  end if;

  denied := false;
  v_error := null;
  begin
    perform public.admin_remove_user_role(v_admin_id, 'admin', 'self demotion');
  exception when check_violation then
    denied := true;
    v_error := sqlerrm;
  end;
  if not denied then raise exception 'admin self-removal was accepted'; end if;
  if v_error <> 'Administrators cannot change their own roles' then
    raise exception 'two-admin self-removal failed for unexpected reason: %', v_error;
  end if;
  if not exists (
    select 1 from public.user_roles where user_id = v_admin_id and role = 'admin'
  ) then
    raise exception 'denied self-removal deleted the actor admin role';
  end if;
  if exists (
    select 1 from public.audit_logs
    where target_id = v_admin_id and action = 'user_role.removed'
  ) then
    raise exception 'denied self-removal wrote an audit row';
  end if;

  perform public.admin_remove_user_role(v_staff_target_id, 'admin', 'backup rotation ended');
  if exists (
    select 1 from public.user_roles
    where user_id = v_staff_target_id and role = 'admin'
  ) then
    raise exception 'second admin role was not removed';
  end if;
  select count(*) into cnt from public.user_roles where role = 'admin';
  if cnt <> 1 then
    raise exception 'admin fixture count is % before final-admin check (expected 1)', cnt;
  end if;
  select count(*) into cnt from public.audit_logs
  where target_id = v_staff_target_id
    and action in ('user_role.granted', 'user_role.removed');
  if cnt <> 2 then raise exception 'admin grant/remove wrote % audit rows (expected 2)', cnt; end if;

  denied := false;
  v_error := null;
  begin
    perform public.admin_remove_user_role(v_admin_id, 'admin', 'remove final admin');
  exception when check_violation then
    denied := true;
    v_error := sqlerrm;
  end;
  if not denied then raise exception 'final administrator role was removed'; end if;
  if v_error <> 'The final administrator role cannot be removed' then
    raise exception 'final-admin removal failed for unexpected reason: %', v_error;
  end if;
  if not exists (
    select 1 from public.user_roles where user_id = v_admin_id and role = 'admin'
  ) then
    raise exception 'final-admin guard did not preserve the role';
  end if;

  -- -------------------------------------------------------------------------
  -- 6. Even an admin cannot bypass the audited RPCs with direct table DML.
  -- -------------------------------------------------------------------------
  denied := false;
  begin
    insert into public.user_roles (user_id, role)
    values (v_staff_target_id, 'moderator');
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then raise exception 'admin directly inserted user_roles'; end if;

  denied := false;
  begin
    update public.user_roles set role = 'moderator'
    where user_id = v_admin_id and role = 'admin';
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then raise exception 'admin directly updated user_roles'; end if;

  denied := false;
  begin
    delete from public.user_roles
    where user_id = v_admin_id and role = 'admin';
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then raise exception 'admin directly deleted user_roles'; end if;
  reset role;

  -- Append-only behavior remains intact after the visibility-policy change.
  select id into v_audit_id from public.audit_logs
  where target_id = v_scope_id limit 1;
  denied := false;
  begin
    update public.audit_logs set action = 'tampered' where id = v_audit_id;
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'audit_logs UPDATE was not blocked'; end if;

  denied := false;
  begin
    delete from public.audit_logs where id = v_audit_id;
  exception when check_violation then
    denied := true;
  end;
  if not denied then raise exception 'audit_logs DELETE was not blocked'; end if;

  delete from auth.users
  where id in (
    v_admin_id,
    v_moderator_id,
    v_user_id,
    v_target_id,
    v_staff_target_id
  );

  raise notice 'Phase 2A.3 audit visibility + role-management checks passed.';
end $$;
