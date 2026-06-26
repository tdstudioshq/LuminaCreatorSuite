-- ============================================================================
-- CABANA — Phase 3.2 behavioral checks: comments, likes, saves
-- ============================================================================
-- Proves comment/like/save RLS, like & save uniqueness, viewability gating,
-- block-aware engagement, creator comment hiding, soft-delete, anonymous
-- visible-comment reads on public posts, and anonymous write denial.
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'eng_creator@example.com',
  'eng_follower@example.com',
  'eng_stranger@example.com'
);

do $$
declare
  v_creator_id uuid := gen_random_uuid();
  v_follower_id uuid := gen_random_uuid();
  v_stranger_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_handle text;
  v_pub uuid;
  v_fol uuid;
  v_c_follower uuid;
  v_c_stranger uuid;
  cnt int;
  denied boolean;
  st record;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_creator_id, 'eng_creator@example.com', '{"name":"Creator"}'::jsonb),
    (v_follower_id, 'eng_follower@example.com', '{"name":"Follower","account_type":"member"}'::jsonb),
    (v_stranger_id, 'eng_stranger@example.com', '{"name":"Stranger","account_type":"member"}'::jsonb);

  select id, handle into v_profile_id, v_handle
  from public.creator_profiles where user_id = v_creator_id;

  -- Creator authors a public and a followers-only published post.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_id, 'public', 'public', 'published', now()) returning id into v_pub;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_id, 'followers', 'followers', 'published', now()) returning id into v_fol;
  reset role;

  -- -------------------------------------------------------------------------
  -- Follower: follows creator, comments, likes, saves; uniqueness enforced.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_follower_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.relationship_follow_creator(v_handle);

  insert into public.post_comments (post_id, author_id, body)
    values (v_pub, v_follower_id, 'nice public post') returning id into v_c_follower;
  insert into public.post_comments (post_id, author_id, body)
    values (v_fol, v_follower_id, 'followers comment');

  -- Cannot comment as someone else.
  denied := false;
  begin
    insert into public.post_comments (post_id, author_id, body)
      values (v_pub, v_creator_id, 'spoofed');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'comment author spoofing not denied'; end if;

  -- Likes + uniqueness.
  insert into public.post_likes (post_id, user_id) values (v_pub, v_follower_id);
  denied := false;
  begin
    insert into public.post_likes (post_id, user_id) values (v_pub, v_follower_id);
  exception when unique_violation then denied := true; end;
  if not denied then raise exception 'like uniqueness not enforced'; end if;

  -- Saves + uniqueness.
  insert into public.post_saves (post_id, user_id) values (v_pub, v_follower_id);
  denied := false;
  begin
    insert into public.post_saves (post_id, user_id) values (v_pub, v_follower_id);
  exception when unique_violation then denied := true; end;
  if not denied then raise exception 'save uniqueness not enforced'; end if;

  -- Engagement state RPC reflects the follower's own actions.
  select * into st from public.post_engagement_state(v_pub);
  if st.like_count <> 1 or not st.liked_by_me or not st.saved_by_me or not st.can_engage then
    raise exception 'engagement state wrong for follower: %', st;
  end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- Stranger (not following): public ok, followers denied.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.post_comments (post_id, author_id, body)
    values (v_pub, v_stranger_id, 'hi from stranger') returning id into v_c_stranger;

  denied := false;
  begin
    insert into public.post_comments (post_id, author_id, body)
      values (v_fol, v_stranger_id, 'should fail');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'stranger commented on non-viewable followers post'; end if;

  denied := false;
  begin
    insert into public.post_likes (post_id, user_id) values (v_fol, v_stranger_id);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'stranger liked non-viewable followers post'; end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- Block enforcement: creator blocks stranger -> no engagement either way.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.blocks (blocker_id, blocked_user_id) values (v_creator_id, v_stranger_id);
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin
    insert into public.post_comments (post_id, author_id, body)
      values (v_pub, v_stranger_id, 'after block');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'blocked user still commented'; end if;
  denied := false;
  begin
    insert into public.post_likes (post_id, user_id) values (v_pub, v_stranger_id);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'blocked user still liked'; end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- Creator hides the follower's comment on the public post.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.post_comments set status = 'hidden' where id = v_c_follower;
  get diagnostics cnt = row_count;
  if cnt <> 1 then raise exception 'creator could not hide comment on own post'; end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- Anonymous: read visible comments on public post; no access to followers
  -- post comments; cannot write.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;

  -- Only the stranger's still-visible comment remains on the public post.
  select count(*) into cnt from public.post_comments_list(v_pub);
  if cnt <> 1 then raise exception 'anon sees % visible comments on public post (expected 1)', cnt; end if;

  -- Followers post comments are not viewable to anon.
  denied := false;
  begin
    perform 1 from public.post_comments_list(v_fol);
  exception when no_data_found then denied := true; end;
  if not denied then raise exception 'anon read comments on non-viewable followers post'; end if;

  -- Anonymous writes are denied.
  denied := false;
  begin
    insert into public.post_comments (post_id, author_id, body)
      values (v_pub, v_stranger_id, 'anon');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon inserted a comment'; end if;

  denied := false;
  begin
    perform 1 from public.post_likes;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon read post_likes base table'; end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- Author edit + soft delete on their followers-post comment.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_follower_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.post_comments set body = 'edited' where author_id = v_follower_id and post_id = v_fol;
  update public.post_comments set status = 'deleted' where author_id = v_follower_id and post_id = v_fol;
  select count(*) into cnt from public.post_comments_list(v_fol);
  if cnt <> 0 then raise exception 'soft-deleted comment still visible on followers post'; end if;
  reset role;

  delete from auth.users where id in (v_creator_id, v_follower_id, v_stranger_id);
  raise notice 'Phase 3.2 engagement checks passed.';
end $$;
