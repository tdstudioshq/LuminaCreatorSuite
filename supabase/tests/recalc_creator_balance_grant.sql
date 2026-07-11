-- ============================================================================
-- CABANA — recalc_creator_balance internal-only grant (20260534) checks
-- ============================================================================
-- Proves the balance-recompute function is no longer directly callable by
-- client roles, while the internal (SECURITY DEFINER RPC) path that legitimately
-- recomputes balances still works:
--   1. creator B CANNOT recalc creator A's balance (42501),
--   2. an ANONYMOUS caller cannot execute the function,
--   3. the intended internal workflow (create_mock_tip -> internal recalc)
--      still succeeds and,
--   4. produces the correct balance (10% + 3% fee model),
--   5. least privilege: NO client role (anon/authenticated/public) holds EXECUTE
--      — so an admin (a subset of `authenticated`) also cannot call it directly;
--      admin balance recomputes flow through admin_review_payout, covered by
--      admin_payouts.sql.
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in ('rcg_a@example.com', 'rcg_b@example.com');

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_profile_a uuid;
  v_handle_a text;
  v_avail integer;
  v_net integer;
  v_gross integer;
  v_fees integer;
  cnt int;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_a, 'rcg_a@example.com', '{"name":"CreatorA"}'::jsonb),
    (v_b, 'rcg_b@example.com', '{"name":"CreatorB"}'::jsonb);
  select id, handle into v_profile_a, v_handle_a
  from public.creator_profiles where user_id = v_a;

  -- (5) Catalog least-privilege: no client role holds EXECUTE on recalc.
  select count(*) into cnt
  from information_schema.role_routine_grants
  where routine_schema = 'public'
    and routine_name = 'recalc_creator_balance'
    and grantee in ('anon', 'authenticated', 'public', 'PUBLIC');
  if cnt <> 0 then
    raise exception 'FAIL: recalc_creator_balance still granted to a client role (% grants)', cnt;
  end if;

  -- (1) Creator B cannot recalc creator A's balance.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin
    perform public.recalc_creator_balance(v_profile_a, 'USD');
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: creator B directly recalculated A''s balance';
  end if;
  reset role;

  -- (2) Anonymous cannot execute the function.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  denied := false;
  begin
    perform public.recalc_creator_balance(v_profile_a, 'USD');
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: anon executed recalc_creator_balance';
  end if;
  reset role;

  -- No junk row was written to A's projection by the blocked calls.
  select count(*) into cnt from public.creator_balances where creator_profile_id = v_profile_a;
  if cnt <> 0 then
    raise exception 'FAIL: A has % creator_balances rows after blocked calls (expected 0)', cnt;
  end if;

  -- (3) Intended internal workflow: B tips A $10 via the SECURITY DEFINER RPC,
  --     which internally PERFORMs recalc_creator_balance for A.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_mock_tip(v_handle_a, 1000, 'thanks');
  reset role;

  -- (4) Balance is correct: gross 1000, fees 10%+3% = 130, net 870, available 870.
  select available_cents, lifetime_net_cents, lifetime_gross_cents, lifetime_fees_cents
    into v_avail, v_net, v_gross, v_fees
  from public.creator_balances
  where creator_profile_id = v_profile_a and currency = 'USD';
  if v_avail is null then
    raise exception 'FAIL: internal recalc did not create A''s balance row';
  end if;
  if v_gross <> 1000 or v_fees <> 130 or v_net <> 870 or v_avail <> 870 then
    raise exception 'FAIL: balance wrong after tip — gross=% fees=% net=% avail=% (expected 1000/130/870/870)',
      v_gross, v_fees, v_net, v_avail;
  end if;

  raise notice 'recalc_creator_balance internal-only checks passed';

  delete from auth.users where id in (v_a, v_b);
end $$;
