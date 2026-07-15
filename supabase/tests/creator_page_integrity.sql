-- ============================================================================
-- CABANA — creator-page integrity behavioral checks (20260540)
-- ----------------------------------------------------------------------------
-- Proves the forward hardening layer over migrations 20260537/20260538:
--   * one non-null creator-page owner, enforced by a partial unique index;
--   * no authenticated direct creator-profile INSERT or protected-column UPDATE;
--   * normal owner profile/link edits and signup provisioning still work;
--   * links cannot move between creator pages, including through privileged SQL;
--   * transfer conflicts fail with stable, non-constraint-leaking errors; and
--   * page audit history is admin-only and includes page + deleted-link activity.
--
-- Self-cleaning. Any failed assertion raises and exits non-zero.
-- ============================================================================

delete from public.creator_profiles where handle like 'cpi-integrity-%';
delete from auth.users where email like 'cpi_%@example.com';

-- Real signup-trigger fixtures.
insert into auth.users (id, email, raw_user_meta_data) values
  ('ca100000-0000-4000-a000-000000000001', 'cpi_admin@example.com',
   '{"name":"Integrity Admin"}'::jsonb),
  ('ca100000-0000-4000-a000-000000000002', 'cpi_owner@example.com',
   '{"name":"Integrity Owner"}'::jsonb),
  ('ca100000-0000-4000-a000-000000000003', 'cpi_free@example.com',
   '{"name":"Integrity Free"}'::jsonb),
  ('ca100000-0000-4000-a000-000000000004', 'cpi_conflict@example.com',
   '{"name":"Integrity Conflict"}'::jsonb),
  ('ca100000-0000-4000-a000-000000000005', 'cpi_member@example.com',
   '{"name":"Integrity Member","account_type":"member"}'::jsonb);

insert into public.user_roles (user_id, role)
values ('ca100000-0000-4000-a000-000000000001', 'admin')
on conflict (user_id, role) do nothing;

-- Keep the account but free its auto-provisioned page for transfer tests.
delete from public.creator_profiles
where user_id = 'ca100000-0000-4000-a000-000000000003';

-- ---------------------------------------------------------------------------
-- 1/6 — Catalog: unique index, least-privilege column grants, trigger and RPCs
-- ---------------------------------------------------------------------------
do $$
declare
  v_unique boolean;
  v_predicate text;
  v_indexdef text;
  v_col text;
  v_trigger_count integer;
  v_trigger_fn oid;
  v_trigger_security_definer boolean;
  v_trigger_config text;
  v_history_fn regprocedure;
  v_history_security_definer boolean;
  v_history_setof boolean;
  v_history_config text;
  v_transfer_def text;
