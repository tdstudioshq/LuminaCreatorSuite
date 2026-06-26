-- ============================================================================
-- CABANA — Phase 8 behavioral checks: admin moderation & audit (staff only)
-- ============================================================================
-- Proves: report creation under the reporter's RLS, reporter-vs-staff-vs-stranger
-- read isolation, staff triage (assign + status transitions) generating audit
-- rows via the AFTER UPDATE trigger, audit-log append-only immutability
-- (UPDATE/DELETE blocked), staff-only audit reads, non-staff update denial, and
-- anonymous denial on both tables. Self-cleaning; any failed assertion exits
-- non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'mod_admin@example.com',
  'mod_moderator@example.com',
  'mod_reporter@example.com',
  'mod_stranger@example.com'
);

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_moderator_id uuid := gen_random_uuid();
  v_reporter_id uuid := gen_random_uuid();
  v_stranger_id uuid := gen_random_uuid();
  v_subject_id uuid := gen_random_uuid();
  v_report_id uuid;
  v_audit_id uuid;
  cnt int;
  v_status public.report_status;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_admin_id, 'mod_admin@example.com', '{"name":"Admin"}'::jsonb),
    (v_moderator_id, 'mod_moderator@example.com', '{"name":"Moderator"}'::jsonb),
    (v_reporter_id, 'mod_reporter@example.com', '{"name":"Reporter","account_type":"member"}'::jsonb),
    (v_stranger_id, 'mod_stranger@example.com', '{"name":"Stranger","account_type":"member"}'::jsonb);

  insert into public.user_roles (user_id, role) values
    (v_admin_id, 'admin'),
    (v_moderator_id, 'moderator');

  -- 1. Reporter files a report under their own RLS (INSERT policy: reporter = self).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_reporter_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.reports (reporter_user_id, subject_type, subject_id, reason, details)
  values (v_reporter_id, 'post', v_subject_id, 'spam', 'looks like spam')
  returning id into v_report_id;

  -- Reporter reads own report (RLS), but sees no audit rows (staff-only).
  select count(*) into cnt from public.reports;
  if cnt <> 1 then raise exception 'reporter sees % reports (expected 1)', cnt; end if;
  select count(*) into cnt from public.audit_logs;
  if cnt <> 0 then raise exception 'reporter could read % audit rows (expected 0)', cnt; end if;

  -- Reporter cannot insert a report attributed to someone else.
  denied := false;
  begin
    insert into public.reports (reporter_user_id, subject_type, subject_id, reason)
    values (v_stranger_id, 'post', v_subject_id, 'spam');
  exception when others then denied := true; end;
  if not denied then raise exception 'reporter forged a report for another user'; end if;
  reset role;

  -- 2. Stranger sees none of the reporter's reports.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.reports;
  if cnt <> 0 then raise exception 'stranger sees % reports (expected 0)', cnt; end if;
  reset role;

  -- 3. Staff (admin) reads all reports + audit, and triages the report. Each
  --    triage write appends an audit row via the AFTER UPDATE trigger.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Staff read-all: admin can read the reporter's report, which it did not file.
  -- Scoped to the test report so the assertion is independent of demo seed rows
  -- (the staff "read all reports" policy legitimately also surfaces seeded reports).
  select count(*) into cnt from public.reports where id = v_report_id;
  if cnt <> 1 then raise exception 'admin (staff) cannot read the report (got %)', cnt; end if;

  -- assign → audit 'report.assigned'
  update public.reports set assigned_admin_user_id = v_admin_id where id = v_report_id;
  -- open → reviewing → audit 'report.reviewing'
  update public.reports set status = 'reviewing' where id = v_report_id;
  -- reviewing → resolved (+ resolution) → audit 'report.resolved'
  update public.reports set status = 'resolved', resolution = 'removed for spam' where id = v_report_id;

  select count(*) into cnt from public.audit_logs where target_id = v_report_id;
  if cnt <> 3 then raise exception 'expected 3 audit rows for report, got %', cnt; end if;
  if not exists (select 1 from public.audit_logs
    where target_id = v_report_id and action = 'report.assigned') then
    raise exception 'missing report.assigned audit row'; end if;
  if not exists (select 1 from public.audit_logs
    where target_id = v_report_id and action = 'report.resolved' and actor_user_id = v_admin_id) then
    raise exception 'missing report.resolved audit row by admin'; end if;
  reset role;

  -- 4. Moderator is also staff: reads all reports + audit.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_moderator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Moderator is staff too: scoped read of the test report (seed-independent).
  select count(*) into cnt from public.reports where id = v_report_id;
  if cnt <> 1 then raise exception 'moderator (staff) cannot read the report (got %)', cnt; end if;
  select count(*) into cnt from public.audit_logs where target_id = v_report_id;
  if cnt <> 3 then raise exception 'moderator sees % audit rows (expected 3)', cnt; end if;
  reset role;

  -- 5. Non-staff (reporter) cannot triage: the staff-only UPDATE policy matches
  --    no rows, so the status is unchanged (no privilege escalation).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_reporter_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.reports set status = 'open' where id = v_report_id;
  reset role;
  select status into v_status from public.reports where id = v_report_id;
  if v_status <> 'resolved' then
    raise exception 'non-staff changed report status to % (expected resolved)', v_status; end if;
  -- And no audit row was written for the no-op.
  select count(*) into cnt from public.audit_logs where target_id = v_report_id;
  if cnt <> 3 then raise exception 'non-staff update wrote an audit row (count=%)', cnt; end if;

  -- 6. audit_logs are append-only: UPDATE and DELETE are both blocked (tested as
  --    the table owner to exercise the immutability trigger, not RLS).
  select id into v_audit_id from public.audit_logs where target_id = v_report_id limit 1;
  denied := false;
  begin update public.audit_logs set action = 'tampered' where id = v_audit_id;
  exception when others then denied := true; end;
  if not denied then raise exception 'audit_logs UPDATE was not blocked'; end if;

  denied := false;
  begin delete from public.audit_logs where id = v_audit_id;
  exception when others then denied := true; end;
  if not denied then raise exception 'audit_logs DELETE was not blocked'; end if;

  -- 7. Anonymous denial on both tables.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin perform 1 from public.reports limit 1;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon could read reports'; end if;

  denied := false;
  begin perform 1 from public.audit_logs limit 1;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon could read audit_logs'; end if;
  reset role;

  delete from auth.users where id in (v_admin_id, v_moderator_id, v_reporter_id, v_stranger_id);
  raise notice 'Phase 8 admin moderation & audit checks passed.';
end $$;
