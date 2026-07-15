-- ============================================================================
-- CABANA — Phase 2A.1 creator-page visibility behavioral checks (20260537)
-- ----------------------------------------------------------------------------
-- Proves the draft/published/archived visibility model on a freshly reset local
-- instance:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/creator_page_visibility.sql
-- Self-cleaning (start + end); any failed assertion raises and exits non-zero.
--
-- Fixtures (created via the real handle_new_user signup trigger, then adjusted):
--   cpv_pub    — published creator; links: pub_visible (is_visible), pub_hidden
--   cpv_draft  — draft creator;     link:  draft_link (is_visible)
--   cpv_arch   — archived creator;  link:  arch_link  (is_visible)
--   cpv_other  — unrelated authenticated user (no relationship)
--   cpv_admin  — admin (has 'admin' role)
-- ============================================================================

-- ── Start-of-run cleanup (idempotent / re-runnable) ─────────────────────────
delete from auth.users where email like 'cpv_%@example.com';

-- ── Fixtures (as postgres/superuser; bypasses RLS) ──────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('c9000000-0000-4000-a000-000000000001', 'cpv_pub@example.com',   '{"name":"Pub"}'::jsonb),
  ('c9000000-0000-4000-a000-000000000002', 'cpv_draft@example.com', '{"name":"Draft"}'::jsonb),
  ('c9000000-0000-4000-a000-000000000003', 'cpv_arch@example.com',  '{"name":"Arch"}'::jsonb),
  ('c9000000-0000-4000-a000-000000000004', 'cpv_other@example.com', '{"name":"Other"}'::jsonb),
  ('c9000000-0000-4000-a000-000000000005', 'cpv_admin@example.com', '{"name":"Admin"}'::jsonb);

-- handle_new_user provisioned a published creator_profiles row for each; set the
-- lifecycle states we need for the non-published fixtures.
update public.creator_profiles set page_status = 'draft'
  where user_id = 'c9000000-0000-4000-a000-000000000002';
update public.creator_profiles set page_status = 'archived'
  where user_id = 'c9000000-0000-4000-a000-000000000003';

-- Grant the admin fixture the admin role (handle_new_user already gave 'user').
insert into public.user_roles (user_id, role)
  values ('c9000000-0000-4000-a000-000000000005', 'admin')
  on conflict (user_id, role) do nothing;

-- Links (one visible + one hidden on the published page; one on each non-published page).
insert into public.links (id, profile_id, title, url, icon, is_visible, position)
select 'c9000000-0000-4000-b000-000000000001', cp.id, 'Pub Visible', 'https://example.com/pv', 'globe', true, 0
  from public.creator_profiles cp where cp.user_id = 'c9000000-0000-4000-a000-000000000001';
insert into public.links (id, profile_id, title, url, icon, is_visible, position)
select 'c9000000-0000-4000-b000-000000000002', cp.id, 'Pub Hidden', 'https://example.com/ph', 'globe', false, 1
  from public.creator_profiles cp where cp.user_id = 'c9000000-0000-4000-a000-000000000001';
insert into public.links (id, profile_id, title, url, icon, is_visible, position)
select 'c9000000-0000-4000-b000-000000000003', cp.id, 'Draft Link', 'https://example.com/dl', 'globe', true, 0
  from public.creator_profiles cp where cp.user_id = 'c9000000-0000-4000-a000-000000000002';
insert into public.links (id, profile_id, title, url, icon, is_visible, position)
select 'c9000000-0000-4000-b000-000000000004', cp.id, 'Arch Link', 'https://example.com/al', 'globe', true, 0
  from public.creator_profiles cp where cp.user_id = 'c9000000-0000-4000-a000-000000000003';

