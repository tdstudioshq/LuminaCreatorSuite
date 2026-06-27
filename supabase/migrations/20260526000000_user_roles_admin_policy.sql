-- ============================================================================
-- CABANA — user_roles admin policy fix (corrective, additive)
-- ----------------------------------------------------------------------------
-- The baseline user_roles admin policies reference has_role(auth.uid(),'admin')
-- directly, but has_role's EXECUTE is revoked from anon/authenticated (baseline
-- `revoke execute on function public.has_role(...) from public, anon,
-- authenticated`). PostgreSQL checks a function's EXECUTE privilege when it
-- plans any expression that calls it, so a policy that calls has_role makes the
-- WHOLE query fail for a role lacking that privilege — before any row filter or
-- OR-short-circuit runs. The practical effect: ANY authenticated query over
-- user_roles, including the self-row read performed by useHasRole
-- (src/lib/cabana-roles.ts), fails with `permission denied for function
-- has_role`, so client-side role gating (e.g. /admin) cannot resolve.
--
-- Fix: route the two admin policies through the SECURITY DEFINER wrapper
-- public.is_current_user_admin() (added Phase 6, granted to authenticated),
-- which calls has_role as its owner. This is exactly the pattern every admin
-- RLS policy from Phase 6 onward already uses. Behavior is unchanged — admins
-- still see and manage all rows; non-admins still see only their own via the
-- untouched "Users can view own roles" policy — only the privilege path changes.
--
-- Idempotent (drop-if-exists then recreate). No grant/table/column/enum change.
-- ============================================================================

-- Admin read: all role rows (was: has_role(auth.uid(), 'admin')).
drop policy if exists "Admins can view all roles" on public.user_roles;
create policy "Admins can view all roles"
  on public.user_roles for select
  using (public.is_current_user_admin());

-- Admin write: manage any role row (was: has_role(auth.uid(), 'admin')).
drop policy if exists "Admins can manage roles" on public.user_roles;
create policy "Admins can manage roles"
  on public.user_roles for all
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());
