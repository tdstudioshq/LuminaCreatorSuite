-- ============================================================================
-- CABANA — post_media INSERT ownership (20260533) behavioral checks
-- ============================================================================
-- Proves the tightened WITH CHECK on "Owners manage own post media":
--   1. the owning creator CAN attach media to their OWN post (legit upload),
--   2. a DIFFERENT creator CANNOT attach media to that post (cross-post
--      injection blocked — 42501),
--   3. an owner cannot set storage_path outside their own folder (republication
--      blocked — 42501),
--   4. an ANONYMOUS insert fails,
--   5. existing authorized owner media READS still work (USING unchanged).
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in ('pmown_a@example.com', 'pmown_b@example.com');

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_profile_a uuid;
  v_post_a uuid;
  v_legit uuid;
  cnt int;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_a, 'pmown_a@example.com', '{"name":"OwnerA"}'::jsonb),
    (v_b, 'pmown_b@example.com', '{"name":"CreatorB"}'::jsonb);

  select id into v_profile_a from public.creator_profiles where user_id = v_a;

  -- --- A authors a public post ------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_a, 'A public', 'public', 'published', now())
    returning id into v_post_a;

  -- (1) Owner CAN attach media to own post with a well-formed path.
  insert into public.post_media (post_id, owner_user_id, kind, storage_path, position)
    values (v_post_a, v_a, 'image', v_a || '/' || v_post_a || '/legit.jpg', 0)
    returning id into v_legit;
  if v_legit is null then
    raise exception 'FAIL: owner could not attach media to own post';
  end if;

  -- (5) Owner READ of own media still works (USING unchanged).
  select count(*) into cnt from public.post_media where post_id = v_post_a;
  if cnt <> 1 then
    raise exception 'FAIL: owner sees % own media rows (expected 1)', cnt;
  end if;

  -- (3) Owner CANNOT set storage_path outside their own folder.
  denied := false;
  begin
    insert into public.post_media (post_id, owner_user_id, kind, storage_path, position)
      values (v_post_a, v_a, 'image', v_b || '/' || v_post_a || '/wrongfolder.jpg', 1);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: owner attached media with a foreign storage_path prefix';
  end if;

  reset role;

  -- --- (2) Different creator B CANNOT attach media to A's post ----------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  denied := false;
  begin
    insert into public.post_media (post_id, owner_user_id, kind, storage_path, position)
      values (v_post_a, v_b, 'image', v_b || '/' || v_post_a || '/injected.jpg', 2);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: cross-post injection succeeded (B attached media to A''s post)';
  end if;

  -- B also cannot republish a victim-folder object onto A's post.
  denied := false;
  begin
    insert into public.post_media (post_id, owner_user_id, kind, storage_path, position)
      values (v_post_a, v_b, 'image', v_a || '/' || v_post_a || '/victim.jpg', 3);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: republication succeeded (B set a victim storage path on A''s post)';
  end if;

  reset role;

  -- --- (4) Anonymous insert fails --------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('role', 'anon')::text, true);
  set local role anon;
  denied := false;
  begin
    insert into public.post_media (post_id, owner_user_id, kind, storage_path, position)
      values (v_post_a, v_a, 'image', v_a || '/' || v_post_a || '/anon.jpg', 4);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: anonymous insert into post_media succeeded';
  end if;
  reset role;

  -- --- Post A still carries exactly its one legitimate media row -------------
  select count(*) into cnt from public.post_media where post_id = v_post_a;
  if cnt <> 1 then
    raise exception 'FAIL: post A has % media rows after attacks (expected 1)', cnt;
  end if;

  raise notice 'post_media ownership checks passed';

  delete from auth.users where id in (v_a, v_b);
end $$;
