-- ============================================================================
-- CABANA — Phase 6 behavioral checks: monetization ledger (DEMO-ONLY)
-- ============================================================================
-- Proves: purchase unlock → ledger transaction + purchase + permanent
-- entitlement (+ idempotency), tip → ledger transaction + tip row, balance
-- derivation (gross/fees/net/available), payout request → request + reserved
-- payout (+ eligibility guards), transaction immutability, purchase/tip
-- self-action rejection, RLS isolation across buyer/creator/stranger, and
-- anonymous denial. Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'mon_creator@example.com',
  'mon_member@example.com',
  'mon_stranger@example.com'
);

do $$
declare
  v_creator_id uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_stranger_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_handle text;
  v_buy_post uuid;
  cnt int;
  denied boolean;
  bal record;
  txn record;
  v_amount int;
  v_status public.payout_status;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_creator_id, 'mon_creator@example.com', '{"name":"Creator"}'::jsonb),
    (v_member_id, 'mon_member@example.com', '{"name":"Member","account_type":"member"}'::jsonb),
    (v_stranger_id, 'mon_stranger@example.com', '{"name":"Stranger","account_type":"member"}'::jsonb);

  select id, handle into v_profile_id, v_handle
  from public.creator_profiles where user_id = v_creator_id;

  -- Creator: author a published purchase post priced at $10.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at, price_cents, currency)
    values (v_profile_id, 'paid post', 'purchase', 'published', now(), 1000, 'USD')
    returning id into v_buy_post;

  -- Self-purchase is rejected.
  denied := false;
  begin
    perform public.create_mock_purchase(v_buy_post);
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'creator self-purchase was not rejected'; end if;

  -- Self-tip is rejected.
  denied := false;
  begin
    perform public.create_mock_tip(v_handle, 500, null);
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'creator self-tip was not rejected'; end if;
  reset role;

  -- Stranger (no entitlement): purchase post is locked / not viewable.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.can_view_post(v_buy_post) then
    raise exception 'non-buyer can view purchase post'; end if;
  select locked into denied from public.feed_creator_posts(v_handle) where visibility = 'purchase';
  if not denied then raise exception 'purchase post not locked for non-buyer'; end if;
  reset role;

  -- Member buys the post (demo) and unlocks it permanently.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Invalid tip amount rejected (< $1).
  denied := false;
  begin
    perform public.create_mock_tip(v_handle, 50, null);
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'sub-minimum tip was not rejected'; end if;

  perform public.create_mock_purchase(v_buy_post);

  if not public.has_content_entitlement(v_member_id, v_buy_post) then
    raise exception 'purchase did not grant an entitlement'; end if;
  if not public.can_view_post(v_buy_post) then
    raise exception 'buyer cannot view purchased post'; end if;
  select locked into denied from public.feed_creator_posts(v_handle) where visibility = 'purchase';
  if denied then raise exception 'purchase post still locked for buyer'; end if;

  -- The unlock recorded one demo transaction with the right fee split + mock ref.
  select type, status, gross_cents, platform_fee_cents, processor_fee_cents, creator_net_cents,
         (mock_provider_reference like 'mock_txn_%') as mockok
    into txn
  from public.transactions where reference_id = v_buy_post and type = 'post_unlock';
  if txn.status <> 'succeeded' or txn.gross_cents <> 1000 or txn.platform_fee_cents <> 100
     or txn.processor_fee_cents <> 30 or txn.creator_net_cents <> 870 or not txn.mockok then
    raise exception 'post_unlock transaction not demo-correct: %', txn; end if;

  -- Re-purchase is idempotent: still exactly one entitlement + one purchase.
  perform public.create_mock_purchase(v_buy_post);
  select count(*) into cnt from public.content_entitlements
    where user_id = v_member_id and post_id = v_buy_post;
  if cnt <> 1 then raise exception 'duplicate entitlement rows: %', cnt; end if;
  select count(*) into cnt from public.purchases where buyer_user_id = v_member_id;
  if cnt <> 1 then raise exception 'duplicate purchase rows: %', cnt; end if;

  -- Member tips the creator (demo).
  perform public.create_mock_tip(v_handle, 500, 'love it');
  select amount_cents into v_amount from public.tips where sender_user_id = v_member_id;
  if v_amount <> 500 then raise exception 'tip amount wrong: %', v_amount; end if;
  select gross_cents, creator_net_cents into txn
    from public.transactions where type = 'tip' and payer_user_id = v_member_id;
  if txn.gross_cents <> 500 or txn.creator_net_cents <> 435 then
    raise exception 'tip transaction not demo-correct: %', txn; end if;

  -- RLS: buyer reads own purchases + entitlements; cannot read the ledger as creator.
  select count(*) into cnt from public.purchases;          -- buyer scope
  if cnt <> 1 then raise exception 'buyer sees % purchases (expected 1)', cnt; end if;
  select count(*) into cnt from public.content_entitlements;
  if cnt <> 1 then raise exception 'buyer sees % entitlements (expected 1)', cnt; end if;
  select count(*) into cnt from public.transactions;       -- buyer is payer on both
  if cnt <> 2 then raise exception 'buyer sees % transactions (expected 2 as payer)', cnt; end if;

  -- Non-creator cannot request a payout.
  denied := false;
  begin
    perform public.request_payout(1000, null);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'member (non-creator) requested a payout'; end if;
  reset role;

  -- Stranger sees none of the buyer's financial rows.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.purchases;
  if cnt <> 0 then raise exception 'stranger sees % purchases (expected 0)', cnt; end if;
  select count(*) into cnt from public.content_entitlements;
  if cnt <> 0 then raise exception 'stranger sees % entitlements (expected 0)', cnt; end if;
  select count(*) into cnt from public.transactions;
  if cnt <> 0 then raise exception 'stranger sees % transactions (expected 0)', cnt; end if;
  reset role;

  -- Creator: balance derives gross 1500 / fees 195 / net 1305 / available 1305.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into bal from public.creator_balance();
  if bal.lifetime_gross_cents <> 1500 or bal.lifetime_fees_cents <> 195
     or bal.lifetime_net_cents <> 1305 or bal.available_cents <> 1305
     or bal.pending_cents <> 0 then
    raise exception 'balance not derived correctly: %', bal; end if;

  -- Creator reads exactly the two transactions to their profile.
  select count(*) into cnt from public.transactions;
  if cnt <> 2 then raise exception 'creator sees % transactions (expected 2)', cnt; end if;

  -- Payout eligibility guards: below minimum + exceeding available are rejected.
  denied := false;
  begin perform public.request_payout(500, null);
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'below-minimum payout was not rejected'; end if;

  denied := false;
  begin perform public.request_payout(1000000, null);
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'over-available payout was not rejected'; end if;

  -- Valid payout request: records a request + a reserved (processing) payout,
  -- and the available balance drops by the requested amount.
  perform public.request_payout(1000, 'first payout');
  select count(*) into cnt from public.payout_requests where status = 'requested';
  if cnt <> 1 then raise exception 'expected 1 payout request, got %', cnt; end if;
  select amount_cents, status into v_amount, v_status from public.payouts;
  if v_amount <> 1000 or v_status <> 'processing' then
    raise exception 'payout row not demo-correct: amount=% status=%', v_amount, v_status; end if;

  select * into bal from public.creator_balance();
  if bal.available_cents <> 305 or bal.lifetime_paid_out_cents <> 0 then
    raise exception 'payout did not reserve available balance: %', bal; end if;
  reset role;

  -- Ledger immutability: UPDATE and DELETE on transactions are blocked (owner role).
  denied := false;
  begin update public.transactions set gross_cents = 1 where reference_id = v_buy_post;
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'transaction UPDATE was allowed (ledger not immutable)'; end if;

  denied := false;
  begin delete from public.transactions where reference_id = v_buy_post;
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'transaction DELETE was allowed (ledger not immutable)'; end if;

  -- Anonymous: no access to any financial table.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin perform 1 from public.transactions limit 1;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon could read transactions'; end if;

  denied := false;
  begin perform 1 from public.creator_balances limit 1;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon could read creator_balances'; end if;
  reset role;

  delete from auth.users where id in (v_creator_id, v_member_id, v_stranger_id);
  raise notice 'Phase 6 monetization ledger checks passed.';
end $$;