begin
  select i.indisunique,
         pg_get_expr(i.indpred, i.indrelid),
         pg_get_indexdef(i.indexrelid)
    into v_unique, v_predicate, v_indexdef
  from pg_catalog.pg_class idx
  join pg_catalog.pg_namespace ns on ns.oid = idx.relnamespace
  join pg_catalog.pg_index i on i.indexrelid = idx.oid
  where ns.nspname = 'public'
    and idx.relname = 'creator_profiles_one_page_per_owner_idx';

  if not found or not v_unique then
    raise exception 'creator_profiles_one_page_per_owner_idx must exist and be UNIQUE';
  end if;
  if position('(user_id)' in v_indexdef) = 0
     or position('user_id IS NOT NULL' in v_predicate) = 0 then
    raise exception 'owner index must target user_id with WHERE user_id IS NOT NULL: % / %',
      v_indexdef, v_predicate;
  end if;

  if has_table_privilege('authenticated', 'public.creator_profiles', 'INSERT') then
    raise exception 'SECURITY: authenticated must not hold creator_profiles table INSERT';
  end if;
  if has_table_privilege('authenticated', 'public.creator_profiles', 'UPDATE') then
    raise exception 'SECURITY: authenticated must not hold creator_profiles table-wide UPDATE';
  end if;

  foreach v_col in array array[
    'handle', 'name', 'bio', 'avatar_url', 'banner_url', 'theme', 'headline',
    'accent_color', 'button_style', 'font_family', 'background_style'
  ] loop
    if not has_column_privilege(
      'authenticated', 'public.creator_profiles', v_col, 'UPDATE'
    ) then
      raise exception 'authenticated must retain creator_profiles.% UPDATE', v_col;
    end if;
  end loop;

  foreach v_col in array array[
    'id', 'user_id', 'page_status', 'plan', 'created_at', 'updated_at'
  ] loop
    if has_column_privilege(
      'authenticated', 'public.creator_profiles', v_col, 'UPDATE'
    ) then
      raise exception 'SECURITY: authenticated must not UPDATE creator_profiles.%', v_col;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.links', 'UPDATE') then
    raise exception 'SECURITY: authenticated must not hold links table-wide UPDATE';
  end if;
  foreach v_col in array array[
    'title', 'url', 'icon', 'featured', 'scheduled', 'position', 'kind', 'is_visible'
  ] loop
    if not has_column_privilege('authenticated', 'public.links', v_col, 'UPDATE') then
      raise exception 'authenticated must retain links.% UPDATE', v_col;
    end if;
  end loop;
  foreach v_col in array array['id', 'profile_id', 'clicks', 'created_at'] loop
    if has_column_privilege('authenticated', 'public.links', v_col, 'UPDATE') then
      raise exception 'SECURITY: authenticated must not UPDATE links.%', v_col;
    end if;
  end loop;

  select count(*), min(t.tgfoid::bigint)::oid
    into v_trigger_count, v_trigger_fn
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname = 'links'
    and not t.tgisinternal
    and t.tgenabled <> 'D'
    and position('UPDATE OF profile_id' in pg_get_triggerdef(t.oid)) > 0;
  if v_trigger_count <> 1 then
    raise exception 'expected exactly one enabled links UPDATE OF profile_id trigger, got %',
      v_trigger_count;
  end if;

  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    into v_trigger_security_definer, v_trigger_config
  from pg_catalog.pg_proc p where p.oid = v_trigger_fn;
  if v_trigger_security_definer then
    raise exception 'link immutability trigger function must remain SECURITY INVOKER';
  end if;
  if v_trigger_config !~ '(^|,)search_path=(""|)($|,)' then
    raise exception 'link immutability trigger function must pin an empty search_path: %',
      v_trigger_config;
  end if;
  if has_function_privilege('anon', v_trigger_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_trigger_fn, 'EXECUTE') then
    raise exception 'link immutability trigger function must not be directly client-callable';
  end if;

  v_history_fn := to_regprocedure(
    'public.admin_get_creator_page_audit_history(uuid,integer)'
  );
  if v_history_fn is null then
    raise exception 'admin_get_creator_page_audit_history(uuid,integer) is missing';
  end if;
  select p.prosecdef, p.proretset, coalesce(array_to_string(p.proconfig, ','), '')
    into v_history_security_definer, v_history_setof, v_history_config
  from pg_catalog.pg_proc p where p.oid = v_history_fn::oid;
  if v_history_security_definer or not v_history_setof then
    raise exception 'audit-history RPC must be SECURITY INVOKER and return a set';
  end if;
  if v_history_config !~ '(^|,)search_path=(""|)($|,)' then
    raise exception 'audit-history RPC must pin an empty search_path: %', v_history_config;
  end if;
  if has_function_privilege(
       'anon', 'public.admin_get_creator_page_audit_history(uuid,integer)', 'EXECUTE'
     ) then
    raise exception 'SECURITY: anon must not execute creator-page audit history';
  end if;
  if not has_function_privilege(
       'authenticated', 'public.admin_get_creator_page_audit_history(uuid,integer)', 'EXECUTE'
     ) then
    raise exception 'authenticated needs EXECUTE; the RPC internal admin check is authoritative';
  end if;

  if has_function_privilege(
       'anon', 'public.admin_transfer_creator_page(uuid,uuid)', 'EXECUTE'
     ) then
    raise exception 'SECURITY: anon must not execute creator-page transfer';
  end if;
  if not has_function_privilege(
       'authenticated', 'public.admin_transfer_creator_page(uuid,uuid)', 'EXECUTE'
     ) then
    raise exception 'authenticated needs transfer EXECUTE; its internal admin check is authoritative';
  end if;

  v_transfer_def := lower(pg_get_functiondef(
    'public.admin_transfer_creator_page(uuid,uuid)'::regprocedure
  ));
  if position('unique_violation' in v_transfer_def) = 0
     or position('creator_profiles_one_page_per_owner_idx' in v_transfer_def) = 0
     or position('destination account already owns a creator page' in v_transfer_def) = 0 then
    raise exception 'transfer RPC must map the owner-index race to its stable safe error';
  end if;

  raise notice 'creator_page_integrity (1/6) catalog + privilege contract OK.';