-- ---------------------------------------------------------------------------
-- 1/8 — Schema: columns, constraints, and column privileges (asserts 1, 22, 23)
-- ---------------------------------------------------------------------------
do $$
begin
  -- (1) new columns exist
  if to_regclass('public.creator_profiles') is null then
    raise exception 'creator_profiles missing';
  end if;
  perform 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'creator_profiles' and column_name = 'page_status';
  if not found then raise exception 'creator_profiles.page_status missing'; end if;
  perform 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'creator_profiles' and column_name = 'font_family';
  if not found then raise exception 'creator_profiles.font_family missing'; end if;
  perform 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'creator_profiles' and column_name = 'background_style';
  if not found then raise exception 'creator_profiles.background_style missing'; end if;
  perform 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'links' and column_name = 'kind';
  if not found then raise exception 'links.kind missing'; end if;
  perform 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'links' and column_name = 'is_visible';
  if not found then raise exception 'links.is_visible missing'; end if;

  -- (1) constraints exist
  perform 1 from pg_constraint where conname = 'creator_profiles_font_family_valid';
  if not found then raise exception 'font_family CHECK missing'; end if;
  perform 1 from pg_constraint where conname = 'creator_profiles_background_style_valid';
  if not found then raise exception 'background_style CHECK missing'; end if;
  perform 1 from pg_constraint where conname = 'links_kind_valid';
  if not found then raise exception 'links.kind CHECK missing'; end if;
  perform 1 from pg_constraint where conname = 'links_url_http_scheme';
  if not found then raise exception 'links_url_http_scheme CHECK missing'; end if;

  -- (23) required public columns are anon-selectable: the appearance columns the
  --      public page renders, plus page_status (the anon SELECT policy references
  --      it, so anon must hold column SELECT on it or every read fails 42501).
  if not has_column_privilege('anon', 'public.creator_profiles', 'font_family', 'select') then
    raise exception 'anon must be able to SELECT creator_profiles.font_family (public appearance)';
  end if;
  if not has_column_privilege('anon', 'public.creator_profiles', 'background_style', 'select') then
    raise exception 'anon must be able to SELECT creator_profiles.background_style (public appearance)';
  end if;
  if not has_column_privilege('anon', 'public.creator_profiles', 'page_status', 'select') then
    raise exception 'anon must be able to SELECT creator_profiles.page_status (its SELECT policy references it)';
  end if;

  -- (22) anon must NOT be able to read the ownership column — the auth UUID.
  --      (page_status is harmless: RLS returns only published rows to anon.)
  if has_column_privilege('anon', 'public.creator_profiles', 'user_id', 'select') then
    raise exception 'SECURITY: anon must NOT SELECT creator_profiles.user_id (auth UUID)';
  end if;

  raise notice 'creator_page_visibility (1/8) schema + column privileges OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 2/8 — Defaults: existing/seeded/signup rows published (asserts 2, 25, 26)
-- ---------------------------------------------------------------------------
do $$
declare
  v_null int;
  v_aurora public.creator_page_status;
  v_signup public.creator_page_status;
begin
  -- (2) no row has a null lifecycle
  select count(*) into v_null from public.creator_profiles where page_status is null;
  if v_null <> 0 then raise exception 'page_status must be NOT NULL for all rows (% nulls)', v_null; end if;

  -- (26) the ownerless aurora seed is published
  select page_status into v_aurora from public.creator_profiles where handle = 'aurora';
  if v_aurora is distinct from 'published' then
    raise exception 'aurora seed must default to published, got %', v_aurora;
  end if;

  -- (25) a signup-created creator (handle_new_user) defaults to published
  select page_status into v_signup from public.creator_profiles
    where user_id = 'c9000000-0000-4000-a000-000000000001';
  if v_signup is distinct from 'published' then
    raise exception 'signup-created creator must default to published, got %', v_signup;
  end if;

  raise notice 'creator_page_visibility (2/8) published defaults OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 3/8 — anon base-table creator_profiles visibility (asserts 3, 4, 5)
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  set local role anon;

  -- (3) published creator visible
  select count(*) into n from public.creator_profiles where handle = 'cpv_pub';
  if n <> 1 then raise exception 'anon must see published creator (saw % rows)', n; end if;

  -- (4) draft creator invisible
  select count(*) into n from public.creator_profiles where handle = 'cpv_draft';
  if n <> 0 then raise exception 'SECURITY: anon must NOT see draft creator (saw % rows)', n; end if;

  -- (5) archived creator invisible
  select count(*) into n from public.creator_profiles where handle = 'cpv_arch';
  if n <> 0 then raise exception 'SECURITY: anon must NOT see archived creator (saw % rows)', n; end if;

  reset role;
  raise notice 'creator_page_visibility (3/8) anon creator_profiles visibility OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 4/8 — public_creator_profiles view filtering + projection (asserts 6, 7, 24)
