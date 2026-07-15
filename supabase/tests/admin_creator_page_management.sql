-- ============================================================================
-- CABANA — Phase 2A.2 admin creator-page management behavioral checks (20260538)
-- ----------------------------------------------------------------------------
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_creator_page_management.sql
-- Self-cleaning (start + end). Any failed assertion raises and exits non-zero.
--
-- Fixtures (via the real handle_new_user signup trigger, then adjusted):
--   cpm_admin      — admin (has 'admin' role)
--   cpm_user       — plain authenticated (role 'user' only)
--   cpm_dest_free  — creator whose auto page is removed (a free transfer target)
--   cpm_dest_owns  — creator who keeps their auto page (a conflicting target)
--   cpm_member     — member account (an invalid transfer target)
-- ============================================================================

delete from auth.users where email like 'cpm_%@example.com';

insert into auth.users (id, email, raw_user_meta_data) values
  ('cf000000-0000-4000-a000-000000000001', 'cpm_admin@example.com',     '{"name":"Admin"}'::jsonb),
  ('cf000000-0000-4000-a000-000000000002', 'cpm_user@example.com',      '{"name":"User"}'::jsonb),
  ('cf000000-0000-4000-a000-000000000003', 'cpm_dest_free@example.com', '{"name":"DestFree"}'::jsonb),
  ('cf000000-0000-4000-a000-000000000004', 'cpm_dest_owns@example.com', '{"name":"DestOwns"}'::jsonb),
  ('cf000000-0000-4000-a000-000000000005', 'cpm_member@example.com',    '{"account_type":"member","name":"Member"}'::jsonb);

insert into public.user_roles (user_id, role)
  values ('cf000000-0000-4000-a000-000000000001', 'admin')
  on conflict (user_id, role) do nothing;

-- Free up the transfer target: remove cpm_dest_free's auto-provisioned page.
delete from public.creator_profiles where user_id = 'cf000000-0000-4000-a000-000000000003';

-- ---------------------------------------------------------------------------
-- 1/7 — Authorization: anon + non-admin denied for EVERY RPC; jwt metadata
--       cannot grant; admin succeeds.
-- ---------------------------------------------------------------------------
do $$
declare
  denied int := 0;
  u uuid := '00000000-0000-0000-0000-000000000000';