end
$$;

-- ---------------------------------------------------------------------------
-- 2/6 — Signup + owner profile edits survive; lifecycle/ownership stay protected
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid := 'ca100000-0000-4000-a000-000000000002';
  v_member uuid := 'ca100000-0000-4000-a000-000000000005';
  v_admin uuid := 'ca100000-0000-4000-a000-000000000001';
  v_page uuid;
  v_status public.creator_page_status;
  v_name text;
  v_denied boolean;
  n integer;
begin
  select id, page_status into v_page, v_status
  from public.creator_profiles where user_id = v_owner;
  if v_page is null or v_status <> 'published' then
    raise exception 'creator signup must still provision exactly one published page';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  update public.creator_profiles
  set name = 'CPI Owner Edited', font_family = 'serif', background_style = 'solid'
  where id = v_page;
  select name into v_name from public.creator_profiles where id = v_page;
  if v_name <> 'CPI Owner Edited' then
    raise exception 'owner-editable creator-profile columns must still update';
  end if;

  v_denied := false;
  begin
    update public.creator_profiles set page_status = 'draft' where id = v_page;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'SECURITY: owner direct page_status UPDATE must be denied';
  end if;

  update public.creator_profiles set name = 'CPI Atomic Before' where id = v_page;
  v_denied := false;
  begin
    update public.creator_profiles
    set name = 'CPI Atomic After', page_status = 'draft'
    where id = v_page;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  select name into v_name from public.creator_profiles where id = v_page;
  if not v_denied or v_name <> 'CPI Atomic Before' then
    raise exception 'protected mixed-column UPDATE must fail atomically';
  end if;
  reset role;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_denied := false;
  begin
    insert into public.creator_profiles (user_id, handle, name, page_status)
    values (v_member, 'cpi-integrity-member-bypass', 'Bypass', 'published');
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'SECURITY: authenticated direct creator-page INSERT must be denied';
  end if;
  reset role;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  perform public.admin_set_creator_page_status(v_page, 'unpublish');
  reset role;

  set local role anon;
  select count(*) into n from public.creator_profiles where id = v_page;
  if n <> 0 then raise exception 'anon must not see the admin-unpublished page'; end if;
  reset role;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  perform public.admin_set_creator_page_status(v_page, 'publish');
  reset role;

  raise notice 'creator_page_integrity (2/6) lifecycle + owner regression OK.';
end
$$;

