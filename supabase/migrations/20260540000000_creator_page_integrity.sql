-- ============================================================================
-- CABANA — Phase 2A.4: creator-page ownership + lifecycle integrity
-- ============================================================================
-- Database invariants in this migration are authoritative for every client:
-- one page per non-null owner, owner-editable column ACLs that exclude lifecycle
-- and ownership, immutable link parentage, race-safe admin transfer, and a
-- bounded admin activity read that continues to honor audit-log RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. One page per non-null owner
-- ----------------------------------------------------------------------------
-- Fail without attempting an unsafe automatic repair. Ownerless admin-created
-- drafts remain valid because null user_id values are excluded from the index.
do $$
begin
  if exists (
    select 1
    from public.creator_profiles
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one creator page per owner: duplicate ownership rows exist'
      using errcode = 'unique_violation';
  end if;
end
$$;

create unique index creator_profiles_one_page_per_owner_idx
  on public.creator_profiles (user_id)
  where user_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Prevent owners from bypassing admin lifecycle + ownership RPCs
-- ----------------------------------------------------------------------------
-- Table-wide UPDATE would override narrower column grants, so revoke it first.
-- Direct INSERT is also removed: signup provisioning runs inside the trusted
-- SECURITY DEFINER auth trigger, and admin-created pages use the audited RPC.
drop policy if exists "Owners can insert own creator profile" on public.creator_profiles;
revoke insert, update on public.creator_profiles from authenticated;

grant update (
  handle,
  name,
  bio,
  avatar_url,
  banner_url,
  theme,
  headline,
  accent_color,
  button_style,
  font_family,
  background_style
) on public.creator_profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Make a link's creator page immutable
-- ----------------------------------------------------------------------------
-- Owners retain normal link editing, insertion, and deletion. They cannot move
-- a link by changing profile_id; the trigger also protects privileged/future
-- writers that might otherwise bypass the column ACL.
revoke update on public.links from authenticated;
grant update (
  title,
  url,
  icon,
  featured,
  scheduled,
  position,
  kind,
  is_visible
) on public.links to authenticated;

create or replace function public.enforce_creator_link_profile_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.profile_id is distinct from old.profile_id then
    raise exception 'A link cannot be moved between creator pages'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_creator_link_profile_immutable()
  from public, anon, authenticated;

drop trigger if exists creator_links_profile_id_immutable on public.links;
create trigger creator_links_profile_id_immutable
  before update of profile_id on public.links
  for each row execute function public.enforce_creator_link_profile_immutable();

-- ----------------------------------------------------------------------------
-- 4. Race-safe ownership transfer
-- ----------------------------------------------------------------------------
create or replace function public.admin_transfer_creator_page(
  _creator_profile_id uuid,
  _to_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before_owner uuid;
  v_handle text;
  v_destination_type public.account_type;
  v_constraint_name text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  select user_id, handle into v_before_owner, v_handle
  from public.creator_profiles
  where id = _creator_profile_id
  for update;
  if not found then
    raise exception 'Creator page not found' using errcode = 'no_data_found';
  end if;

  if _to_user_id is not null then
    -- Lock the trusted public account row so concurrent transfers to the same
    -- destination serialize before the uniqueness check/update.
    select p.account_type into v_destination_type
    from public.profiles p
    where p.id = _to_user_id
    for update;
    if not found or v_destination_type <> 'creator'::public.account_type then
      raise exception 'Destination account is not a valid creator account'
        using errcode = 'check_violation';
    end if;

    if exists (
      select 1
      from public.creator_profiles cp
      where cp.user_id = _to_user_id
        and cp.id <> _creator_profile_id
    ) then
      raise exception 'Destination account already owns a creator page'
        using errcode = 'check_violation';
    end if;
  end if;

  begin
    update public.creator_profiles
    set user_id = _to_user_id
    where id = _creator_profile_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = 'creator_profiles_one_page_per_owner_idx' then
        raise exception 'Destination account already owns a creator page'
          using errcode = 'check_violation';
      end if;
      raise;
  end;

  perform public.write_creator_audit(
    'creator_page.transferred',
    'creator_profile',
    _creator_profile_id,
    jsonb_build_object(
      'handle', v_handle,
      'claimed_before', v_before_owner is not null,
      'owner_before', v_before_owner
    ),
    jsonb_build_object(
      'handle', v_handle,
      'claimed_after', _to_user_id is not null,
      'owner_after', _to_user_id
    )
  );
end;
$$;

revoke execute on function public.admin_transfer_creator_page(uuid, uuid)
  from public, anon;
grant execute on function public.admin_transfer_creator_page(uuid, uuid)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Bounded, RLS-respecting creator-page activity
-- ----------------------------------------------------------------------------
-- Current links identify their own audit rows. Created/deleted audit payloads
-- retain profile_id, allowing deleted links and their earlier updates to remain
-- in the page history without changing the immutable canonical audit record.
create or replace function public.admin_get_creator_page_audit_history(
  _creator_profile_id uuid,
  _limit integer default 50
)
returns setof public.audit_logs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;
  if _creator_profile_id is null then
    raise exception 'Creator page is required' using errcode = 'check_violation';
  end if;
  perform 1 from public.creator_profiles cp where cp.id = _creator_profile_id;
  if not found then
    raise exception 'Creator page not found' using errcode = 'no_data_found';
  end if;

  return query
  with relevant_link_ids as (
    select l.id
    from public.links l
    where l.profile_id = _creator_profile_id
    union
    select al.target_id
    from public.audit_logs al
    where al.target_type = 'creator_link'
      and al.target_id is not null
      and (
        al.before ->> 'profile_id' = _creator_profile_id::text
        or al.after ->> 'profile_id' = _creator_profile_id::text
      )
  )
  select al.*
  from public.audit_logs al
  where (
      al.target_type = 'creator_profile'
      and al.target_id = _creator_profile_id
    ) or (
      al.target_type = 'creator_link'
      and al.target_id in (select rli.id from relevant_link_ids rli)
    )
  order by al.created_at desc, al.id desc
  limit greatest(1, least(coalesce(_limit, 50), 100));
end;
$$;

revoke execute on function public.admin_get_creator_page_audit_history(uuid, integer)
  from public, anon;
grant execute on function public.admin_get_creator_page_audit_history(uuid, integer)
  to authenticated;