-- ---------------------------------------------------------------------------
do $$
declare n int; v_aurora_posts bigint;
begin
  set local role anon;

  -- (6) draft absent from the view
  select count(*) into n from public.public_creator_profiles where username = 'cpv_draft';
  if n <> 0 then raise exception 'SECURITY: draft must be absent from public_creator_profiles (saw %)', n; end if;

  -- (7) archived absent from the view
  select count(*) into n from public.public_creator_profiles where username = 'cpv_arch';
  if n <> 0 then raise exception 'SECURITY: archived must be absent from public_creator_profiles (saw %)', n; end if;

  -- (24) published rows still project with working counts (aurora has 3 published-agnostic
  --      link/post fixtures; assert the projection resolves and post_count is a real bigint).
  select count(*) into n from public.public_creator_profiles where username = 'cpv_pub';
  if n <> 1 then raise exception 'published creator must appear in the view (saw %)', n; end if;
  select post_count into v_aurora_posts from public.public_creator_profiles where username = 'aurora';
  if v_aurora_posts is null then raise exception 'view post_count projection broken (null for aurora)'; end if;

  reset role;
  raise notice 'creator_page_visibility (4/8) view filtering + projection OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 5/8 — owner reads own draft/archived + hidden links (asserts 8, 9, 17)
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  -- (8) draft owner reads own draft page
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c9000000-0000-4000-a000-000000000002', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.creator_profiles where handle = 'cpv_draft';
  if n <> 1 then raise exception 'owner must read own DRAFT page (saw %)', n; end if;
  -- (17) owner sees own (visible) link on the draft page
  select count(*) into n from public.links where id = 'c9000000-0000-4000-b000-000000000003';
  if n <> 1 then raise exception 'owner must see own link on own draft page (saw %)', n; end if;
  reset role;

  -- (9) archived owner reads own archived page + its link
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c9000000-0000-4000-a000-000000000003', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.creator_profiles where handle = 'cpv_arch';
  if n <> 1 then raise exception 'owner must read own ARCHIVED page (saw %)', n; end if;
  reset role;

  -- (17b) published owner sees own HIDDEN (is_visible=false) link
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c9000000-0000-4000-a000-000000000001', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.links where id = 'c9000000-0000-4000-b000-000000000002';
  if n <> 1 then raise exception 'owner must see own HIDDEN link (saw %)', n; end if;
  reset role;

  raise notice 'creator_page_visibility (5/8) owner reads own non-public content OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 6/8 — unrelated authenticated + admin visibility (asserts 10, 11, 12)
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  -- unrelated authenticated user
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c9000000-0000-4000-a000-000000000004', 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- (10) cannot read another's draft
  select count(*) into n from public.creator_profiles where handle = 'cpv_draft';
  if n <> 0 then raise exception 'SECURITY: unrelated user must NOT read another DRAFT (saw %)', n; end if;
  -- (11) cannot read another's archived
  select count(*) into n from public.creator_profiles where handle = 'cpv_arch';
  if n <> 0 then raise exception 'SECURITY: unrelated user must NOT read another ARCHIVED (saw %)', n; end if;
  -- still sees published
  select count(*) into n from public.creator_profiles where handle = 'cpv_pub';
  if n <> 1 then raise exception 'authenticated user must still read published pages (saw %)', n; end if;
  reset role;

  -- (12) admin reads every status
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c9000000-0000-4000-a000-000000000005', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.creator_profiles
    where handle in ('cpv_pub', 'cpv_draft', 'cpv_arch');
  if n <> 3 then raise exception 'admin must read published+draft+archived (expected 3, saw %)', n; end if;
  reset role;

  raise notice 'creator_page_visibility (6/8) unrelated-user + admin visibility OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 7/8 — anon link visibility inherits page + is_visible (asserts 13, 14, 15, 16)
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  set local role anon;

  -- (13) visible link on a published page is visible
  select count(*) into n from public.links where id = 'c9000000-0000-4000-b000-000000000001';
  if n <> 1 then raise exception 'anon must see visible link on published page (saw %)', n; end if;

  -- (14) hidden link on a published page is hidden
  select count(*) into n from public.links where id = 'c9000000-0000-4000-b000-000000000002';
  if n <> 0 then raise exception 'SECURITY: anon must NOT see hidden link on published page (saw %)', n; end if;

  -- (15) link on a draft page is hidden
  select count(*) into n from public.links where id = 'c9000000-0000-4000-b000-000000000003';
  if n <> 0 then raise exception 'SECURITY: anon must NOT see link on DRAFT page (saw %)', n; end if;

  -- (16) link on an archived page is hidden
  select count(*) into n from public.links where id = 'c9000000-0000-4000-b000-000000000004';
  if n <> 0 then raise exception 'SECURITY: anon must NOT see link on ARCHIVED page (saw %)', n; end if;

  reset role;
  raise notice 'creator_page_visibility (7/8) anon link inheritance OK.';
