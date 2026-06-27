-- ============================================================================
-- CABANA — Phase 9A behavioral checks: notification delivery engine
-- ============================================================================
-- Proves: `process_notification_outbox` delivers due pending entries (→ sent +
-- processed_at + attempts), is idempotent (no re-delivery), retries transient
-- failures with a future backoff schedule (not picked up until due), dead-letters
-- at the attempt cap, dead-letters permanent failures immediately, honours the
-- batch size, rejects an invalid result arg, and is admin-only (non-admin + anon
-- denied). Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users where email in ('ne_admin@example.com', 'ne_recipient@example.com');

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_recipient_id uuid := gen_random_uuid();
  v_n uuid;
  v_o uuid;
  v_status public.outbox_status;
  v_attempts int;
  v_sched timestamptz;
  v_processed timestamptz;
  v_now timestamptz := now();
  v_summary jsonb;
  cnt int;
  denied boolean;
  i int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_admin_id, 'ne_admin@example.com', '{"name":"Admin"}'::jsonb),
    (v_recipient_id, 'ne_recipient@example.com', '{"name":"Recipient","account_type":"member"}'::jsonb);
  insert into public.user_roles (user_id, role) values (v_admin_id, 'admin');

  -- Seed a notification + a due pending email outbox row (owner insert; the
  -- outbox has no client write grant — it is written by Phase 7 triggers).
  insert into public.notifications (recipient_id, type, title, dedupe_key)
    values (v_recipient_id, 'system', 'n1', 'ne:1') returning id into v_n;
  insert into public.notification_outbox (notification_id, channel, status, scheduled_for)
    values (v_n, 'email', 'pending', v_now - interval '1 minute') returning id into v_o;

  -- 1. Non-admin denial.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recipient_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.process_notification_outbox(50, 5, 'delivered');
  exception when others then denied := true; end;
  if not denied then raise exception 'non-admin processed the outbox'; end if;
  reset role;

  -- Become admin for the processing calls.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  -- 2. Invalid result arg is rejected.
  set local role authenticated;
  denied := false;
  begin perform public.process_notification_outbox(50, 5, 'bogus');
  exception when others then denied := true; end;
  if not denied then raise exception 'invalid delivery result was accepted'; end if;

  -- 3. delivered: the due pending row becomes sent.
  v_summary := public.process_notification_outbox(50, 5, 'delivered');
  reset role;
  if (v_summary->>'processed')::int <> 1 then
    raise exception 'expected processed=1, got %', v_summary->>'processed'; end if;
  if (v_summary->>'delivered')::int <> 1 then raise exception 'expected delivered=1'; end if;
  select status, attempts, processed_at into v_status, v_attempts, v_processed
    from public.notification_outbox where id = v_o;
  if v_status <> 'sent' then raise exception 'row not sent (got %)', v_status; end if;
  if v_attempts <> 1 then raise exception 'attempts not 1 (got %)', v_attempts; end if;
  if v_processed is null then raise exception 'processed_at not set on delivery'; end if;

  -- 4. Idempotency: nothing pending+due now → processed 0 (no re-delivery).
  set local role authenticated;
  v_summary := public.process_notification_outbox(50, 5, 'delivered');
  reset role;
  if (v_summary->>'processed')::int <> 0 then
    raise exception 'idempotency: expected 0, got %', v_summary->>'processed'; end if;

  -- 5. Transient retry + backoff scheduling, then dead-letter at the cap (max=3).
  insert into public.notifications (recipient_id, type, title, dedupe_key)
    values (v_recipient_id, 'system', 'n2', 'ne:2') returning id into v_n;
  insert into public.notification_outbox (notification_id, channel, status, scheduled_for)
    values (v_n, 'email', 'pending', v_now - interval '1 minute') returning id into v_o;

  set local role authenticated;
  v_summary := public.process_notification_outbox(50, 3, 'transient_failure');
  reset role;
  if (v_summary->>'retried')::int <> 1 then
    raise exception 'expected retried=1, got %', v_summary->>'retried'; end if;
  select status, attempts, scheduled_for into v_status, v_attempts, v_sched
    from public.notification_outbox where id = v_o;
  if v_status <> 'pending' then raise exception 'transient should stay pending (got %)', v_status; end if;
  if v_attempts <> 1 then raise exception 'attempts not 1 after transient (got %)', v_attempts; end if;
  if v_sched <= v_now then raise exception 'retry was not scheduled into the future'; end if;

  -- Not due yet → a subsequent run does not pick it up.
  set local role authenticated;
  v_summary := public.process_notification_outbox(50, 3, 'transient_failure');
  reset role;
  if (v_summary->>'processed')::int <> 0 then
    raise exception 'scheduled retry was processed before it was due'; end if;

  -- Force due → attempts 2, still pending (2 < 3).
  update public.notification_outbox set scheduled_for = v_now - interval '1 second' where id = v_o;
  set local role authenticated;
  perform public.process_notification_outbox(50, 3, 'transient_failure');
  reset role;
  select status, attempts into v_status, v_attempts from public.notification_outbox where id = v_o;
  if v_status <> 'pending' or v_attempts <> 2 then
    raise exception 'expected pending attempts=2 (got % %)', v_status, v_attempts; end if;

  -- Force due → attempts 3 >= max → dead-letter (terminal failed).
  update public.notification_outbox set scheduled_for = v_now - interval '1 second' where id = v_o;
  set local role authenticated;
  v_summary := public.process_notification_outbox(50, 3, 'transient_failure');
  reset role;
  if (v_summary->>'dead_lettered')::int <> 1 then raise exception 'expected dead_lettered=1'; end if;
  select status, processed_at into v_status, v_processed from public.notification_outbox where id = v_o;
  if v_status <> 'failed' then raise exception 'expected dead-letter failed (got %)', v_status; end if;
  if v_processed is null then raise exception 'dead-letter processed_at not set'; end if;

  -- 6. Permanent failure → immediate dead-letter.
  insert into public.notifications (recipient_id, type, title, dedupe_key)
    values (v_recipient_id, 'system', 'n3', 'ne:3') returning id into v_n;
  insert into public.notification_outbox (notification_id, channel, status, scheduled_for)
    values (v_n, 'email', 'pending', v_now - interval '1 minute') returning id into v_o;
  set local role authenticated;
  perform public.process_notification_outbox(50, 5, 'permanent_failure');
  reset role;
  select status, attempts into v_status, v_attempts from public.notification_outbox where id = v_o;
  if v_status <> 'failed' or v_attempts <> 1 then
    raise exception 'permanent failure not dead-lettered (got % %)', v_status, v_attempts; end if;

  -- 7. Batch limit: 3 due pending rows, batch_size 2 → 2 processed, 1 remains.
  for i in 1..3 loop
    insert into public.notifications (recipient_id, type, title, dedupe_key)
      values (v_recipient_id, 'system', 'b' || i, 'ne:b' || i) returning id into v_n;
    insert into public.notification_outbox (notification_id, channel, status, scheduled_for)
      values (v_n, 'email', 'pending', v_now - interval '1 minute');
  end loop;
  set local role authenticated;
  v_summary := public.process_notification_outbox(2, 5, 'delivered');
  reset role;
  if (v_summary->>'processed')::int <> 2 then
    raise exception 'batch limit: expected 2, got %', v_summary->>'processed'; end if;
  select count(*) into cnt
    from public.notification_outbox o join public.notifications n on n.id = o.notification_id
    where n.dedupe_key like 'ne:b%' and o.status = 'pending';
  if cnt <> 1 then raise exception 'batch limit: expected 1 pending remaining, got %', cnt; end if;

  -- 8. Anonymous denial.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin perform public.process_notification_outbox(50, 5, 'delivered');
  exception when others then denied := true; end;
  if not denied then raise exception 'anon processed the outbox'; end if;
  reset role;

  delete from auth.users where id in (v_admin_id, v_recipient_id);
  raise notice 'Phase 9A notification engine checks passed.';
end $$;
