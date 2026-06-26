-- ============================================================================
-- CABANA — Phase 8 (slice 1): Admin Moderation & Audit foundation
-- ============================================================================
-- The trust & operations foundation: a real, RLS-enforced moderation queue
-- (`reports`) and an append-only `audit_logs` trail. Purely additive.
--
-- INTERNAL / staff only. NOT in scope for this slice: admin finance views,
-- payout approval, notification outbox/delivery, email/push providers, and
-- member-facing "Report" buttons across the app (the report INSERT path exists
-- and is RLS-correct so those can be wired later without a schema change).
--
-- Design mirrors the established phases:
--   * Read-only, RLS-scoped server actions do plain selects; staff triage via a
--     staff-only UPDATE policy on `reports`.
--   * Audit generation lives at the DATABASE layer (an AFTER UPDATE trigger on
--     `reports`), so every moderation mutation appends an immutable audit row
--     atomically and uniformly, regardless of the write path — the same pattern
--     Phase 7 used for notifications.
--   * `audit_logs` is append-only: a BEFORE UPDATE/DELETE trigger blocks rewrites
--     (permitting only the FK-null cascade), mirroring the Phase 6 ledger.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enums (mirror the client unions in cabana-types.ts: Report / AuditLog)
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.report_subject_type as enum
    ('user', 'creator', 'post', 'comment', 'message');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_reason as enum
    ('spam', 'harassment', 'impersonation', 'copyright', 'scam', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum
    ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audit_actor_role as enum
    ('creator', 'moderator', 'admin', 'system');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
-- 1a. reports — user-submitted moderation reports. A reporter creates and reads
-- their own; staff (admin/moderator) read and triage all. The subject is
-- polymorphic (`subject_type` + `subject_id`); subject_id is a free uuid (a
-- profile id, creator_profile id, post id, comment id, or message id) and is not
-- FK-constrained so reports survive subject deletion for the audit record.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.profiles (id) on delete cascade,
  subject_type public.report_subject_type not null,
  subject_id uuid not null,
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'open',
  assigned_admin_user_id uuid references public.profiles (id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_details_len check (details is null or char_length(details) <= 2000),
  constraint reports_resolution_len check (resolution is null or char_length(resolution) <= 2000)
);

create index if not exists reports_status_idx
  on public.reports (status, created_at desc);
create index if not exists reports_subject_idx
  on public.reports (subject_type, subject_id);
create index if not exists reports_reporter_idx
  on public.reports (reporter_user_id, created_at desc);
create index if not exists reports_assigned_idx
  on public.reports (assigned_admin_user_id) where assigned_admin_user_id is not null;

drop trigger if exists touch_reports_updated_at on public.reports;
create trigger touch_reports_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

-- 1b. audit_logs — append-only trail of privileged actions. System/trigger
-- written only (no client INSERT); staff read. Captures actor, action, target,
-- and a before/after jsonb snapshot.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_role public.audit_actor_role not null,
  action text not null,
  target_type text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  request_id text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_len check (char_length(action) <= 200),
  constraint audit_logs_target_type_len check (char_length(target_type) <= 100),
  constraint audit_logs_reason_len check (reason is null or char_length(reason) <= 2000)
);

create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_user_id, created_at desc);
create index if not exists audit_logs_target_idx
  on public.audit_logs (target_type, target_id, created_at desc);
create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);

-- Append-only enforcement: an audit row is never rewritten. DELETE is always
-- blocked; UPDATE is blocked unless the only change is a parent FK being nulled
-- by ON DELETE SET NULL (so an actor account can be deleted while the immutable
-- audit row is retained). Mirrors the Phase 6 ledger immutability trigger.
create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'audit_logs are immutable (append-only)'
      using errcode = 'check_violation';
  end if;
  if (
    new.actor_role, new.action, new.target_type, new.target_id, new.before,
    new.after, new.reason, new.request_id, new.ip_address, new.user_agent,
    new.created_at
  ) is distinct from (
    old.actor_role, old.action, old.target_type, old.target_id, old.before,
    old.after, old.reason, old.request_id, old.ip_address, old.user_agent,
    old.created_at
  ) then
    raise exception 'audit_logs are immutable (append-only)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