-- ---------------------------------------------------------------------------
-- 3/6 — Unique owner invariant + safe transfer errors + failed-op audit behavior
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := 'ca100000-0000-4000-a000-000000000001';
  v_free uuid := 'ca100000-0000-4000-a000-000000000003';
  v_conflict uuid := 'ca100000-0000-4000-a000-000000000004';
  v_member uuid := 'ca100000-0000-4000-a000-000000000005';
  v_page_a uuid;
  v_page_b uuid;
  v_link uuid;
  v_owner uuid;
  v_denied boolean;
  v_message text;
  n integer;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_page_a := public.admin_create_creator_page(
    'cpi-integrity-page-a', 'Integrity Page A'
  );
  v_page_b := public.admin_create_creator_page(
    'cpi-integrity-page-b', 'Integrity Page B'
  );
  reset role;

  select count(*) into n from public.creator_profiles
  where id in (v_page_a, v_page_b) and user_id is null;
  if n <> 2 then raise exception 'partial owner index must permit multiple ownerless pages'; end if;

  -- Direct SQL proves the database invariant independently of the RPC precheck.
  v_denied := false;
  begin
    update public.creator_profiles set user_id = v_conflict where id = v_page_b;
  exception when unique_violation then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'one non-null owner must not hold two creator pages';
  end if;
  select user_id into v_owner from public.creator_profiles where id = v_page_b;
  if v_owner is not null then raise exception 'failed duplicate ownership UPDATE must roll back'; end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  perform public.admin_transfer_creator_page(v_page_a, v_free);

  v_denied := false;
  v_message := null;
  begin
    perform public.admin_transfer_creator_page(v_page_b, v_free);
  exception when check_violation then
    v_denied := true;
    get stacked diagnostics v_message = message_text;
  end;
  if not v_denied
     or v_message <> 'Destination account already owns a creator page' then
    raise exception 'transfer conflict must return the stable safe error, got: %', v_message;
  end if;

  v_denied := false;
  v_message := null;
  begin
    perform public.admin_transfer_creator_page(
      v_page_b, '00000000-0000-4000-a000-0000000000ff'
    );
  exception when check_violation then
    v_denied := true;
    get stacked diagnostics v_message = message_text;
  end;
  if not v_denied
     or v_message <> 'Destination account is not a valid creator account' then
    raise exception 'missing destination must fail generically, got: %', v_message;
  end if;

  v_denied := false;
  v_message := null;
  begin
    perform public.admin_transfer_creator_page(v_page_b, v_member);
  exception when check_violation then
    v_denied := true;
    get stacked diagnostics v_message = message_text;
  end;
  if not v_denied
     or v_message <> 'Destination account is not a valid creator account' then
    raise exception 'member destination must fail generically, got: %', v_message;
  end if;

  -- Generate current and deleted link history for the page-level history RPC.
  v_link := public.admin_upsert_creator_link(
    v_page_a, 'Integrity Link', 'https://integrity.example.com'
  );
  perform public.admin_upsert_creator_link(
    v_page_a, 'Integrity Link Updated', 'https://integrity.example.com/updated',
    _id := v_link
  );
  perform public.admin_delete_creator_link(v_link);
  reset role;

  select count(*) into n from public.creator_profiles where user_id = v_free;
  if n <> 1 then raise exception 'successful transfer must leave exactly one page for owner'; end if;
  select user_id into v_owner from public.creator_profiles where id = v_page_b;
  if v_owner is not null then raise exception 'failed transfers must leave source ownerless'; end if;
  select count(*) into n from public.audit_logs
  where target_id = v_page_b and action = 'creator_page.transferred';
  if n <> 0 then raise exception 'failed transfer must not append an audit row'; end if;

  raise notice 'creator_page_integrity (3/6) owner uniqueness + transfer errors OK.';
end
$$;

-- ---------------------------------------------------------------------------
-- 4/6 — Owner link edits survive; profile_id is immutable at ACL + trigger layers
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := 'ca100000-0000-4000-a000-000000000001';
  v_owner uuid := 'ca100000-0000-4000-a000-000000000002';
  v_page uuid;
  v_other_page uuid;
  v_link uuid;
  v_parent uuid;
  v_title text;
  v_denied boolean;
