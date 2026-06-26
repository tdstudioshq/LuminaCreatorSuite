-- ============================================================================
-- CABANA — Phase 3 behavioral checks: posts, feed RPCs, media privacy
-- ============================================================================
-- Proves creator-owned post RLS, anonymous public reads, follower-gated reads,
-- locked followers stubs, that subscribers/draft posts never leak to
-- non-creators, can_view_post authorization, owner-only post_media, and that
-- the post-media bucket is private. Self-cleaning; any failed assertion exits
-- non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'posts_creator@example.com',
  'posts_follower@example.com',
  'posts_stranger@example.com'
);

do $$
declare
  v_creator_id uuid := gen_random_uuid();
  v_follower_id uuid := gen_random_uuid();
  v_stranger_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_handle text;
  v_pub_post uuid;
  v_fol_post uuid;
  v_draft_post uuid;
  v_sub_post uuid;
  cnt int;
  b boolean;
  denied boolean;
  is_public boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_creator_id, 'posts_creator@example.com', '{"name":"Creator"}'::jsonb),
    (v_follower_id, 'posts_follower@example.com', '{"name":"Follower","account_type":"member"}'::jsonb),
    (v_stranger_id, 'posts_stranger@example.com', '{"name":"Stranger","account_type":"member"}'::jsonb);

  select id, handle into v_profile_id, v_handle
  from public.creator_profiles where user_id = v_creator_id;

  -- ---------------------------------------------------------------------------
  -- Creator authors posts (public published w/ media, followers published,
  -- draft, subscribers published) and can read all of them.
  -- ---------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_id, 'public hello', 'public', 'published', now()) returning id into v_pub_post;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_id, 'followers only', 'followers', 'published', now()) returning id into v_fol_post;
  insert into public.posts (creator_profile_id, caption, visibility, status)
    values (v_profile_id, 'a draft', 'public', 'draft') returning id into v_draft_post;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_id, 'subs only', 'subscribers', 'published', now()) returning id into v_sub_post;

  insert into public.post_media (post_id, owner_user_id, kind, storage_path, position)
    values (v_pub_post, v_creator_id, 'image', v_creator_id || '/' || v_pub_post || '/a.jpg', 0);

  select count(*) into cnt from public.posts;
  if cnt <> 4 then
    raise exception 'creator sees % own posts (expected 4)', cnt;
  end if;

  -- Owner can view every own post regardless of status/visibility.
  if not (public.can_view_post(v_pub_post) and public.can_view_post(v_fol_post)
          and public.can_view_post(v_draft_post) and public.can_view_post(v_sub_post)) then
    raise exception 'creator can_view_post denied own content';
  end if;
  reset role;

  -- ---------------------------------------------------------------------------
  -- Anonymous viewer (clear the JWT claims so auth.uid() is null).
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;

  -- Base table: only the published public post is selectable.
  select count(*) into cnt from public.posts;
  if cnt <> 1 then
    raise exception 'anon sees % posts on base table (expected 1 public)', cnt;
  end if;

  -- Feed RPC: public (unlocked) + followers (locked stub); draft/subs excluded.
  select count(*) into cnt from public.feed_creator_posts(v_handle);
  if cnt <> 2 then
    raise exception 'anon feed returned % rows (expected 2)', cnt;
  end if;
  select locked, caption = '', coalesce(jsonb_array_length(media), 0) = 0
    into b, denied, is_public
  from public.feed_creator_posts(v_handle) where visibility = 'followers';
  if not (b and denied and is_public) then
    raise exception 'anon followers row is not a blanked locked stub';
  end if;
  select coalesce(jsonb_array_length(media), 0) into cnt
  from public.feed_creator_posts(v_handle) where visibility = 'public';
  if cnt <> 1 then
    raise exception 'public post media count = % (expected 1)', cnt;
  end if;

  -- can_view_post: public yes; everything restricted no.
  if not public.can_view_post(v_pub_post) then
    raise exception 'anon cannot view public post';
  end if;
  if public.can_view_post(v_fol_post) or public.can_view_post(v_draft_post)
     or public.can_view_post(v_sub_post) then
    raise exception 'anon can_view_post granted restricted content';
  end if;

  -- Home feed and post_media are off-limits to anon.
  denied := false;
  begin perform 1 from public.feed_home_posts(); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon executed feed_home_posts'; end if;

  denied := false;
  begin perform 1 from public.post_media; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon read post_media base table'; end if;
  reset role;

  -- ---------------------------------------------------------------------------
  -- Stranger (authenticated, not following).
  -- ---------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select count(*) into cnt from public.feed_creator_posts(v_handle);
  if cnt <> 2 then
    raise exception 'stranger feed returned % rows (expected 2)', cnt;
  end if;
  select locked into b from public.feed_creator_posts(v_handle) where visibility = 'followers';
  if not b then raise exception 'stranger sees followers post unlocked'; end if;

  if public.can_view_post(v_fol_post) then
    raise exception 'stranger can_view_post granted followers post';
  end if;

  -- Not following anyone → empty home feed; cannot read creator media rows.
  select count(*) into cnt from public.feed_home_posts();
  if cnt <> 0 then raise exception 'stranger home feed returned % rows (expected 0)', cnt; end if;
  select count(*) into cnt from public.post_media;
  if cnt <> 0 then raise exception 'stranger read % post_media rows (expected 0)', cnt; end if;
  reset role;

  -- ---------------------------------------------------------------------------
  -- Follower (authenticated, follows the creator).
  -- ---------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_follower_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  perform public.relationship_follow_creator(v_handle);

  -- Both public and followers posts are now unlocked.
  select count(*) into cnt from public.feed_creator_posts(v_handle) where not locked;
  if cnt <> 2 then
    raise exception 'follower sees % unlocked posts (expected 2)', cnt;
  end if;
  if not public.can_view_post(v_fol_post) then
    raise exception 'follower can_view_post denied followers post';
  end if;

  -- Home feed surfaces the followed creator's published public + followers posts.
  select count(*) into cnt from public.feed_home_posts();
  if cnt <> 2 then
    raise exception 'follower home feed returned % rows (expected 2)', cnt;
  end if;
  -- Subscribers/draft posts never appear.
  select count(*) into cnt from public.feed_home_posts()
  where post_id in (v_sub_post, v_draft_post);
  if cnt <> 0 then
    raise exception 'follower home feed leaked draft/subscriber posts';
  end if;

  -- Even a follower cannot read media rows directly (signed-URL path only).
  select count(*) into cnt from public.post_media;
  if cnt <> 0 then raise exception 'follower read % post_media rows (expected 0)', cnt; end if;
  reset role;

  -- ---------------------------------------------------------------------------
  -- The post-media bucket must be private.
  -- ---------------------------------------------------------------------------
  select public into b from storage.buckets where id = 'post-media';
  if b is distinct from false then
    raise exception 'post-media bucket is not private';
  end if;

  delete from auth.users where id in (v_creator_id, v_follower_id, v_stranger_id);
  raise notice 'Phase 3 posts & feed checks passed.';
end $$;
