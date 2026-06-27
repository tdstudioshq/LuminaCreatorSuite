-- ============================================================================
-- CABANA — Phase 9A: Notification delivery engine
-- ============================================================================
-- Activates the previously-inert Phase 7 `notification_outbox`. Purely additive:
-- ONE new SECURITY DEFINER function, no table/column/enum/RLS change — the
-- outbox already carries everything the engine needs (`attempts`, `last_error`,
-- `scheduled_for`, `processed_at`, the `(status, scheduled_for)` index, and the
-- `outbox_status` enum). A retry stays `pending` with `attempts++` and a future
-- `scheduled_for`; a dead-letter is terminal `failed`.
--
-- A function is genuinely required because the worker-safe atomic claim
-- (`FOR UPDATE SKIP LOCKED`) cannot be expressed through the client query
-- builder. Backend only — NO email/push/SMS providers (Phase 9C). With no
-- transport yet, `_result` SIMULATES the delivery outcome so the retry +
-- dead-letter machinery is real and testable; 9C swaps the simulation for real
-- per-channel provider calls. The decision logic mirrors the pure
-- `cabana-notification-engine.ts` (`resolveOutboxOutcome`) verbatim.
--
-- Admin-gated like the rest of the outbox (it is admin-only / not user-readable).
-- A production deployment would invoke this from a trusted cron / service role.
-- ============================================================================

create or replace function public.process_notification_outbox(
  _batch_size integer default 50,
  _max_attempts integer default 5,
  _result text default 'delivered'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := now();
  v_base integer := 60;     -- backoff base seconds (mirrors DEFAULT_BACKOFF_BASE_SECONDS)
  v_cap integer := 3600;    -- backoff cap seconds (mirrors MAX_BACKOFF_SECONDS)
  v_claimed integer := 0;
  v_sent integer := 0;
  v_retried integer := 0;
  v_dead integer := 0;
  r record;
  v_next_attempts integer;
  v_status public.outbox_status;
  v_scheduled timestamptz;
  v_processed timestamptz;
  v_error text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_current_user_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;
  if _result not in ('delivered', 'transient_failure', 'permanent_failure') then
    raise exception 'Invalid delivery result %', _result using errcode = 'check_violation';
  end if;
  if coalesce(_batch_size, 0) < 1 then
    raise exception 'Batch size must be positive' using errcode = 'check_violation';
  end if;

  -- Claim a batch of due, pending entries — oldest schedule first. SKIP LOCKED
  -- makes concurrent workers safe (no row is claimed twice) and only `pending`
  -- rows are touched, so already-processed entries are never re-delivered.
  for r in
    select id, attempts
    from public.notification_outbox
    where status = 'pending' and scheduled_for <= v_now
    order by scheduled_for asc
    limit _batch_size
    for update skip locked
  loop
    v_claimed := v_claimed + 1;
    v_next_attempts := r.attempts + 1;

    if _result = 'delivered' then
      v_status := 'sent'; v_processed := v_now; v_scheduled := null; v_error := null;
      v_sent := v_sent + 1;
    elsif _result = 'permanent_failure' then
      v_status := 'failed'; v_processed := v_now; v_scheduled := null;
      v_error := 'Permanent delivery failure'; v_dead := v_dead + 1;
    else  -- transient_failure: retry with backoff until the attempt cap, then dead-letter
      if v_next_attempts >= _max_attempts then
        v_status := 'failed'; v_processed := v_now; v_scheduled := null;
        v_error := 'Max delivery attempts reached'; v_dead := v_dead + 1;
      else
        v_status := 'pending'; v_processed := null;
        v_scheduled := v_now
          + make_interval(secs => least(
              v_base::double precision * 2 ^ (v_next_attempts - 1),
              v_cap::double precision));
        v_error := 'Transient delivery failure'; v_retried := v_retried + 1;
      end if;
    end if;

    update public.notification_outbox
    set status = v_status,
        attempts = v_next_attempts,
        last_error = v_error,
        processed_at = v_processed,
        scheduled_for = coalesce(v_scheduled, scheduled_for)
    where id = r.id;
  end loop;

  return jsonb_build_object(
    'processed', v_claimed,
    'delivered', v_sent,
    'retried', v_retried,
    'dead_lettered', v_dead
  );
end;
$$;

revoke execute on function public.process_notification_outbox(integer, integer, text)
  from public, anon;
grant execute on function public.process_notification_outbox(integer, integer, text)
  to authenticated;  -- RLS-equivalent admin gate is enforced inside the function