begin
  -- anon: EXECUTE is revoked, so every call is denied (42501) before the body.
  set local role anon;
  begin perform public.admin_create_creator_page('x','y'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_update_creator_page(u); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_set_creator_page_status(u,'publish'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_transfer_creator_page(u); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_upsert_creator_link(u,'t','https://a.co'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_set_creator_link_visibility(u,true); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_reorder_creator_links(u, array[u]); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_delete_creator_link(u); exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  if denied <> 8 then raise exception 'SECURITY: anon should be denied all 8 RPCs, only % denied', denied; end if;

  -- non-admin authenticated: the internal is_current_user_admin() gate denies all 8.
  denied := 0;
  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000002','role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_create_creator_page('x','y'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_update_creator_page(u); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_set_creator_page_status(u,'publish'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_transfer_creator_page(u); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_upsert_creator_link(u,'t','https://a.co'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_set_creator_link_visibility(u,true); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_reorder_creator_links(u, array[u]); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.admin_delete_creator_link(u); exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  if denied <> 8 then raise exception 'SECURITY: non-admin should be denied all 8 RPCs, only % denied', denied; end if;

  -- Client-supplied role metadata must NOT grant admin: the same non-admin with
  -- bogus admin-ish JWT claims is still denied (authority is user_roles).
  denied := 0;
  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000002','role','authenticated',
                      'user_role','admin','is_admin',true)::text, true);
  set local role authenticated;
  begin perform public.admin_create_creator_page('x','y'); exception when insufficient_privilege then denied := denied + 1; end;
  reset role;
  if denied <> 1 then raise exception 'SECURITY: forged JWT admin claim must NOT grant access'; end if;

  raise notice 'admin_creator_page_management (1/7) authorization OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 2/7 — Create + update
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_row public.creator_profiles;
  v_dup int := 0;
  v_reserved int := 0;
  v_blocked int := 0;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000001','role','authenticated')::text, true);
  set local role authenticated;

  -- admin-created page is ownerless + draft, handle normalized
  v_id := public.admin_create_creator_page('CpmPage','Cpm Display','the bio','the headline');
  select * into v_row from public.creator_profiles where id = v_id;
  if v_row.user_id is not null then raise exception 'admin-created page must be ownerless'; end if;
  if v_row.page_status <> 'draft' then raise exception 'admin-created page must be draft, got %', v_row.page_status; end if;
  if v_row.handle <> 'cpmpage' then raise exception 'handle must normalize to cpmpage, got %', v_row.handle; end if;

  -- duplicate handle → stable failure
  begin perform public.admin_create_creator_page('CpmPage','dup'); exception when unique_violation then v_dup := 1; end;
  if v_dup <> 1 then raise exception 'duplicate handle must fail with unique_violation'; end if;

  -- reserved handle rejected (validate_creator_handle)
  begin perform public.admin_create_creator_page('admin','res'); exception when check_violation then v_reserved := 1; end;
  if v_reserved <> 1 then raise exception 'reserved handle must be rejected'; end if;

  -- update changes only permitted fields; null = unchanged
  perform public.admin_update_creator_page(v_id, _name := 'New Name', _font_family := 'serif');
  select * into v_row from public.creator_profiles where id = v_id;
  if v_row.name <> 'New Name' then raise exception 'name should update'; end if;
  if v_row.font_family <> 'serif' then raise exception 'font_family should update'; end if;
  if v_row.bio <> 'the bio' then raise exception 'bio must be unchanged (null arg)'; end if;
  if v_row.headline <> 'the headline' then raise exception 'headline must be unchanged (null arg)'; end if;

  -- update cannot change page_status: it stays draft (no arg exists for it), and
  -- cannot change ownership (no user_id arg). Assert invalid appearance rejected.
  begin
    perform public.admin_update_creator_page(v_id, _font_family := 'comic');
    v_blocked := 0;
  exception when check_violation then v_blocked := 1;
  end;
  if v_blocked <> 1 then raise exception 'invalid font_family must be rejected'; end if;
  select * into v_row from public.creator_profiles where id = v_id;
  if v_row.page_status <> 'draft' then raise exception 'update must not change page_status'; end if;
  if v_row.user_id is not null then raise exception 'update must not change ownership'; end if;

  reset role;
  raise notice 'admin_creator_page_management (2/7) create + update OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 3/7 — Status transitions + anon visibility effects
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_bad int;
  v_status public.creator_page_status;
  n int;
begin
  select id into v_id from public.creator_profiles where handle = 'cpmpage';

  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000001','role','authenticated')::text, true);
  set local role authenticated;

  -- draft -> published (publish exposes)
  perform public.admin_set_creator_page_status(v_id,'publish');
  select page_status into v_status from public.creator_profiles where id = v_id;
  if v_status <> 'published' then raise exception 'publish must set published'; end if;

  reset role;
  set local role anon;
  select count(*) into n from public.creator_profiles where handle = 'cpmpage';
  if n <> 1 then raise exception 'published page must be visible to anon'; end if;
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000001','role','authenticated')::text, true);
  set local role authenticated;

  -- forbidden: archived->published directly (via 'publish' on published is a no-op → rejected)
  v_bad := 0;
  begin perform public.admin_set_creator_page_status(v_id,'publish'); exception when check_violation then v_bad := 1; end;
  if v_bad <> 1 then raise exception 'no-op publish on published must be rejected'; end if;

  -- published -> draft (unpublish hides)
  perform public.admin_set_creator_page_status(v_id,'unpublish');
  reset role;
  set local role anon;
  select count(*) into n from public.creator_profiles where handle = 'cpmpage';
  if n <> 0 then raise exception 'unpublished page must be hidden from anon'; end if;
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000001','role','authenticated')::text, true);
  set local role authenticated;

  -- draft -> archived (archive hides), then forbidden archived->published, then restore->draft
  perform public.admin_set_creator_page_status(v_id,'archive');
  select page_status into v_status from public.creator_profiles where id = v_id;
  if v_status <> 'archived' then raise exception 'archive must set archived'; end if;

  v_bad := 0;
  begin perform public.admin_set_creator_page_status(v_id,'publish'); exception when check_violation then v_bad := 1; end;
  if v_bad <> 1 then raise exception 'archived->published (publish) must be rejected'; end if;

  -- invalid action string rejected
  v_bad := 0;
  begin perform public.admin_set_creator_page_status(v_id,'frobnicate'); exception when check_violation then v_bad := 1; end;
  if v_bad <> 1 then raise exception 'arbitrary action string must be rejected'; end if;

  perform public.admin_set_creator_page_status(v_id,'restore');
  select page_status into v_status from public.creator_profiles where id = v_id;
  if v_status <> 'draft' then raise exception 'restore must return archived to draft'; end if;

  -- published -> archived path
  perform public.admin_set_creator_page_status(v_id,'publish');
  perform public.admin_set_creator_page_status(v_id,'archive');
  select page_status into v_status from public.creator_profiles where id = v_id;
  if v_status <> 'archived' then raise exception 'published->archived must work'; end if;
  -- leave it back at draft for later blocks
  perform public.admin_set_creator_page_status(v_id,'restore');

  reset role;
  raise notice 'admin_creator_page_management (3/7) status transitions OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 4/7 — Transfer
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_owner uuid;
  v_fail int;
begin
  select id into v_id from public.creator_profiles where handle = 'cpmpage';

  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000001','role','authenticated')::text, true);
  set local role authenticated;

  -- valid destination (cpm_dest_free owns nothing) succeeds
  perform public.admin_transfer_creator_page(v_id, 'cf000000-0000-4000-a000-000000000003');
  select user_id into v_owner from public.creator_profiles where id = v_id;
  if v_owner is distinct from 'cf000000-0000-4000-a000-000000000003' then
    raise exception 'transfer to free destination must set owner';
  end if;

  -- nonexistent destination fails safely
  v_fail := 0;
  begin perform public.admin_transfer_creator_page(v_id, '00000000-0000-0000-0000-0000000000ff');
  exception when check_violation then v_fail := 1; end;
  if v_fail <> 1 then raise exception 'transfer to nonexistent account must fail'; end if;

  -- member account is not a valid creator destination
  v_fail := 0;
  begin perform public.admin_transfer_creator_page(v_id, 'cf000000-0000-4000-a000-000000000005');
  exception when check_violation then v_fail := 1; end;
  if v_fail <> 1 then raise exception 'transfer to member account must fail'; end if;

  -- conflicting ownership: cpm_dest_owns already owns their auto page
  v_fail := 0;
  begin perform public.admin_transfer_creator_page(v_id, 'cf000000-0000-4000-a000-000000000004');
  exception when check_violation then v_fail := 1; end;
  if v_fail <> 1 then raise exception 'transfer to an account already owning a page must fail'; end if;

  -- clearing ownership succeeds
  perform public.admin_transfer_creator_page(v_id, null);
  select user_id into v_owner from public.creator_profiles where id = v_id;
  if v_owner is not null then raise exception 'clearing ownership must null user_id'; end if;

  reset role;
  raise notice 'admin_creator_page_management (4/7) transfer OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 5/7 — Links
-- ---------------------------------------------------------------------------
do $$
declare
  v_page uuid;
  v_other uuid;
  v_l1 uuid; v_l2 uuid; v_l3 uuid;
  v_fail int;
  n int;
  v_vis boolean;
begin
  select id into v_page from public.creator_profiles where handle = 'cpmpage';

  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000001','role','authenticated')::text, true);
  set local role authenticated;

  -- another admin-owned page for the cross-profile test
  v_other := public.admin_create_creator_page('CpmOther','Other');

  -- create three links
  v_l1 := public.admin_upsert_creator_link(v_page, 'One',   'https://one.example.com');
  v_l2 := public.admin_upsert_creator_link(v_page, 'Two',   'https://two.example.com');
  v_l3 := public.admin_upsert_creator_link(v_page, 'Three', 'https://three.example.com');
  select count(*) into n from public.links where profile_id = v_page;
  if n <> 3 then raise exception 'three links should exist, got %', n; end if;

  -- update a link (same profile)
  perform public.admin_upsert_creator_link(v_page, 'One!', 'https://one.example.com', _id := v_l1);
  select count(*) into n from public.links where id = v_l1 and title = 'One!';
  if n <> 1 then raise exception 'link update must apply'; end if;

  -- cross-profile update rejected (link belongs to v_page, not v_other)
  v_fail := 0;
  begin perform public.admin_upsert_creator_link(v_other, 'Hijack', 'https://x.example.com', _id := v_l1);
  exception when no_data_found then v_fail := 1; end;
  if v_fail <> 1 then raise exception 'cross-profile link update must be rejected'; end if;
  -- ...and the link did NOT move
  select count(*) into n from public.links where id = v_l1 and profile_id = v_page;
  if n <> 1 then raise exception 'link must not move between profiles'; end if;

  -- invalid kind rejected
  v_fail := 0;
  begin perform public.admin_upsert_creator_link(v_page, 'Bad', 'https://x.example.com', _kind := 'button');
  exception when check_violation then v_fail := 1; end;
  if v_fail <> 1 then raise exception 'invalid link kind must be rejected'; end if;

  -- invalid URL scheme rejected (links_url_http_scheme)
  v_fail := 0;
  begin perform public.admin_upsert_creator_link(v_page, 'Bad', 'javascript:alert(1)');
  exception when check_violation then v_fail := 1; end;
  if v_fail <> 1 then raise exception 'invalid URL scheme must be rejected'; end if;

  -- visibility update
  perform public.admin_set_creator_link_visibility(v_l2, false);
  select is_visible into v_vis from public.links where id = v_l2;
  if v_vis then raise exception 'visibility update must apply'; end if;

  -- reorder: valid permutation
  perform public.admin_reorder_creator_links(v_page, array[v_l3, v_l1, v_l2]);
  select position into n from public.links where id = v_l3;
  if n <> 0 then raise exception 'reorder must place v_l3 at position 0, got %', n; end if;

  -- reorder: duplicates rejected
  v_fail := 0;
  begin perform public.admin_reorder_creator_links(v_page, array[v_l1, v_l1, v_l2]);
  exception when check_violation then v_fail := 1; end;
  if v_fail <> 1 then raise exception 'reorder duplicates must be rejected'; end if;

  -- reorder: foreign id rejected
  v_fail := 0;
  begin perform public.admin_reorder_creator_links(v_page, array[v_l1, v_l2, '00000000-0000-0000-0000-0000000000aa']);
  exception when check_violation then v_fail := 1; end;
  if v_fail <> 1 then raise exception 'reorder foreign id must be rejected'; end if;

  -- reorder: missing id (partial list) rejected
  v_fail := 0;
  begin perform public.admin_reorder_creator_links(v_page, array[v_l1, v_l2]);
  exception when check_violation then v_fail := 1; end;
  if v_fail <> 1 then raise exception 'reorder partial list must be rejected'; end if;

  -- delete a link
  perform public.admin_delete_creator_link(v_l3);
  select count(*) into n from public.links where id = v_l3;
  if n <> 0 then raise exception 'deleted link must be gone'; end if;

  reset role;

  -- deleted link no longer visible to anon either (it does not exist)
  set local role anon;
  select count(*) into n from public.links where id = v_l3;
  if n <> 0 then raise exception 'deleted link must not be visible to anon'; end if;
  reset role;

  raise notice 'admin_creator_page_management (5/7) links OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 6/7 — Audit coverage
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_link uuid;
  v_before jsonb;
  v_after jsonb;
  n int;
  bad_keys int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000001','role','authenticated')::text, true);
  set local role authenticated;

  -- Fresh page to make audit counting deterministic.
  v_id := public.admin_create_creator_page('CpmAudit','Audit Page');
  perform public.admin_set_creator_page_status(v_id, 'publish');   -- creator_page.published
  perform public.admin_update_creator_page(v_id, _headline := 'x'); -- creator_page.updated
  v_link := public.admin_upsert_creator_link(v_id, 'AL', 'https://al.example.com'); -- creator_link.created
  perform public.admin_set_creator_link_visibility(v_link, false);  -- creator_link.visibility_changed
  perform public.admin_transfer_creator_page(v_id, 'cf000000-0000-4000-a000-000000000003'); -- transferred
  perform public.admin_delete_creator_link(v_link);                 -- creator_link.deleted
  reset role;

  -- exactly one audit row per successful operation on this page's target_id
  select count(*) into n from public.audit_logs where target_id = v_id;
  if n <> 4 then raise exception 'expected 4 creator_profile audit rows (created/published/updated/transferred), got %', n; end if;
  select count(*) into n from public.audit_logs where target_id = v_link;
  if n <> 3 then raise exception 'expected 3 creator_link audit rows (created/visibility/deleted), got %', n; end if;

  -- correct action + target_type + actor for the created row
  select count(*) into n from public.audit_logs
    where target_id = v_id and action = 'creator_page.created'
      and target_type = 'creator_profile'
      and actor_user_id = 'cf000000-0000-4000-a000-000000000001'
      and actor_role = 'admin';
  if n <> 1 then raise exception 'created audit row must have correct action/target_type/actor'; end if;

  -- status before/after captured on the published row
  select before, after into v_before, v_after from public.audit_logs
    where target_id = v_id and action = 'creator_page.published';
  if v_before->>'page_status' <> 'draft' or v_after->>'page_status' <> 'published' then
    raise exception 'published audit must record status before/after';
  end if;

  -- transfer records claimed booleans + owner UUIDs (honest Auth-UUID handling)
  select before, after into v_before, v_after from public.audit_logs
    where target_id = v_id and action = 'creator_page.transferred';
  if (v_before->>'claimed_before')::boolean <> false then raise exception 'transfer before.claimed_before must be false'; end if;
  if (v_after->>'claimed_after')::boolean <> true then raise exception 'transfer after.claimed_after must be true'; end if;
  if v_after->>'owner_after' <> 'cf000000-0000-4000-a000-000000000003' then
    raise exception 'transfer after.owner_after must record the destination Auth UUID';
  end if;

  -- deleted link audit preserves what was removed
  select before into v_before from public.audit_logs
    where target_id = v_link and action = 'creator_link.deleted';
  if v_before->>'title' <> 'AL' then raise exception 'deleted-link audit must preserve title'; end if;

  -- NO email / token / secret keys anywhere in these audit payloads
  select count(*) into bad_keys from public.audit_logs a
    where a.target_id in (v_id, v_link)
      and (a.before::text ~* '(email|token|secret|password)'
        or a.after::text ~* '(email|token|secret|password)');
  if bad_keys <> 0 then raise exception 'SECURITY: audit payloads must not contain email/token/secret'; end if;

  -- a FAILED operation writes NO audit row (dup handle create)
  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000001','role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_create_creator_page('CpmAudit','dup'); exception when unique_violation then null; end;
  reset role;
  select count(*) into n from public.audit_logs where action = 'creator_page.created' and (after->>'handle') = 'cpmaudit';
  if n <> 1 then raise exception 'a failed create must not add an audit row (found % for cpmaudit)', n; end if;

  -- reorder writes exactly one page-scoped row with position before/after
  perform set_config('request.jwt.claims',
    json_build_object('sub','cf000000-0000-4000-a000-000000000001','role','authenticated')::text, true);
  set local role authenticated;
  declare a uuid; b uuid; begin
    a := public.admin_upsert_creator_link(v_id, 'r1', 'https://r1.example.com');
    b := public.admin_upsert_creator_link(v_id, 'r2', 'https://r2.example.com');
    perform public.admin_reorder_creator_links(v_id, array[b, a]);
  end;
  reset role;
  select count(*) into n from public.audit_logs where target_id = v_id and action = 'creator_link.reordered' and target_type = 'creator_profile';
  if n <> 1 then raise exception 'reorder must write exactly one page-scoped audit row, got %', n; end if;

  raise notice 'admin_creator_page_management (6/7) audit coverage OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 7/7 — Regression: owner self-edit + signup unchanged; 2A.1 invariants hold
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := 'cf000000-0000-4000-a000-000000000004';  -- cpm_dest_owns
  v_page uuid;
  v_name text;
  v_status public.creator_page_status;
  v_audits int;
begin
  -- signup-created creator still defaults to published (2A.1 invariant intact)
  select page_status into v_status from public.creator_profiles where user_id = v_uid;
  if v_status <> 'published' then raise exception 'signup creator must still default published, got %', v_status; end if;

  -- owner can still self-edit their own creator profile via the normal owner path
  select id into v_page from public.creator_profiles where user_id = v_uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.creator_profiles set name = 'Owner Edited' where id = v_page;  -- owner RLS update
  reset role;
  select name into v_name from public.creator_profiles where id = v_page;
  if v_name <> 'Owner Edited' then raise exception 'owner self-edit path must still work'; end if;

  -- and the owner self-edit did NOT create an admin audit row
  select count(*) into v_audits from public.audit_logs
    where target_id = v_page and action like 'creator_page.%';
  if v_audits <> 0 then raise exception 'owner self-edit must not be audited as an admin action'; end if;

  raise notice 'admin_creator_page_management (7/7) regression OK.';
end $$;

-- ── End-of-run cleanup ──────────────────────────────────────────────────────
-- Remove admin-created ownerless pages (no auth.users cascade covers them).
delete from public.creator_profiles where handle in ('cpmpage','cpmother','cpmaudit');
delete from auth.users where email like 'cpm_%@example.com';

select 'admin_creator_page_management checks passed' as result;