end $$;

-- ---------------------------------------------------------------------------
-- 8/8 — URL scheme-prefix guard + handle integrity (asserts 18, 19, 20, 21)
--
-- NOTE: links_url_http_scheme is a SCHEME-PREFIX guard, not full URL validation.
-- These checks assert only that non-http(s) schemes and plain non-URL text are
-- rejected, and that http/https-prefixed values (incl. the bare 'https://'
-- placeholder that link authoring depends on) are accepted. Host/path
-- well-formedness is an application-layer concern and is intentionally NOT
-- asserted here.
-- ---------------------------------------------------------------------------
do $$
declare
  v_pub_profile uuid;
  bad text;
  -- Non-http(s) schemes, protocol-relative, and plain non-URL text — all must be
  -- rejected by the scheme-prefix guard.
  bad_values text[] := array[
    'javascript:alert(1)',
    'data:text/html,x',
    'vbscript:msgbox',
    'ftp://example.com/x',
    '//example.com',
    'just some plain text'
  ];
  rejected boolean;
  v_new uuid;
begin
  select id into v_pub_profile from public.creator_profiles
    where user_id = 'c9000000-0000-4000-a000-000000000001';

  -- (18) each disallowed value (bad scheme / protocol-relative / non-URL text)
  --      is rejected by links_url_http_scheme
  foreach bad in array bad_values loop
    rejected := false;
    begin
      insert into public.links (profile_id, title, url, icon)
        values (v_pub_profile, 'bad', bad, 'globe');
    exception when check_violation then rejected := true;
    end;
    if not rejected then
      raise exception 'SECURITY: URL value "%" must be rejected by links_url_http_scheme', bad;
    end if;
  end loop;

  -- (19) http + https prefixed values are accepted
  insert into public.links (profile_id, title, url, icon)
    values (v_pub_profile, 'ok-http', 'http://example.com/ok', 'globe');
  insert into public.links (profile_id, title, url, icon)
    values (v_pub_profile, 'ok-https', 'https://example.com/ok', 'globe');
  delete from public.links where profile_id = v_pub_profile and title in ('ok-http', 'ok-https');

  -- (19b) the bare 'https://' placeholder is accepted — existing link authoring
  --       (cabana-store.addLink) inserts exactly this value for a new link, so
  --       the scheme-prefix guard must NOT reject it.
  rejected := false;
  begin
    insert into public.links (profile_id, title, url, icon)
      values (v_pub_profile, 'ok-placeholder', 'https://', 'globe');
  exception when check_violation then rejected := true;
  end;
  if rejected then
    raise exception 'REGRESSION: the ''https://'' placeholder must be accepted (link authoring depends on it)';
  end if;
  delete from public.links where profile_id = v_pub_profile and title = 'ok-placeholder';

  -- (20) reserved handle is rejected by validate_creator_handle
  rejected := false;
  begin
    insert into public.creator_profiles (user_id, handle, name)
      values (null, 'admin', 'Reserved');
  exception when check_violation then rejected := true;
  end;
  if not rejected then
    raise exception 'reserved handle "admin" must be rejected';
  end if;

  -- (21) duplicate handle is rejected (unique lower(handle) index)
  rejected := false;
  begin
    insert into public.creator_profiles (user_id, handle, name)
      values (null, 'cpv_pub', 'Dup')
      returning id into v_new;
  exception when unique_violation then rejected := true;
  end;
  if not rejected then
    if v_new is not null then delete from public.creator_profiles where id = v_new; end if;
    raise exception 'duplicate handle "cpv_pub" must be rejected';
  end if;

  raise notice 'creator_page_visibility (8/8) URL scheme + handle integrity OK.';
end $$;

-- ── End-of-run cleanup ──────────────────────────────────────────────────────
delete from auth.users where email like 'cpv_%@example.com';

select 'creator_page_visibility checks passed' as result;
