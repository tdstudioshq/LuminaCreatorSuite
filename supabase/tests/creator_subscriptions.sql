-- ============================================================================
-- CABANA — Phase 4 behavioral checks: creator subscriptions & entitlement
-- ============================================================================
-- Proves tier RLS, demo subscribe/cancel via RPC, the unique active pair,
-- subscriber entitlement on `subscribers` posts (can_view_post + feed locking),
-- self-subscribe rejection, direct-write denial, creator subscriber visibility,
-- and anonymous denial. Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'sub_creator@example.com',
  'sub_member@example.com',
  'sub_stranger@example.com'
);

do $$
declare
  v_creator_id uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_stranger_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_handle text;
  v_tier_id uuid;
  v_sub_post uuid;
  cnt int;
  denied boolean;
  st record;
  v_status public.creator_subscription_status;
  v_price int;
  v_mockok boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_creator_id, 'sub_creator@example.com', '{"name":"Creator"}'::jsonb),
    (v_member_id, 'sub_member@example.com', '{"name":"Member","account_type":"member"}'::jsonb),
    (v_stranger_id, 'sub_stranger@example.com', '{"name":"Stranger","account_type":"member"}'::jsonb);

  select id, handle into v_profile_id, v_handle
  from public.creator_profiles where user_id = v_creator_id;

  -- Creator: define a tier and author a subscribers-only published post.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.creator_subscription_tiers (creator_profile_id, name, price_cents, currency)
    values (v_profile_id, 'Fan', 500, 'USD') returning id into v_tier_id;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_id, 'subs only', 'subscribers', 'published', now()) returning id into v_sub_post;

  -- Self-subscribe is rejected.
  denied := false;
  begin
    perform public.subscribe_to_creator(v_handle, v_tier_id);
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'creator self-subscribe was not rejected'; end if;
  reset role;

  -- Stranger (not subscribed): subscriber post is locked / not viewable.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.can_view_post(v_sub_post) then
    raise exception 'non-subscriber can view subscriber post'; end if;
  select locked into denied from public.feed_creator_posts(v_handle) where visibility = 'subscribers';
  if not denied then raise exception 'subscriber post not locked for non-subscriber'; end if;
  reset role;

  -- Member subscribes (demo) and unlocks the subscriber post.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.subscribe_to_creator(v_handle, v_tier_id);

  if not public.is_active_subscriber(v_profile_id) then
    raise exception 'subscribe did not create an active subscription'; end if;
  if not public.can_view_post(v_sub_post) then
    raise exception 'subscriber cannot view subscriber post'; end if;
  select locked into denied from public.feed_creator_posts(v_handle) where visibility = 'subscribers';
  if denied then raise exception 'subscriber post still locked for subscriber'; end if;

  -- The subscription carries the tier price (demo, mock ref) and is unique.
  select status, price_cents, (mock_provider_reference like 'mock_%')
    into v_status, v_price, v_mockok
  from public.creator_subscriptions where member_user_id = v_member_id;
  if v_status <> 'active' or v_price <> 500 or not coalesce(v_mockok, false) then
    raise exception 'subscription row not demo-correct: status=% price=% mockok=%',
      v_status, v_price, v_mockok; end if;

  -- Re-subscribe is idempotent (unique live pair → still one row).
  perform public.subscribe_to_creator(v_handle, v_tier_id);
  select count(*) into cnt from public.creator_subscriptions where member_user_id = v_member_id;
  if cnt <> 1 then raise exception 'duplicate live subscription rows: %', cnt; end if;

  -- Direct writes are denied (writes only through the RPCs).
  denied := false;
  begin
    insert into public.creator_subscriptions (member_user_id, creator_profile_id, status)
      values (v_member_id, v_profile_id, 'active');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'direct subscription insert was allowed'; end if;

  -- State RPC reflects the active subscription.
  select * into st from public.creator_subscription_state(v_handle);
  if not st.subscribed or st.tier_name <> 'Fan' then
    raise exception 'subscription_state wrong: %', st; end if;
  reset role;

  -- Creator sees exactly one active subscriber.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.creator_subscribers_list();
  if cnt <> 1 then raise exception 'creator sees % subscribers (expected 1)', cnt; end if;
  reset role;

  -- Member cancels → entitlement revoked, post re-locks.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cancel_creator_subscription(v_handle);
  if public.is_active_subscriber(v_profile_id) then
    raise exception 'cancel did not revoke entitlement'; end if;
  if public.can_view_post(v_sub_post) then
    raise exception 'canceled member still views subscriber post'; end if;
  reset role;

  -- Anonymous: not subscribed; can read active tier; cannot subscribe.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select subscribed into denied from public.creator_subscription_state(v_handle);
  if denied then raise exception 'anon reported as subscribed'; end if;
  select count(*) into cnt from public.creator_subscription_tiers where is_active;
  if cnt <> 1 then raise exception 'anon sees % active tiers (expected 1)', cnt; end if;
  denied := false;
  begin
    perform public.subscribe_to_creator(v_handle, v_tier_id);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon executed subscribe RPC'; end if;
  reset role;

  delete from auth.users where id in (v_creator_id, v_member_id, v_stranger_id);
  raise notice 'Phase 4 creator subscription checks passed.';
end $$;
