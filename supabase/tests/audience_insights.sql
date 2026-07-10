-- ============================================================================
-- CABANA — Phase 11C behavioral checks: creator_audience_insights RPC
-- ============================================================================
-- Proves the audience-insights RPC returns the caller's OWN audience only:
-- correct follower / engaged-follower counts (count-only — no engagement
-- identities in the payload), named top supporters ranked by creator-net with
-- correct per-source cents, creator isolation, and denial for anonymous
-- callers and non-creator members. Self-cleaning; any failed assertion exits
-- non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'aud_creator_a@example.com',
  'aud_creator_b@example.com',
  'aud_fan_one@example.com',
  'aud_fan_two@example.com'
);

do $$
declare
  v_creator_a uuid := gen_random_uuid();
  v_creator_b uuid := gen_random_uuid();
  v_fan1 uuid := gen_random_uuid();
  v_fan2 uuid := gen_random_uuid();
  v_profile_a uuid;
  v_handle_a text;
  v_post uuid;
  v_fan1_username text;
  v_fan2_username text;
  res jsonb;
  sup jsonb;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_creator_a, 'aud_creator_a@example.com', '{"name":"Aud Creator A"}'::jsonb),
    (v_creator_b, 'aud_creator_b@example.com', '{"name":"Aud Creator B"}'::jsonb),
    (v_fan1, 'aud_fan_one@example.com', '{"name":"Aud Fan One","account_type":"member"}'::jsonb),
    (v_fan2, 'aud_fan_two@example.com', '{"name":"Aud Fan Two","account_type":"member"}'::jsonb);

  select id, handle into v_profile_a, v_handle_a
    from public.creator_profiles where user_id = v_creator_a;
  select username into v_fan1_username from public.member_profiles where user_id = v_fan1;
  select username into v_fan2_username from public.member_profiles where user_id = v_fan2;

  -- Creator A publishes a public post and a priced unlockable post.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_a, 'aud public', 'public', 'published', now());
  insert into public.posts
      (creator_profile_id, caption, visibility, status, published_at, price_cents, currency)
    values (v_profile_a, 'aud priced', 'purchase', 'published', now(), 500, 'USD')
    returning id into v_post;
  reset role;

  -- Fan 1: follows, likes the public post (engagement), tips 1000c
  -- (net = 1000 - 100 - 30 = 870).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_fan1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.relationship_follow_creator(v_handle_a);
  insert into public.post_likes (post_id, user_id)
    select p.id, v_fan1 from public.posts p
    where p.creator_profile_id = v_profile_a and p.visibility = 'public';
  perform public.create_mock_tip(v_handle_a, 1000, 'great work');
  reset role;

  -- Fan 2: follows but never engages; buys the priced post for 500c
  -- (net = 500 - 50 - 15 = 435).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_fan2::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.relationship_follow_creator(v_handle_a);
  perform public.create_mock_purchase(v_post);
  reset role;

  -- -------------------------------------------------------------------------
  -- Creator A: counts, ranking, per-source cents, identity shape.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.creator_audience_insights();

  if (res->>'follower_count')::bigint <> 2 then
    raise exception 'expected follower_count 2, got %', res->>'follower_count';
  end if;
  if (res->>'engaged_followers_in_window')::bigint <> 1 then
    raise exception 'expected 1 engaged follower in window, got %',
      res->>'engaged_followers_in_window';
  end if;
  if (res->>'active_followers_7d')::bigint <> 1
     or (res->>'active_followers_30d')::bigint <> 1
     or (res->>'active_followers_90d')::bigint <> 1 then
    raise exception 'expected 1 active follower in every recency bucket: %', res;
  end if;

  if jsonb_array_length(res->'top_supporters') <> 2 then
    raise exception 'expected 2 top supporters, got %', res->'top_supporters';
  end if;

  -- Rank 1: fan1 (tip net 870) — named with the member username, tip-sourced.
  sup := res->'top_supporters'->0;
  if sup->>'username' is distinct from v_fan1_username then
    raise exception 'expected top supporter %, got %', v_fan1_username, sup->>'username';
  end if;
  if (sup->>'total_net_cents')::integer <> 870
     or (sup->>'tip_cents')::integer <> 870 then
    raise exception 'expected fan1 tip net 870, got %', sup;
  end if;
  if (sup->>'is_follower')::boolean is distinct from true then
    raise exception 'expected fan1 flagged as follower';
  end if;

  -- Rank 2: fan2 (purchase net 435), purchase-sourced.
  sup := res->'top_supporters'->1;
  if sup->>'username' is distinct from v_fan2_username then
    raise exception 'expected second supporter %, got %', v_fan2_username, sup->>'username';
  end if;
  if (sup->>'total_net_cents')::integer <> 435
     or (sup->>'purchase_cents')::integer <> 435 then
    raise exception 'expected fan2 purchase net 435, got %', sup;
  end if;

  -- Count-only privacy: the payload must never carry engagement identities —
  -- the only identity-bearing key is top_supporters.
  if exists (
    select 1 from jsonb_object_keys(res) k
    where k not in (
      'follower_count', 'engaged_followers_in_window', 'window_days',
      'active_followers_7d', 'active_followers_30d', 'active_followers_90d',
      'top_supporters'
    )
  ) then
    raise exception 'unexpected keys in audience insights payload: %', res;
  end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- Creator B is isolated: zero followers, zero supporters.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.creator_audience_insights();
  if (res->>'follower_count')::bigint <> 0
     or jsonb_array_length(res->'top_supporters') <> 0 then
    raise exception 'creator B leaked creator A audience data: %', res;
  end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- A non-creator member is refused.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_fan1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin
    perform public.creator_audience_insights();
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'member executed creator_audience_insights'; end if;
  reset role;

  -- -------------------------------------------------------------------------
  -- Anonymous callers are denied outright.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin
    perform public.creator_audience_insights();
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'anon executed creator_audience_insights'; end if;
  reset role;

  delete from auth.users where id in (v_creator_a, v_creator_b, v_fan1, v_fan2);
  raise notice 'Phase 11C audience insights checks passed.';
end $$;
