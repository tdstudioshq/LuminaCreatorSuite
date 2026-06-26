-- ============================================================================
-- CABANA — Phase 8C.2 behavioral checks: admin payout management
-- ============================================================================
-- Proves: the admin payout state machine via `admin_review_payout` (hold →
-- release → approve → complete), invalid-transition rejection, the linked
-- disbursement following each decision, balance recompute (reserve → paid-out on
-- completion; reserve released on rejection), one immutable audit row per status
-- change (target_type 'payout_request'), non-admin denial, and anonymous denial.
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'pay_admin@example.com',
  'pay_creator@example.com',
  'pay_stranger@example.com'
);

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_creator_id uuid := gen_random_uuid();
  v_stranger_id uuid := gen_random_uuid();
  v_creator_profile_id uuid;
  v_req1 uuid;
  v_req2 uuid;
  v_status public.payout_request_status;
  v_payout_status public.payout_status;
  v_available integer;
  v_paid_out integer;
  cnt int;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_admin_id, 'pay_admin@example.com', '{"name":"Admin"}'::jsonb),
    (v_creator_id, 'pay_creator@example.com', '{"name":"Payout Creator"}'::jsonb),
    (v_stranger_id, 'pay_stranger@example.com', '{"name":"Stranger","account_type":"member"}'::jsonb);

  insert into public.user_roles (user_id, role) values (v_admin_id, 'admin');

  -- The signup trigger provisioned a creator_profiles row for the creator.
  select id into v_creator_profile_id from public.creator_profiles where user_id = v_creator_id;
  if v_creator_profile_id is null then
    raise exception 'creator profile was not provisioned'; end if;

  -- Seed settled earnings so the creator has an available balance (table-owner
  -- insert; the ledger is RPC-written in the app, direct here only for setup).
  insert into public.transactions (
    payer_user_id, creator_profile_id, type, status,
    gross_cents, platform_fee_cents, processor_fee_cents, creator_net_cents, currency
  ) values (
    v_stranger_id, v_creator_profile_id, 'tip', 'succeeded', 10000, 1000, 300, 8700, 'USD'
  );

  -- Creator requests a $50 payout (RPC: creates request 'requested' + payout 'processing').
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.request_payout(5000, 'first payout');
  reset role;

  select id into v_req1 from public.payout_requests
  where creator_profile_id = v_creator_profile_id order by created_at desc limit 1;

  -- 1. Non-admin cannot review (admin check precedes everything).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.admin_review_payout(v_req1, 'approve', null);
  exception when others then denied := true; end;
  if not denied then raise exception 'non-admin reviewed a payout'; end if;
  reset role;

  -- 2. Admin actions. Run as admin for the rest of the state-machine checks.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 2a. Invalid transition: cannot mark a still-pending request paid.
  denied := false;
  begin perform public.admin_review_payout(v_req1, 'mark_paid', null);
  exception when others then denied := true; end;
  if not denied then raise exception 'invalid transition (mark_paid from requested) was allowed'; end if;

  -- 2b. hold → release → approve → mark_paid.
  perform public.admin_review_payout(v_req1, 'hold', 'needs a second look');
  select status into v_status from public.payout_requests where id = v_req1;
  if v_status <> 'on_hold' then raise exception 'hold did not set on_hold (got %)', v_status; end if;

  perform public.admin_review_payout(v_req1, 'release', null);
  select status into v_status from public.payout_requests where id = v_req1;
  if v_status <> 'requested' then raise exception 'release did not restore requested (got %)', v_status; end if;

  perform public.admin_review_payout(v_req1, 'approve', null);
  select status into v_status from public.payout_requests where id = v_req1;
  if v_status <> 'approved' then raise exception 'approve did not set approved (got %)', v_status; end if;

  perform public.admin_review_payout(v_req1, 'mark_paid', 'paid out');
  select status into v_status from public.payout_requests where id = v_req1;
  if v_status <> 'paid' then raise exception 'mark_paid did not set paid (got %)', v_status; end if;

  -- Linked disbursement settled to paid with a paid_at stamp.
  select status into v_payout_status from public.payouts where payout_request_id = v_req1;
  if v_payout_status <> 'paid' then raise exception 'payout not paid (got %)', v_payout_status; end if;
  if not exists (select 1 from public.payouts where payout_request_id = v_req1 and paid_at is not null) then
    raise exception 'paid payout missing paid_at'; end if;

  -- Balance booked the disbursement as paid out.
  select lifetime_paid_out_cents into v_paid_out from public.creator_balances
  where creator_profile_id = v_creator_profile_id and currency = 'USD';
  if v_paid_out <> 5000 then raise exception 'expected lifetime_paid_out 5000, got %', v_paid_out; end if;

  -- One audit row per status change (hold, release, approve, complete = 4).
  select count(*) into cnt from public.audit_logs
  where target_type = 'payout_request' and target_id = v_req1;
  if cnt <> 4 then raise exception 'expected 4 payout audit rows, got %', cnt; end if;
  if not exists (select 1 from public.audit_logs
    where target_id = v_req1 and action = 'payout.paid' and actor_user_id = v_admin_id) then
    raise exception 'missing payout.paid audit row by admin'; end if;
  reset role;

  -- 3. Reject path releases the reserve. Creator requests $20…
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.request_payout(2000, 'second payout');
  reset role;
  select id into v_req2 from public.payout_requests
  where creator_profile_id = v_creator_profile_id and id <> v_req1 order by created_at desc limit 1;

  -- …admin rejects it.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_review_payout(v_req2, 'reject', 'insufficient verification');
  select status into v_status from public.payout_requests where id = v_req2;
  if v_status <> 'rejected' then raise exception 'reject did not set rejected (got %)', v_status; end if;
  select status into v_payout_status from public.payouts where payout_request_id = v_req2;
  if v_payout_status <> 'canceled' then raise exception 'rejected payout not canceled (got %)', v_payout_status; end if;

  -- Available restored: net 8700 − paid-out 5000 − reserved 0 = 3700.
  perform public.recalc_creator_balance(v_creator_profile_id, 'USD');
  select available_cents into v_available from public.creator_balances
  where creator_profile_id = v_creator_profile_id and currency = 'USD';
  if v_available <> 3700 then raise exception 'expected available 3700 after reject, got %', v_available; end if;
  reset role;

  -- 4. Anonymous denial: execute is revoked from anon.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin perform public.admin_review_payout(v_req1, 'approve', null);
  exception when others then denied := true; end;
  if not denied then raise exception 'anon invoked admin_review_payout'; end if;
  reset role;

  delete from auth.users where id in (v_admin_id, v_creator_id, v_stranger_id);
  raise notice 'Phase 8C.2 admin payout management checks passed.';
end $$;
