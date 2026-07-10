-- ============================================================================
-- CABANA — High-severity QA fix behavioral checks (migration 20260530000000)
-- ----------------------------------------------------------------------------
-- Proves:
--   H5  public_creator_profiles.post_count = real count of PUBLISHED posts
--       (drafts excluded), not a hardcoded 0.
--   H8  create_mock_purchase stays idempotent (one transaction/purchase/
--       entitlement on repeat) AND carries the per-(buyer,post) advisory lock
--       that serializes concurrent unlocks.
--   H9  request_payout reserves available balance, rejects a follow-up request
--       that exceeds the *reduced* balance (the serialized-concurrency outcome),
--       never drives available negative, AND carries the per-creator advisory
--       lock.
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users where email in ('hqf_creator@example.com', 'hqf_member@example.com');

do $$
declare
  v_creator uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_profile uuid;
  v_handle text;
  v_post uuid;
  cnt int;
  pc bigint;
  denied boolean;
  avail int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_creator, 'hqf_creator@example.com', '{"name":"HQF Creator"}'::jsonb),
    (v_member, 'hqf_member@example.com', '{"name":"HQF Member","account_type":"member"}'::jsonb);

  select id, handle into v_profile, v_handle
  from public.creator_profiles where user_id = v_creator;

  -- ── H5: post_count counts only PUBLISHED posts ─────────────────────────────
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at, price_cents, currency)
    values (v_profile, 'p1', 'public', 'published', now(), null, 'USD'),
           (v_profile, 'p2 paid', 'purchase', 'published', now(), 1000, 'USD');
  insert into public.posts (creator_profile_id, caption, visibility, status)
    values (v_profile, 'draft (must not count)', 'public', 'draft');

  select post_count into pc from public.public_creator_profiles where username = v_handle;
  if pc <> 2 then
    raise exception 'H5: post_count expected 2 (published only), got %', pc;
  end if;

  select id into v_post from public.posts
  where creator_profile_id = v_profile and visibility = 'purchase';

  -- Seed a fixture sale so the creator has enough balance to exercise a payout.
  -- net = gross − platform − processor (5747 − 575 − 172 = 5000).
  insert into public.transactions (
    payer_user_id, creator_profile_id, type, status, gross_cents,
    platform_fee_cents, processor_fee_cents, creator_net_cents, currency,
    reference_type, mock_provider_reference
  ) values (
    v_member, v_profile, 'post_unlock', 'succeeded', 5747, 575, 172, 5000, 'USD',
    'post', 'mock_txn_hqf_fixture'
  );
  perform public.recalc_creator_balance(v_profile, 'USD');

  -- ── H8: repeat unlock is idempotent (one of each row) ──────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_mock_purchase(v_post);
  perform public.create_mock_purchase(v_post);   -- repeat → no-op
  reset role;

  select count(*) into cnt from public.content_entitlements where user_id = v_member and post_id = v_post;
  if cnt <> 1 then raise exception 'H8: duplicate entitlements: %', cnt; end if;
  select count(*) into cnt from public.purchases where buyer_user_id = v_member and post_id = v_post;
  if cnt <> 1 then raise exception 'H8: duplicate purchases: %', cnt; end if;
  select count(*) into cnt from public.transactions
    where payer_user_id = v_member and reference_id = v_post and type = 'post_unlock';
  if cnt <> 1 then raise exception 'H8: duplicate unlock transactions: %', cnt; end if;

  -- ── H9: reserve then reject-over-reduced-balance; never go negative ─────────
  -- Available now = fixture 5000 + this sale net 870 = 5870.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select available_cents into avail from public.creator_balance();
  if avail <> 5870 then raise exception 'H9: expected available 5870, got %', avail; end if;

  perform public.request_payout(5000, 'first');
  select available_cents into avail from public.creator_balance();
  if avail <> 870 then raise exception 'H9: reserve did not drop available to 870, got %', avail; end if;

  -- A second $50 request now exceeds the reduced balance and must be rejected —
  -- exactly what the advisory lock guarantees when two requests race.
  denied := false;
  begin perform public.request_payout(5000, 'second');
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'H9: over-reduced-balance payout was not rejected'; end if;

  select available_cents into avail from public.creator_balance();
  if avail < 0 then raise exception 'H9: available went negative: %', avail; end if;
  reset role;

  -- ── Advisory-lock guards are present in both write RPCs ────────────────────
  if position('pg_advisory_xact_lock' in
       pg_get_functiondef('public.create_mock_purchase(uuid)'::regprocedure)) = 0 then
    raise exception 'H8: create_mock_purchase is missing its advisory lock';
  end if;
  if position('pg_advisory_xact_lock' in
       pg_get_functiondef('public.request_payout(integer,text)'::regprocedure)) = 0 then
    raise exception 'H9: request_payout is missing its advisory lock';
  end if;

  delete from auth.users where id in (v_creator, v_member);
  raise notice 'High-severity QA fix checks passed (H5 post_count, H8 idempotency+lock, H9 reserve+lock).';
end $$;