-- ----------------------------------------------------------------------------
-- 2. Staff helpers (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
-- Whether the current user is staff (admin OR moderator). Wraps `has_role`
-- (which is intentionally NOT executable by `authenticated`) so moderation RLS
-- policies can be evaluated by normal callers. Mirrors `is_current_user_admin`.
create or replace function public.is_current_user_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role((select auth.uid()), 'admin')
      or public.has_role((select auth.uid()), 'moderator')
$$;

revoke execute on function public.is_current_user_staff() from public, anon;
grant execute on function public.is_current_user_staff() to authenticated;

-- The audit actor role for the current user (admin wins over moderator; falls
-- back to creator for any other authenticated caller). Used only by the audit
-- trigger — not callable by clients.
create or replace function public.current_audit_actor_role()
returns public.audit_actor_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.has_role((select auth.uid()), 'admin') then 'admin'::public.audit_actor_role
    when public.has_role((select auth.uid()), 'moderator') then 'moderator'::public.audit_actor_role
    else 'creator'::public.audit_actor_role
  end
$$;

revoke execute on function public.current_audit_actor_role() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Audit generation trigger (AFTER UPDATE on reports)
-- ----------------------------------------------------------------------------
-- Append an immutable audit row whenever a report's triage fields change
-- (status or assignment). The action name is derived from the change; the
-- before/after snapshots record exactly what moved. Atomic with the update and
-- uniform across any staff write path.
create or replace function public.on_report_change_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_status_changed boolean := new.status is distinct from old.status;
  v_assign_changed boolean := new.assigned_admin_user_id is distinct from old.assigned_admin_user_id;
begin
  if not v_status_changed and not v_assign_changed then
    return null;
  end if;

  if v_status_changed then
    v_action := 'report.' || new.status::text;  -- e.g. report.reviewing / report.resolved
  else
    v_action := 'report.assigned';
  end if;

  insert into public.audit_logs (
    actor_user_id, actor_role, action, target_type, target_id, before, after, reason
  ) values (
    (select auth.uid()),
    public.current_audit_actor_role(),
    v_action,
    'report',
    new.id,
    jsonb_build_object('status', old.status,
                       'assigned_admin_user_id', old.assigned_admin_user_id),
    jsonb_build_object('status', new.status,
                       'assigned_admin_user_id', new.assigned_admin_user_id),
    new.resolution
  );
  return null;
end;
$$;

drop trigger if exists audit_on_report_change on public.reports;
create trigger audit_on_report_change after update on public.reports
  for each row execute function public.on_report_change_audit();

-- ----------------------------------------------------------------------------
-- 4. RLS + grants
-- ----------------------------------------------------------------------------
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;

-- reports: a reporter reads their own; staff read all. A user creates their own
-- reports (reporter_user_id = self). Only staff may update (triage). No client
-- DELETE.
create policy "Reporters read own reports"
  on public.reports for select
  using (reporter_user_id = (select auth.uid()));
create policy "Staff read all reports"
  on public.reports for select
  using ((select public.is_current_user_staff()));
create policy "Users create own reports"
  on public.reports for insert
  with check (reporter_user_id = (select auth.uid()));
create policy "Staff update reports"
  on public.reports for update
  using ((select public.is_current_user_staff()))
  with check ((select public.is_current_user_staff()));

-- audit_logs: staff read only. Never written by clients (the AFTER UPDATE
-- trigger inserts via SECURITY DEFINER); never updated/deleted (append-only).
create policy "Staff read audit logs"
  on public.audit_logs for select
  using ((select public.is_current_user_staff()));

-- reports: any authenticated user may create + read (RLS scopes reads); staff
-- update is column-scoped to the triage fields (cannot rewrite reporter/subject).
grant select, insert on public.reports to authenticated;
grant update (status, assigned_admin_user_id, resolution) on public.reports to authenticated;
-- audit_logs: read only for authenticated (RLS limits to staff); no write grant.
grant select on public.audit_logs to authenticated;

revoke all on public.reports from anon;
revoke all on public.audit_logs from anon;
