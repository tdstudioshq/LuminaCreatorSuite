-- ============================================================================
-- CABANA — Phase 2A.3: audit visibility + audited role management
-- ============================================================================
-- This migration closes two privileged-control-plane gaps:
--   1. moderators currently inherit the same audit-log visibility as admins;
--   2. admins can mutate user_roles directly through PostgREST without an audit.
--
-- Audit rows remain canonical and append-only. Visibility is enforced by RLS:
-- admins see every category, while moderators receive a deliberately narrow
-- action + target allowlist containing only operational report activity.
--
-- Role changes move behind two SECURITY DEFINER RPCs. Direct authenticated DML
-- is revoked, authority is derived from auth.uid() + public.user_roles, changes
-- are serialized, and each successful mutation appends exactly one audit row.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Exact moderator helper
-- ----------------------------------------------------------------------------
-- Do not reuse is_current_user_staff() here: that helper may eventually include
-- more staff roles, which must not silently inherit moderator audit visibility.
create or replace function public.is_current_user_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role((select auth.uid()), 'moderator')
$$;

revoke execute on function public.is_current_user_moderator() from public, anon;
grant execute on function public.is_current_user_moderator() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Category-scoped audit visibility
-- ----------------------------------------------------------------------------
drop policy if exists "Staff read audit logs" on public.audit_logs;

create policy "Admins read all audit logs"
  on public.audit_logs for select
  to authenticated
  using ((select public.is_current_user_admin()));

create policy "Moderators read operational report audit logs"
  on public.audit_logs for select
  to authenticated
  using (
    (select public.is_current_user_moderator())
    and target_type = 'report'
    and action in (
      'report.assigned',
      'report.open',
      'report.reviewing',
      'report.resolved',
      'report.dismissed'
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Remove direct authenticated role mutation
-- ----------------------------------------------------------------------------
-- SELECT remains available: users still read their own roles and admins still
-- inspect all roles through the existing SELECT policies.
drop policy if exists "Admins can manage roles" on public.user_roles;
revoke insert, update, delete on public.user_roles from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Audited role-grant RPC
-- ----------------------------------------------------------------------------
create or replace function public.admin_grant_user_role(
  _target_user_id uuid,
  _role public.app_role,
  _reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := btrim(coalesce(_reason, ''));
  v_target_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;
  if _role is null
     or _role not in ('admin'::public.app_role, 'moderator'::public.app_role) then
    raise exception 'Only staff roles may be granted' using errcode = 'check_violation';
  end if;
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception 'A reason between 1 and 500 characters is required'
      using errcode = 'check_violation';
  end if;

  -- Serialize every role mutation, including last-admin checks. Re-check the
  -- actor after the lock in case their authority changed while waiting.
  lock table public.user_roles in share row exclusive mode;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where p.id = _target_user_id
  for update;
  if not found then
    raise exception 'Target account is not eligible for role management'
      using errcode = 'check_violation';
  end if;
  if v_target_id = v_actor_id then
    raise exception 'Administrators cannot change their own roles'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_target_id and ur.role = _role
  ) then
    raise exception 'That role is already assigned' using errcode = 'check_violation';
  end if;

  insert into public.user_roles (user_id, role) values (v_target_id, _role);

  insert into public.audit_logs (
    actor_user_id, actor_role, action, target_type, target_id, before, after, reason
  ) values (
    v_actor_id,
    'admin'::public.audit_actor_role,
    'user_role.granted',
    'user_role',
    v_target_id,
    jsonb_build_object('role', _role, 'assigned', false),
    jsonb_build_object('role', _role, 'assigned', true),
    v_reason
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Audited role-removal RPC
-- ----------------------------------------------------------------------------
create or replace function public.admin_remove_user_role(
  _target_user_id uuid,
  _role public.app_role,
  _reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := btrim(coalesce(_reason, ''));
  v_target_id uuid;
  v_role_id uuid;
  v_admin_count integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;
  if _role is null
     or _role not in ('admin'::public.app_role, 'moderator'::public.app_role) then
    raise exception 'Only staff roles may be removed' using errcode = 'check_violation';
  end if;
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception 'A reason between 1 and 500 characters is required'
      using errcode = 'check_violation';
  end if;

  lock table public.user_roles in share row exclusive mode;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where p.id = _target_user_id
  for update;
  if not found then
    raise exception 'Target account is not eligible for role management'
      using errcode = 'check_violation';
  end if;

  select ur.id into v_role_id
  from public.user_roles ur
  where ur.user_id = v_target_id and ur.role = _role
  for update;
  if not found then
    raise exception 'That role is not assigned' using errcode = 'check_violation';
  end if;

  -- Check the final-admin invariant before the self-mutation invariant so the
  -- one remaining admin receives the more specific safety failure. With two or
  -- more admins, self-demotion is still rejected below.
  if _role = 'admin'::public.app_role then
    select count(*) into v_admin_count
    from public.user_roles ur
    where ur.role = 'admin'::public.app_role;
    if v_admin_count <= 1 then
      raise exception 'The final administrator role cannot be removed'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_target_id = v_actor_id then
    raise exception 'Administrators cannot change their own roles'
      using errcode = 'check_violation';
  end if;

  delete from public.user_roles where id = v_role_id;

  insert into public.audit_logs (
    actor_user_id, actor_role, action, target_type, target_id, before, after, reason
  ) values (
    v_actor_id,
    'admin'::public.audit_actor_role,
    'user_role.removed',
    'user_role',
    v_target_id,
    jsonb_build_object('role', _role, 'assigned', true),
    jsonb_build_object('role', _role, 'assigned', false),
    v_reason
  );
end;
$$;

revoke execute on function public.admin_grant_user_role(uuid, public.app_role, text)
  from public, anon;
grant execute on function public.admin_grant_user_role(uuid, public.app_role, text)
  to authenticated;

revoke execute on function public.admin_remove_user_role(uuid, public.app_role, text)
  from public, anon;
grant execute on function public.admin_remove_user_role(uuid, public.app_role, text)
  to authenticated;
