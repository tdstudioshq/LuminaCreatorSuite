-- ============================================================================
-- CABANA — Phase 2A.2: Admin creator-page management (RPCs + audit)
-- ============================================================================
-- The admin WRITE foundation over the 2A.1 visibility schema. Purely additive:
-- eight admin-only SECURITY DEFINER RPCs (four for creator pages, four for
-- links) plus one internal audit helper. NO visibility-policy change, NO
-- invite/claim, NO service-role dependency, NO editor UI.
--
-- Security model (mirrors admin_review_payout / Phase 8C.2). Every RPC:
--   * runs SECURITY DEFINER with `set search_path = ''` (all refs schema-qualified);
--   * rejects unauthenticated callers (insufficient_privilege);
--   * calls public.is_current_user_admin() INTERNALLY and rejects non-admins
--     (insufficient_privilege) — authority comes from user_roles, never an email,
--     never a client-supplied flag;
--   * resolves targets from trusted DB rows and locks mutable rows FOR UPDATE;
--   * returns stable, generic errors that do not reveal whether an unauthorized
--     target id exists;
--   * is revoked from public/anon and granted only to authenticated (the internal
--     admin check is the real gate).
--
-- Audit: every SUCCESSFUL admin mutation writes exactly ONE audit_logs row via
-- the internal `write_creator_audit` helper, in the same transaction as the
-- mutation (so a failed op rolls back its would-be audit row too — no audit on
-- failure). Explicit RPC-level inserts are used rather than table triggers
-- BECAUSE creator_profiles/links are also written by OWNERS on the normal
-- dashboard path; a blanket AFTER-UPDATE trigger would over-log routine owner
-- self-edits and could not distinguish an admin MANAGEMENT action from an owner
-- edit. Auditing inside the admin RPCs captures exactly the admin write path
-- with precise, one-per-operation semantics. Target types: 'creator_profile'
-- and 'creator_link'. Actions are the stable `creator_page.*` / `creator_link.*`
-- names mirrored by the pure module cabana-creator-pages.ts (SQL is the
-- authoritative security + mutation layer; the TS module mirrors the rules for
-- pre-flight UI validation only).
--
-- Audit payloads carry NO email, tokens, or secrets. Owner identity is the Auth
-- UUID (public.profiles.id === auth.users.id — this migration does NOT pretend
-- otherwise); it is recorded ONLY by admin_transfer_creator_page, where the
-- destination/source owner is the operative fact of the operation, alongside
-- claimed_before / claimed_after booleans. audit_logs is staff-readable, so
-- these transfer rows expose owner UUIDs to moderators (see the 2A.2 report /
-- reserved 20260539 audit-visibility follow-up).
--
-- Rollback (forward-only repo; no down migration): a later migration would drop
-- the eight RPCs + write_creator_audit. All objects here are additive functions;
-- no table/column/policy/enum/grant on existing objects is altered.
--
-- NOT applied to cloud by this file — validated on local Docker via
-- `bun run db:validate`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Internal audit helper (SECURITY DEFINER, never client-callable)
-- ----------------------------------------------------------------------------
-- DRYs the audit insert for the eight admin RPCs. Runs in the definer context,
-- so it can insert into the (client-write-revoked, append-only) audit_logs; it
-- stamps the caller's uid + role via the existing current_audit_actor_role().
-- Not granted to any client role — only the SECURITY DEFINER RPCs below call it.
create or replace function public.write_creator_audit(
  _action text,
  _target_type text,
  _target_id uuid,
  _before jsonb,
  _after jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    actor_user_id, actor_role, action, target_type, target_id, before, after
  ) values (
    (select auth.uid()),
    public.current_audit_actor_role(),
    _action,
    _target_type,
    _target_id,
    _before,
    _after
  );
$$;

revoke execute on function public.write_creator_audit(text, text, uuid, jsonb, jsonb)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Shared guard note: each RPC begins by asserting auth + admin. Kept inline
-- (not a helper returning void) so the RAISE aborts the function directly.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- A. CREATOR PAGE RPCS
-- ============================================================================

