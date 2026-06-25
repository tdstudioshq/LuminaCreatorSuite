-- ============================================================================
-- CABANA — Phase 2C behavioral checks: follows, blocks, and public views
-- ============================================================================
-- Proves uniqueness, owner-scoped RLS, creator follower visibility, anonymous
-- denial on base tables, member username provisioning, and ID-free public
-- profile views. Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'social_follower@example.com',
  'social_other@example.com',
  'social_creator@example.com'
);

do $$
declare
  v_follower_id uuid := gen_random_uuid();
  v_other_id uuid := gen_random_uuid();
  v_creator_id uuid := gen_random_uuid();
  v_creator_profile_id uuid;
  v_creator_username text;
  v_follower_username text;
  cnt int;
  duplicate_denied boolean := false;
  rls_denied boolean := false;
  anon_denied boolean := false;
  unsafe_columns int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (
      v_follower_id,
      'social_follower@example.com',
      '{"name":"Follower","account_type":"member"}'::jsonb
    ),
    (
      v_other_id,
      'social_other@example.com',
      '{"name":"Other","account_type":"member"}'::jsonb
    ),
    (
      v_creator_id,
      'social_creator@example.com',
      '{"name":"Creator"}'::jsonb
    );

  select id, handle
    into v_creator_profile_id, v_creator_username
  from public.creator_profiles
  where user_id = v_creator_id;

  select username into v_follower_username
  from public.member_profiles
  where user_id = v_follower_id;

  if v_follower_username is null or v_follower_username = '' then
    raise exception 'member username was not provisioned';
  end if;

  -- -------------------------------------------------------------------------
  -- Follows: owner insert/delete, uniqueness, isolation, creator visibility.
  -- -------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_follower_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  insert into public.follows (follower_id, following_creator_id)
    values (v_follower_id, v_creator_profile_id);

  begin
    insert into public.follows (follower_id, following_creator_id)
      values (v_follower_id, v_creator_profile_id);
  exception when unique_violation then
    duplicate_denied := true;
  end;
  if not duplicate_denied then
    raise exception 'follow uniqueness constraint did not reject duplicate';
  end if;

  begin
    insert into public.follows (follower_id, following_creator_id)
      values (v_other_id, v_creator_profile_id);
  exception when insufficient_privilege then
    rls_denied := true;
  end;
  if not rls_denied then
    raise exception 'follow RLS allowed inserting another user''s relationship';
  end if;

  select count(*) into cnt from public.follows;
  if cnt <> 1 then
    raise exception 'follower sees % follow rows (expected 1)', cnt;
  end if;
  reset role;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select count(*) into cnt from public.follows;
  if cnt <> 0 then
    raise exception 'unrelated user sees % follow rows (expected 0)', cnt;
  end if;
  reset role;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select count(*) into cnt
  from public.follows
  where following_creator_id = v_creator_profile_id;
  if cnt <> 1 then
    raise exception 'creator sees % follower rows (expected 1)', cnt;
  end if;

  rls_denied := false;
  begin
    insert into public.follows (follower_id, following_creator_id)
      values (v_creator_id, v_creator_profile_id);
  exception when insufficient_privilege then
    rls_denied := true;
  end;
  if not rls_denied then
    raise exception 'self-follow was not rejected';
  end if;
  reset role;

  set local role anon;
  begin
    perform 1 from public.follows;
  exception when insufficient_privilege then
    anon_denied := true;
  end;
  reset role;
  if not anon_denied then
    raise exception 'anon can read follows base table';
  end if;

  -- Public aggregate view works for anon and exposes no internal identifiers.
  set local role anon;
  select follower_count into cnt
  from public.public_creator_profiles
  where username = v_creator_username;
  reset role;
  if cnt <> 1 then
    raise exception 'public creator follower_count = % (expected 1)', cnt;
  end if;

  select count(*) into unsafe_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('public_creator_profiles', 'public_member_profiles')
    and column_name in ('id', 'user_id', 'email', 'profile_id', 'creator_profile_id');
  if unsafe_columns <> 0 then
    raise exception 'public profile views expose % unsafe identifier columns', unsafe_columns;
  end if;

  set local role anon;
  select count(*) into cnt
  from public.public_member_profiles
  where username = v_follower_username and display_name = 'Follower';
  reset role;
  if cnt <> 1 then
    raise exception 'public member view did not expose safe member identity';
  end if;

  -- -------------------------------------------------------------------------
  -- Blocks: only the blocker can read/insert/delete; uniqueness enforced.
  -- -------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_follower_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  insert into public.blocks (blocker_id, blocked_user_id, reason)
    values (v_follower_id, v_other_id, 'spam');

  duplicate_denied := false;
  begin
    insert into public.blocks (blocker_id, blocked_user_id)
      values (v_follower_id, v_other_id);
  exception when unique_violation then
    duplicate_denied := true;
  end;
  if not duplicate_denied then
    raise exception 'block uniqueness constraint did not reject duplicate';
  end if;

  rls_denied := false;
  begin
    insert into public.blocks (blocker_id, blocked_user_id)
      values (v_other_id, v_creator_id);
  exception when insufficient_privilege then
    rls_denied := true;
  end;
  if not rls_denied then
    raise exception 'block RLS allowed inserting another user''s relationship';
  end if;

  select count(*) into cnt from public.blocks;
  if cnt <> 1 then
    raise exception 'blocker sees % block rows (expected 1)', cnt;
  end if;
  reset role;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select count(*) into cnt from public.blocks;
  if cnt <> 0 then
    raise exception 'blocked user sees % block rows (expected 0)', cnt;
  end if;
  delete from public.blocks where blocker_id = v_follower_id;
  get diagnostics cnt = row_count;
  if cnt <> 0 then
    raise exception 'blocked user deleted another user''s block';
  end if;
  reset role;

  anon_denied := false;
  set local role anon;
  begin
    perform 1 from public.blocks;
  exception when insufficient_privilege then
    anon_denied := true;
  end;
  reset role;
  if not anon_denied then
    raise exception 'anon can read blocks base table';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_follower_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  delete from public.blocks
  where blocker_id = v_follower_id and blocked_user_id = v_other_id;
  get diagnostics cnt = row_count;
  if cnt <> 1 then
    raise exception 'blocker could not delete own block';
  end if;

  delete from public.follows
  where follower_id = v_follower_id and following_creator_id = v_creator_profile_id;

  -- Protected action RPCs derive the actor from auth.uid() and return no IDs.
  perform public.relationship_follow_creator(v_creator_username);
  select rs.following into rls_denied
  from public.relationship_state(v_creator_username) rs;
  if not rls_denied then
    raise exception 'relationship RPC did not persist follow state';
  end if;
  perform public.relationship_unfollow_creator(v_creator_username);
  select rs.following into rls_denied
  from public.relationship_state(v_creator_username) rs;
  if rls_denied then
    raise exception 'relationship RPC did not remove follow state';
  end if;
  reset role;

  anon_denied := false;
  set local role anon;
  begin
    perform public.relationship_state(v_creator_username);
  exception when insufficient_privilege then
    anon_denied := true;
  end;
  reset role;
  if not anon_denied then
    raise exception 'anon can execute protected relationship RPC';
  end if;

  delete from auth.users where id in (v_follower_id, v_other_id, v_creator_id);
  raise notice 'Phase 2C social relationship checks passed.';
end $$;
