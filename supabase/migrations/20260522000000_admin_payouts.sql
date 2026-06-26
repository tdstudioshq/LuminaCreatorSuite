-- ============================================================================
-- CABANA — Phase 8C.2: Admin Payout Management
-- ============================================================================
-- The administrative payout workflow on top of the Phase 6 ledger. Purely
-- additive. DEMO-ONLY: no real disbursement, no processor — every action is a
-- mock state transition that the cached creator balance settles into.
--
-- Reuses, does NOT rebuild:
--   * `payout_requests` / `payouts` (Phase 6) — the request lifecycle + the
--     reserved disbursement. Admin writes go through ONE SECURITY DEFINER RPC.
--   * `audit_logs` + `current_audit_actor_role` (Phase 8A) — every payout
--     decision appends an immutable audit row via an AFTER UPDATE trigger, the
--     same pattern reports use. No second audit system.
--   * `recalc_creator_balance` (Phase 6) — re-run after each decision so a
--     reject releases the reserved amount and a completion books it as paid out.
--
-- The only schema change is one additive enum value (`on_hold`). The payout
-- state machine is mirrored in the pure `cabana-payouts.ts` module + its tests.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Additive enum value: a held request awaiting an admin decision.
-- ----------------------------------------------------------------------------
-- The linked `payouts` row stays `processing` (reserved) throughout a hold, so
-- no `payout_status` change or `recalc_creator_balance` change is needed.
alter type public.payout_request_status add value if not exists 'on_hold';

-- ----------------------------------------------------------------------------
-- 1. Audit generation at the DB layer (reuse audit_logs)
-- ----------------------------------------------------------------------------
-- Append an immutable audit row whenever a payout request's status changes —
-- atomic with the update and uniform regardless of write path. Mirrors
-- `on_report_change_audit` (Phase 8A); writes into the SAME audit_logs table.
create or replace function public.on_payout_request_change_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_logs (
      actor_user_id, actor_role, action, target_type, target_id, before, after, reason
    ) values (
      (select auth.uid()),
      public.current_audit_actor_role(),
      'payout.' || new.status::text,           -- e.g. payout.approved / payout.paid
      'payout_request',
      new.id,
      jsonb_build_object('status', old.status, 'amount_cents', old.amount_cents),
      jsonb_build_object('status', new.status, 'amount_cents', new.amount_cents),
      new.note
    );
  end if;
  return null;
end;
$$;

drop trigger if exists audit_on_payout_request_change on public.payout_requests;
create trigger audit_on_payout_request_change after update on public.payout_requests
  for each row execute function public.on_payout_request_change_audit();

-- ----------------------------------------------------------------------------
-- 2. Admin decision RPC (SECURITY DEFINER, admin-gated, transition-validated)
-- ----------------------------------------------------------------------------
-- The single admin write path. Validates the transition against the current
-- status (mirrors the pure state machine), moves the request + its linked
-- payout, and refreshes the cached balance. The audit row is written by the
-- trigger above. Actions:
--   approve   : requested|on_hold -> approved   (AUTHORIZE; payout stays reserved)
--   reject    : requested|on_hold -> rejected   (payout -> canceled; releases reserve)
--   hold      : requested         -> on_hold    (payout stays processing/reserved)
--   release   : on_hold           -> requested  (payout stays processing/reserved)
--   mark_paid : approved          -> paid       (SETTLE; payout -> paid; books paid-out)
-- (approve authorizes; mark_paid is the distinct settlement step — see cabana-payouts.ts.)
create or replace function public.admin_review_payout(
  _payout_request_id uuid,
  _action text,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.payout_requests;
  v_next public.payout_request_status;
  v_payout_status public.payout_status;
  v_note text := nullif(btrim(coalesce(_note, '')), '');
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_req from public.payout_requests where id = _payout_request_id for update;
  if not found then
    raise exception 'Payout request not found' using errcode = 'no_data_found';
  end if;

  -- Transition table (mirrors cabana-payouts.applyPayoutAction). NULL = invalid.
  v_next := case
    when _action = 'approve'   and v_req.status in ('requested', 'on_hold') then 'approved'
    when _action = 'reject'    and v_req.status in ('requested', 'on_hold') then 'rejected'
    when _action = 'hold'      and v_req.status = 'requested'               then 'on_hold'
    when _action = 'release'   and v_req.status = 'on_hold'                 then 'requested'
    when _action = 'mark_paid' and v_req.status = 'approved'                then 'paid'
    else null
  end::public.payout_request_status;

  if v_next is null then
    raise exception 'Invalid payout action % from status %', _action, v_req.status
      using errcode = 'check_violation';
  end if;

  -- The linked disbursement follows the decision.
  v_payout_status := case
    when v_next = 'rejected' then 'canceled'
    when v_next = 'paid'     then 'paid'
    else 'processing'
  end::public.payout_status;

  update public.payout_requests
  set status = v_next,
      decided_at = case when v_next in ('approved', 'rejected', 'paid') then now() else decided_at end,
      note = coalesce(v_note, note)
  where id = _payout_request_id;

  update public.payouts
  set status = v_payout_status,
      paid_at = case when v_payout_status = 'paid' then now() else paid_at end,
      failure_reason = case
        when v_payout_status = 'canceled' then coalesce(v_note, 'Rejected by admin')
        else failure_reason
      end
  where payout_request_id = _payout_request_id;

  perform public.recalc_creator_balance(v_req.creator_profile_id, v_req.currency);
end;
$$;

revoke execute on function public.admin_review_payout(uuid, text, text) from public, anon;
grant execute on function public.admin_review_payout(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS note
-- ----------------------------------------------------------------------------
-- No new policies needed: Phase 6 already grants admins SELECT on
-- payout_requests / payouts (`is_current_user_admin`); all writes flow through
-- the SECURITY DEFINER RPC above (admin-checked), and the audit insert runs in
-- the trigger's definer context. anon remains fully revoked.