-- A1. Create an ownerless DRAFT creator page. --------------------------------
create or replace function public.admin_create_creator_page(
  _handle text,
  _display_name text,
  _bio text default '',
  _headline text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_handle text := lower(btrim(coalesce(_handle, '')));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;
  if v_handle = '' then
    raise exception 'Handle is required' using errcode = 'check_violation';
  end if;

  -- validate_creator_handle (BEFORE INSERT) enforces reserved handles; the
  -- lower(handle) unique index enforces duplicates. Map the unique violation to
  -- a stable, generic message.
  begin
    insert into public.creator_profiles (user_id, handle, name, bio, headline, page_status)
      values (null, v_handle, coalesce(_display_name, ''), coalesce(_bio, ''),
              coalesce(_headline, ''), 'draft'::public.creator_page_status)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'That handle is already taken' using errcode = 'unique_violation';
  end;

  perform public.write_creator_audit(
    'creator_page.created', 'creator_profile', v_id,
    null::jsonb,
    jsonb_build_object('handle', v_handle, 'page_status', 'draft', 'claimed_after', false)
  );
  return v_id;
end;
$$;

-- A2. Update identity/appearance ONLY (never status or ownership). -----------
create or replace function public.admin_update_creator_page(
  _creator_profile_id uuid,
  _handle text default null,
  _name text default null,
  _bio text default null,
  _headline text default null,
  _avatar_url text default null,
  _banner_url text default null,
  _theme text default null,
  _accent_color text default null,
  _button_style text default null,
  _font_family text default null,
  _background_style text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before public.creator_profiles;
  v_after public.creator_profiles;
  v_before_obj jsonb;
  v_after_obj jsonb;
  v_changed_before jsonb;
  v_changed_after jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  -- Closed allow-list validation (only for provided values; null = unchanged).
  if _button_style is not null and _button_style not in ('rounded', 'pill', 'square') then
    raise exception 'Invalid button_style' using errcode = 'check_violation';
  end if;
  if _font_family is not null and _font_family not in ('default', 'sans', 'serif', 'mono', 'display') then
    raise exception 'Invalid font_family' using errcode = 'check_violation';
  end if;
  if _background_style is not null and _background_style not in ('default', 'solid', 'gradient', 'iridescent') then
    raise exception 'Invalid background_style' using errcode = 'check_violation';
  end if;
  if _accent_color is not null and _accent_color <> '' and _accent_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid accent_color' using errcode = 'check_violation';
  end if;

  select * into v_before from public.creator_profiles
    where id = _creator_profile_id for update;
  if not found then
    raise exception 'Creator page not found' using errcode = 'no_data_found';
  end if;

  -- page_status and user_id are intentionally NOT settable here — this RPC edits
  -- identity/appearance only. Handle uniqueness/reserved is enforced by the
  -- existing trigger + unique index.
  begin
    update public.creator_profiles set
      handle          = coalesce(lower(btrim(_handle)), handle),
      name            = coalesce(_name, name),
      bio             = coalesce(_bio, bio),
      headline        = coalesce(_headline, headline),
      avatar_url      = coalesce(_avatar_url, avatar_url),
      banner_url      = coalesce(_banner_url, banner_url),
      theme           = coalesce(_theme, theme),
      accent_color    = coalesce(_accent_color, accent_color),
      button_style    = coalesce(_button_style, button_style),
      font_family     = coalesce(_font_family, font_family),
      background_style = coalesce(_background_style, background_style)
    where id = _creator_profile_id
    returning * into v_after;
  exception when unique_violation then
    raise exception 'That handle is already taken' using errcode = 'unique_violation';
  end;

  -- Changed-field audit summary (keys = changed field names; non-sensitive).
  v_before_obj := jsonb_build_object(
    'handle', v_before.handle, 'name', v_before.name, 'bio', v_before.bio,
    'headline', v_before.headline, 'avatar_url', v_before.avatar_url,
    'banner_url', v_before.banner_url, 'theme', v_before.theme,
    'accent_color', v_before.accent_color, 'button_style', v_before.button_style,
    'font_family', v_before.font_family, 'background_style', v_before.background_style);
  v_after_obj := jsonb_build_object(
    'handle', v_after.handle, 'name', v_after.name, 'bio', v_after.bio,
    'headline', v_after.headline, 'avatar_url', v_after.avatar_url,
    'banner_url', v_after.banner_url, 'theme', v_after.theme,
    'accent_color', v_after.accent_color, 'button_style', v_after.button_style,
    'font_family', v_after.font_family, 'background_style', v_after.background_style);

  select jsonb_object_agg(k, v_before_obj -> k), jsonb_object_agg(k, v_after_obj -> k)
    into v_changed_before, v_changed_after
    from jsonb_object_keys(v_after_obj) k
    where v_before_obj -> k is distinct from v_after_obj -> k;

  -- No field actually changed → successful no-op, nothing to audit.
  if v_changed_after is null then
    return;
  end if;

  perform public.write_creator_audit(
    'creator_page.updated', 'creator_profile', _creator_profile_id,
    v_changed_before, v_changed_after
  );
end;
$$;

-- A3. Status transition (verb-driven state machine). -------------------------
create or replace function public.admin_set_creator_page_status(
  _creator_profile_id uuid,
  _action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cur public.creator_page_status;
  v_next public.creator_page_status;
  v_handle text;
  v_action_name text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  select page_status, handle into v_cur, v_handle from public.creator_profiles
    where id = _creator_profile_id for update;
  if not found then
    raise exception 'Creator page not found' using errcode = 'no_data_found';
  end if;

  -- Transition table (mirrors cabana-creator-pages.nextPageStatus). NULL = invalid.
  -- Allowed: draft->published, published->draft, draft->archived,
  -- published->archived, archived->draft. No-ops and archived->published are NULL.
  v_next := case
    when _action = 'publish'   and v_cur = 'draft'                      then 'published'
    when _action = 'unpublish' and v_cur = 'published'                  then 'draft'
    when _action = 'archive'   and v_cur in ('draft', 'published')      then 'archived'
    when _action = 'restore'   and v_cur = 'archived'                   then 'draft'
    else null
  end::public.creator_page_status;

  if v_next is null then
    raise exception 'Invalid status transition' using errcode = 'check_violation';
  end if;

  v_action_name := case _action
    when 'publish'   then 'creator_page.published'
    when 'unpublish' then 'creator_page.unpublished'
    when 'archive'   then 'creator_page.archived'
    when 'restore'   then 'creator_page.restored'
  end;

  update public.creator_profiles set page_status = v_next where id = _creator_profile_id;

  perform public.write_creator_audit(
    v_action_name, 'creator_profile', _creator_profile_id,
    jsonb_build_object('page_status', v_cur, 'handle', v_handle),
    jsonb_build_object('page_status', v_next, 'handle', v_handle)
  );
end;
$$;

-- A4. Transfer / clear ownership (admin-only). -------------------------------
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
  v_conflicts int;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  select user_id, handle into v_before_owner, v_handle from public.creator_profiles
    where id = _creator_profile_id for update;
  if not found then
    raise exception 'Creator page not found' using errcode = 'no_data_found';
  end if;

  if _to_user_id is not null then
    -- Destination must be a real creator account.
    perform 1 from public.profiles p
      where p.id = _to_user_id and p.account_type = 'creator';
    if not found then
      raise exception 'Destination account is not a valid creator account'
        using errcode = 'check_violation';
    end if;

    -- Preserve the one-creator-page-per-user assumption (no unique constraint
    -- enforces it, so this RPC does). Lock any pages the destination already
    -- owns, then reject if any exists other than this page.
    perform 1 from public.creator_profiles
      where user_id = _to_user_id and id <> _creator_profile_id for update;
    select count(*) into v_conflicts from public.creator_profiles
      where user_id = _to_user_id and id <> _creator_profile_id;
    if v_conflicts > 0 then
      raise exception 'Destination account already owns a creator page'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.creator_profiles set user_id = _to_user_id where id = _creator_profile_id;

  -- Owner UUIDs (Auth UUIDs) are the operative fact of a transfer, recorded
  -- alongside claimed booleans. No email/token/secret.
  perform public.write_creator_audit(
    'creator_page.transferred', 'creator_profile', _creator_profile_id,
    jsonb_build_object('handle', v_handle, 'claimed_before', v_before_owner is not null,
                       'owner_before', v_before_owner),
    jsonb_build_object('handle', v_handle, 'claimed_after', _to_user_id is not null,
                       'owner_after', _to_user_id)
  );
end;
$$;

-- ============================================================================
-- B. LINK RPCS
-- ============================================================================

-- B1. Upsert a link on a trusted target page (never move between pages). -----
create or replace function public.admin_upsert_creator_link(
  _creator_profile_id uuid,
  _title text,
  _url text,
  _id uuid default null,
  _icon text default 'globe',
  _featured boolean default false,
  _scheduled text default null,
  _kind text default 'link',
  _is_visible boolean default true,
  _position integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_before public.links;
  v_after public.links;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;
  if _kind is not null and _kind not in ('link', 'header', 'social', 'embed') then
    raise exception 'Invalid link kind' using errcode = 'check_violation';
  end if;

  -- Trusted target page must exist.
  perform 1 from public.creator_profiles where id = _creator_profile_id;
  if not found then
    raise exception 'Creator page not found' using errcode = 'no_data_found';
  end if;

  if _id is null then
    -- INSERT into the trusted target. url scheme + kind enforced by CHECKs.
    insert into public.links (
      profile_id, title, url, icon, featured, scheduled, kind, is_visible, position
    ) values (
      _creator_profile_id,
      coalesce(_title, 'New link'),
      coalesce(_url, 'https://'),
      coalesce(_icon, 'globe'),
      coalesce(_featured, false),
      _scheduled,
      coalesce(_kind, 'link'),
      coalesce(_is_visible, true),
      coalesce(_position, 0)
    ) returning id into v_id;

    select * into v_after from public.links where id = v_id;
    perform public.write_creator_audit(
      'creator_link.created', 'creator_link', v_id,
      null::jsonb,
      jsonb_build_object('profile_id', _creator_profile_id, 'title', v_after.title,
                         'url', v_after.url, 'kind', v_after.kind,
                         'is_visible', v_after.is_visible, 'position', v_after.position)
    );
    return v_id;
  end if;

  -- UPDATE: only a link that already belongs to the trusted target. Scoping the
  -- WHERE to (id, profile_id) makes moving a link between pages impossible, and
  -- a foreign/nonexistent id resolves to "not found" without revealing which.
  select * into v_before from public.links
    where id = _id and profile_id = _creator_profile_id for update;
  if not found then
    raise exception 'Link not found' using errcode = 'no_data_found';
  end if;

  update public.links set
    title      = coalesce(_title, title),
    url        = coalesce(_url, url),
    icon       = coalesce(_icon, icon),
    featured   = coalesce(_featured, featured),
    scheduled  = coalesce(_scheduled, scheduled),
    kind       = coalesce(_kind, kind),
    is_visible = coalesce(_is_visible, is_visible),
    position   = coalesce(_position, position)
  where id = _id and profile_id = _creator_profile_id
  returning * into v_after;

  perform public.write_creator_audit(
    'creator_link.updated', 'creator_link', _id,
    jsonb_build_object('title', v_before.title, 'url', v_before.url, 'kind', v_before.kind,
                       'is_visible', v_before.is_visible, 'position', v_before.position,
                       'featured', v_before.featured),
    jsonb_build_object('title', v_after.title, 'url', v_after.url, 'kind', v_after.kind,
                       'is_visible', v_after.is_visible, 'position', v_after.position,
                       'featured', v_after.featured)
  );
  return _id;
end;
$$;

-- B2. Toggle a link's visibility. --------------------------------------------
create or replace function public.admin_set_creator_link_visibility(
  _link_id uuid,
  _is_visible boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before boolean;
  v_profile uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;
  if _is_visible is null then
    raise exception 'Visibility is required' using errcode = 'check_violation';
  end if;

  select is_visible, profile_id into v_before, v_profile from public.links
    where id = _link_id for update;
  if not found then
    raise exception 'Link not found' using errcode = 'no_data_found';
  end if;

  -- Successful no-op if already at the requested visibility (no mutation → no audit).
  if v_before is distinct from _is_visible then
    update public.links set is_visible = _is_visible where id = _link_id;
    perform public.write_creator_audit(
      'creator_link.visibility_changed', 'creator_link', _link_id,
      jsonb_build_object('profile_id', v_profile, 'is_visible', v_before),
      jsonb_build_object('profile_id', v_profile, 'is_visible', _is_visible)
    );
  end if;
end;
$$;

-- B3. Reorder a page's links (whole-set, deterministic). ---------------------
create or replace function public.admin_reorder_creator_links(
  _creator_profile_id uuid,
  _ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count int;
  v_distinct int;
  v_actual int;
  v_foreign int;
  v_before jsonb;
  v_after jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  v_count := coalesce(cardinality(_ordered_ids), 0);
  if v_count = 0 then
    raise exception 'No links provided' using errcode = 'check_violation';
  end if;

  -- Reject duplicates.
  select count(distinct e) into v_distinct from unnest(_ordered_ids) e;
  if v_distinct <> v_count then
    raise exception 'Duplicate link ids' using errcode = 'check_violation';
  end if;

  -- Reject any id not belonging to the target page (foreign / nonexistent).
  select count(*) into v_foreign from unnest(_ordered_ids) e
    where not exists (
      select 1 from public.links l where l.id = e and l.profile_id = _creator_profile_id
    );
  if v_foreign > 0 then
    raise exception 'Ordered list contains links not on this page'
      using errcode = 'check_violation';
  end if;

  -- Reject a partial list (must cover exactly the page's links → one position each).
  select count(*) into v_actual from public.links where profile_id = _creator_profile_id;
  if v_count <> v_actual then
    raise exception 'Ordered list must contain exactly the page''s links'
      using errcode = 'check_violation';
  end if;

  select jsonb_object_agg(id::text, position) into v_before
    from public.links where profile_id = _creator_profile_id;

  update public.links l
    set position = ord.idx - 1
    from (select e as id, ordinality as idx from unnest(_ordered_ids) with ordinality e) ord
    where l.id = ord.id and l.profile_id = _creator_profile_id;

  select jsonb_object_agg(id::text, position) into v_after
    from public.links where profile_id = _creator_profile_id;

  -- One audit row for the whole reorder, scoped to the page.
  perform public.write_creator_audit(
    'creator_link.reordered', 'creator_profile', _creator_profile_id, v_before, v_after
  );
end;
$$;

-- B4. Delete a link (audit preserves what was removed). ----------------------
create or replace function public.admin_delete_creator_link(
  _link_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before public.links;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_before from public.links where id = _link_id for update;
  if not found then
    raise exception 'Link not found' using errcode = 'no_data_found';
  end if;

  delete from public.links where id = _link_id;

  perform public.write_creator_audit(
    'creator_link.deleted', 'creator_link', _link_id,
    jsonb_build_object('profile_id', v_before.profile_id, 'title', v_before.title,
                       'url', v_before.url, 'kind', v_before.kind,
                       'position', v_before.position, 'is_visible', v_before.is_visible),
    null::jsonb
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants: internal-only helper stays revoked; RPCs are authenticated-only, with
-- the internal is_current_user_admin() check as the real authorization boundary.
-- ----------------------------------------------------------------------------
revoke execute on function public.admin_create_creator_page(text, text, text, text) from public, anon;
grant execute on function public.admin_create_creator_page(text, text, text, text) to authenticated;

revoke execute on function public.admin_update_creator_page(uuid, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_update_creator_page(uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

revoke execute on function public.admin_set_creator_page_status(uuid, text) from public, anon;
grant execute on function public.admin_set_creator_page_status(uuid, text) to authenticated;

revoke execute on function public.admin_transfer_creator_page(uuid, uuid) from public, anon;
grant execute on function public.admin_transfer_creator_page(uuid, uuid) to authenticated;

revoke execute on function public.admin_upsert_creator_link(uuid, text, text, uuid, text, boolean, text, text, boolean, integer) from public, anon;
grant execute on function public.admin_upsert_creator_link(uuid, text, text, uuid, text, boolean, text, text, boolean, integer) to authenticated;

revoke execute on function public.admin_set_creator_link_visibility(uuid, boolean) from public, anon;
grant execute on function public.admin_set_creator_link_visibility(uuid, boolean) to authenticated;

revoke execute on function public.admin_reorder_creator_links(uuid, uuid[]) from public, anon;
grant execute on function public.admin_reorder_creator_links(uuid, uuid[]) to authenticated;

revoke execute on function public.admin_delete_creator_link(uuid) from public, anon;
grant execute on function public.admin_delete_creator_link(uuid) to authenticated;
