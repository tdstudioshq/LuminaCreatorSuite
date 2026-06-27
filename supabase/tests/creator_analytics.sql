-- ============================================================================
-- CABANA — Phase 11B behavioral checks: creator_content_analytics RPC
-- ============================================================================
-- Proves the analytics RPC returns the caller's OWN posts with correct
-- like / comment / save aggregate counts, isolates one creator from another,
-- counts only visible comments, and is denied to anonymous callers.
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'ana_creator_a@example.com',
  'ana_creator_b@example.com',
  'ana_fan@example.com'
);

do $$
declare
  v_creator_a uuid := gen_random_uuid();
  v_creator_b uuid := gen_random_uuid();
  v_fan uuid := gen_random_uuid();
  v_profile_a uuid;
  v_profile_b uuid;
  v_post_a1 uuid;
  v_post_a2 uuid;
  v_post_b1 uuid;
  v_comment uuid;
  r record;
  cnt int;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_creator_a, 'ana_creator_a@example.com', '{"name":"Creator A"}'::jsonb),
    (v_creator_b, 'ana_creator_b@example.com', '{"name":"Creator B"}'::jsonb),
    (v_fan, 'ana_fan@example.com', '{"name":"Fan","account_type":"member"}'::jsonb);

  select id into v_profile_a from public.creator_profiles where user_id = v_creator_a;
  select id into v_profile_b from public.creator_profiles where user_id = v_creator_b;

  -- Creator A: two published public posts. Creator B: one.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_a, 'a1', 'public', 'published', now()) returning id into v_post_a1;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_a, 'a2', 'public', 'published', now()) returning id into v_post_a2;
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_b, 'b1', 'public', 'published', now()) returning id into v_post_b1;
  reset role;

  -- Fan engages with post_a1: 1 like, 1 save, 1 visible comment + 1 hidden comment.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_fan::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.post_likes (post_id, user_id) values (v_post_a1, v_fan);
  insert into public.post_saves (post_id, user_id) values (v_post_a1, v_fan);
  insert into public.post_comments (post_id, author_id, body)
    values (v_post_a1, v_fan, 'nice') returning id into v_comment;
  insert into public.post_comments (post_id, author_id, body, status)
    values (v_post_a1, v_fan, 'hidden one', 'hidden');
  reset role;

  -- -------------------------------------------------------------------------
  -- Creator A sees both their posts with correct counts; only visible comments.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into cnt from public.creator_content_analytics();
  if cnt <> 2 then raise exception 'creator A expected 2 own posts, got %', cnt; end if;

  select * into r from public.creator_content_analytics() where post_id = v_post_a1;
  if r.like_count <> 1 then raise exception 'expected like_count 1, got %', r.like_count; end if;
  if r.save_count <> 1 then raise exception 'expected save_count 1, got %', r.save_count; end if;
  if r.comment_count <> 1 then
    raise exception 'expected comment_count 1 (visible only), got %', r.comment_count;
  end if;

  select * into r from public.creator_content_analytics() where post_id = v_post_a2;
  if r.like_count <> 0 or r.save_count <> 0 or r.comment_count <> 0 then
    raise exception 'expected zero engagement on a2';
  end if;

  -- Creator A must NOT see creator B's post.
  perform 1 from public.creator_content_analytics() where post_id = v_post_b1;
  if found then raise exception 'creator A leaked creator B post via analytics RPC'; end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- Creator B sees only their own one post.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.creator_content_analytics();
  if cnt <> 1 then raise exception 'creator B expected 1 own post, got %', cnt; end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- Anonymous callers are denied.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin
    perform 1 from public.creator_content_analytics();
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'anon executed creator_content_analytics'; end if;
  reset role;

  delete from auth.users where id in (v_creator_a, v_creator_b, v_fan);
  raise notice 'Phase 11B creator analytics checks passed.';
end $$;
