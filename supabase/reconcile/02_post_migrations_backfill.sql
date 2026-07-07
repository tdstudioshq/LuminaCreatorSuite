-- ============================================================================
-- CABANA ⇄ cabanadatabase (rpzaeqoqcaxxavltgvpe) reconciliation — PART 2 of 2
-- Post-migration backfill: restore the one legacy row (Tyler's admin account)
-- into the CABANA schema now that the 16 repo migrations have applied.
--
-- *** DO NOT RUN WITHOUT EXPLICIT APPROVAL. Run AFTER the 16 migrations. ***
--
-- Context: the auth.users row (tyler.diorio@gmail.com,
-- id 4d54cf94-bde8-4647-939b-03d1f08f14fc) predates the CABANA
-- handle_new_user trigger, so that trigger never fired for it — there is no
-- CABANA public.profiles / creator_profiles / user_roles row for this user.
-- This file recreates what the trigger would have created, then re-grants
-- admin. It is idempotent.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. CABANA profiles row (creator account) for the pre-existing auth user.
--    Pull the display name/email from the preserved legacy row.
-- ----------------------------------------------------------------------------
insert into public.profiles (id, email, name, account_type)
select p.auth_user_id, p.email, p.display_name, 'creator'::public.account_type
from legacy_reel.profiles p
where p.auth_user_id in (select id from auth.users)
on conflict (id) do update
  set email = excluded.email,
      name  = excluded.name;

-- ----------------------------------------------------------------------------
-- 2. Default authorization role for every auth user that lacks one.
-- ----------------------------------------------------------------------------
insert into public.user_roles (user_id, role)
select u.id, 'user'::public.app_role
from auth.users u
on conflict (user_id, role) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Creator presence (creator_profiles) with a collision-safe handle,
--    mirroring handle_new_user's derivation.
-- ----------------------------------------------------------------------------
do $$
declare
  u record;
  base_handle text;
  candidate text;
  n int;
begin
  for u in
    select au.id, coalesce(lp.display_name, split_part(au.email,'@',1)) as display_name
    from auth.users au
    left join legacy_reel.profiles lp on lp.auth_user_id = au.id
    where not exists (select 1 from public.creator_profiles cp where cp.user_id = au.id)
      and coalesce((select account_type from public.profiles pr where pr.id = au.id), 'creator') = 'creator'
  loop
    base_handle := regexp_replace(lower(split_part(u.display_name, '@', 1)), '[^a-z0-9_-]', '', 'g');
    if base_handle = '' or base_handle is null then base_handle := 'creator'; end if;
    candidate := base_handle;
    n := 0;
    while exists (select 1 from public.creator_profiles where lower(handle) = candidate)
          or exists (select 1 from public.reserved_handles where handle = candidate) loop
      n := n + 1;
      candidate := base_handle || n::text;
    end loop;

    insert into public.creator_profiles (user_id, handle, name, bio, theme)
      values (u.id, candidate, u.display_name, '', 'iridescent');

    insert into public.subscriptions (user_id, plan, status)
      values (u.id, 'free', 'active')
    on conflict do nothing;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Re-grant admin. The legacy scaffold stored role='admin' on the profile
--    row; CABANA authorization lives in public.user_roles (app_role enum has
--    'admin'). Grant admin to any legacy admin.
--    NOTE: CABANA has no analogue for the scaffold's granular admin_scopes
--    {moderation,finance,compliance} — CABANA gates on the single 'admin'
--    role via is_current_user_admin(). The scopes are preserved in
--    legacy_reel.profiles for reference only.
-- ----------------------------------------------------------------------------
insert into public.user_roles (user_id, role)
select p.auth_user_id, 'admin'::public.app_role
from legacy_reel.profiles p
where p.role = 'admin'
  and p.auth_user_id in (select id from auth.users)
on conflict (user_id, role) do nothing;

commit;

-- ----------------------------------------------------------------------------
-- Verification (run manually after commit; expect the admin user present in
-- all three, account_type='creator', role rows include 'admin'):
--   select id, email, name, account_type from public.profiles;
--   select user_id, role from public.user_roles order by role;
--   select user_id, handle from public.creator_profiles;
-- Once verified, legacy_reel.profiles may be dropped:
--   drop schema legacy_reel cascade;   -- ONLY after confirming the backfill
-- ----------------------------------------------------------------------------