begin
  select id into v_page from public.creator_profiles where user_id = v_owner;
  select id into v_other_page from public.creator_profiles
  where user_id = 'ca100000-0000-4000-a000-000000000004';

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  insert into public.links (
    profile_id, title, url, icon, position, kind, is_visible
  ) values (
    v_page, 'Owner Link', 'https://owner.example.com', 'globe', 0, 'link', true
  ) returning id into v_link;

  update public.links
  set title = 'Owner Link Edited', position = 2, kind = 'social', is_visible = false
  where id = v_link;
  select title into v_title from public.links where id = v_link;
  if v_title <> 'Owner Link Edited' then
    raise exception 'owner-editable link columns must still update';
  end if;

  v_denied := false;
  begin
    update public.links set profile_id = v_other_page where id = v_link;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'SECURITY: raw authenticated link profile_id UPDATE must be denied';
  end if;
  reset role;

  -- The invariant also protects privileged/future SQL paths that bypass ACL/RLS.
  v_denied := false;
  begin
    update public.links set profile_id = v_other_page where id = v_link;
  exception when check_violation then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'SECURITY: immutable-parent trigger must reject privileged link moves';
  end if;
  select profile_id into v_parent from public.links where id = v_link;
  if v_parent is distinct from v_page then
    raise exception 'failed link move must preserve the original parent';
  end if;

  -- Updating the column to its current value is not a move and remains harmless.
  update public.links set profile_id = profile_id where id = v_link;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  perform public.admin_upsert_creator_link(
    v_page, 'Admin Same-Page Edit', 'https://owner.example.com/admin', _id := v_link
  );
  reset role;
  select profile_id, title into v_parent, v_title from public.links where id = v_link;
  if v_parent is distinct from v_page or v_title <> 'Admin Same-Page Edit' then
    raise exception 'same-page admin link update must remain functional';
  end if;

  raise notice 'creator_page_integrity (4/6) immutable link parent + regressions OK.';
end
$$;

-- ---------------------------------------------------------------------------
-- 5/6 — Page audit history: admin-only, bounded and complete after link deletion
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := 'ca100000-0000-4000-a000-000000000001';
  v_non_admin uuid := 'ca100000-0000-4000-a000-000000000003';
  v_page_a uuid;
  v_page_b uuid;
  v_history jsonb;
  v_denied boolean;
  n integer;
begin
  select id into v_page_a from public.creator_profiles
  where handle = 'cpi-integrity-page-a';
  select id into v_page_b from public.creator_profiles
  where handle = 'cpi-integrity-page-b';

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_non_admin, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_denied := false;
  begin
    perform 1
    from public.admin_get_creator_page_audit_history(v_page_a, 100);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'SECURITY: non-admin must not read creator-page audit history';
  end if;
  reset role;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
    into v_history
  from public.admin_get_creator_page_audit_history(v_page_a, 100) h;

  select count(*) into n from jsonb_array_elements(v_history) e
  where e->>'action' = 'creator_page.created';
  if n <> 1 then raise exception 'history must include the page create action'; end if;
  select count(*) into n from jsonb_array_elements(v_history) e
  where e->>'action' = 'creator_page.transferred';
  if n <> 1 then raise exception 'history must include the page transfer action'; end if;
  select count(*) into n from jsonb_array_elements(v_history) e
  where e->>'action' = 'creator_link.created';
  if n <> 1 then raise exception 'history must include link creation'; end if;
  select count(*) into n from jsonb_array_elements(v_history) e
  where e->>'action' = 'creator_link.updated';
  if n <> 1 then raise exception 'history must retain link update association after deletion'; end if;
  select count(*) into n from jsonb_array_elements(v_history) e
  where e->>'action' = 'creator_link.deleted';
  if n <> 1 then raise exception 'history must include deleted-link activity'; end if;

  select count(*) into n from jsonb_array_elements(v_history) e
  where e->>'target_id' = v_page_b::text;
  if n <> 0 then raise exception 'history must not include another page''s audit rows'; end if;

  select count(*) into n
  from public.admin_get_creator_page_audit_history(v_page_a, 1);
  if n <> 1 then raise exception 'audit-history limit of 1 must return exactly one row'; end if;
  reset role;

  raise notice 'creator_page_integrity (5/6) page audit history OK.';
end
$$;

-- ---------------------------------------------------------------------------
-- 6/6 — Final invariant counts + cleanup
-- ---------------------------------------------------------------------------
do $$
declare n integer;
begin
  select count(*) into n
  from (
    select user_id
    from public.creator_profiles
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) duplicates;
  if n <> 0 then raise exception 'final state contains duplicate non-null page owners'; end if;

  delete from public.creator_profiles where handle like 'cpi-integrity-%';
  delete from auth.users where email like 'cpi_%@example.com';

  raise notice 'creator_page_integrity (6/6) final invariant + cleanup OK.';
end
$$;

select 'creator_page_integrity checks passed' as result;
