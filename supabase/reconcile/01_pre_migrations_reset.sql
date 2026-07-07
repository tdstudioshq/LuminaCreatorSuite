-- ============================================================================
-- CABANA ⇄ cabanadatabase (rpzaeqoqcaxxavltgvpe) reconciliation — PART 1 of 2
-- Pre-migration reset: clear the empty spec-scaffolded schema so the repo's
-- 16 CABANA migrations can apply verbatim.
--
-- *** DO NOT RUN WITHOUT EXPLICIT APPROVAL. NOT wired into supabase/migrations. ***
--
-- Verified live state (July 7, 2026, via Management API introspection):
--   - 51 public tables, ALL empty except public.profiles (1 row: Tyler admin)
--   - 1 auth.users row (tyler.diorio@gmail.com) — auth schema is NOT touched
--   - no triggers on auth.users; only function: public.set_updated_at
--   - 26 public enums (6 collide with CABANA names, all with different labels)
--   - 92 RLS policies (all attached to scaffold tables; dropped via CASCADE)
--   - storage buckets: avatars(public) collides benignly (CABANA's insert is
--     ON CONFLICT DO NOTHING); creator-media / message-media /
--     verification-documents / compliance-documents are live-only and KEPT
--
-- RECOMMENDED BEFORE RUNNING: take a DDL snapshot of the scaffold —
--   supabase db dump --db-url "$PROD_DB_URL" -f reconcile/scaffold_snapshot.sql
--
-- Run order:
--   1. this file
--   2. the 16 repo migrations, in order (supabase db push after linking,
--      or psql -f per file). Do NOT run supabase/seed.sql remotely.
--   3. 02_post_migrations_backfill.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Safety guard: abort unless every table we are about to drop is EMPTY.
--    (profiles is excluded — it is preserved into legacy_reel below.)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  c bigint;
  scaffold text[] := array[
    'admin_notes','age_verifications','analytics_events','appeal_events',
    'appeals','audit_logs','blocks','chargebacks','collections',
    'compliance_records','content_entitlements','content_performers',
    'conversations','creator_balances','creator_profiles',
    'creator_subscription_tiers','creator_subscriptions',
    'creator_verification_documents','creator_verification_events',
    'creator_verification_requests','creator_verifications','fan_profiles',
    'feature_flags','follows','fraud_signal_events','invoices',
    'message_read_receipts','messages','notification_outbox',
    'notification_preferences','notifications','payment_methods','payouts',
    'performers','platform_config','poll_options','poll_votes',
    'post_comments','post_likes','post_media','post_saves','posts',
    'refund_requests','reports','risk_status','strikes','support_tickets',
    'takedown_requests','transactions','user_warnings'
  ];
begin
  foreach t in array scaffold loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into c;
      if c > 0 then
        raise exception 'ABORT: public.% has % rows — expected empty scaffold. Re-audit before reset.', t, c;
      end if;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Preserve legacy data: move public.profiles (1 admin row) out of the way.
--    Enum-typed columns are converted to text first so the scaffold enum types
--    can be dropped without cascading into the preserved table.
-- ----------------------------------------------------------------------------
create schema if not exists legacy_reel;

alter table public.profiles alter column role type text using role::text;
alter table public.profiles alter column admin_scopes type text[] using admin_scopes::text[];
alter table public.profiles set schema legacy_reel;

comment on table legacy_reel.profiles is
  'Pre-CABANA scaffold profiles preserved 2026-07-07 during schema reconciliation. Source of the admin backfill in 02_post_migrations_backfill.sql.';

-- ----------------------------------------------------------------------------
-- 2. Drop the empty scaffold tables (their RLS policies, triggers and indexes
--    go with them via CASCADE).
-- ----------------------------------------------------------------------------
drop table if exists
  public.admin_notes, public.age_verifications, public.analytics_events,
  public.appeal_events, public.appeals, public.audit_logs, public.blocks,
  public.chargebacks, public.collections, public.compliance_records,
  public.content_entitlements, public.content_performers, public.conversations,
  public.creator_balances, public.creator_profiles,
  public.creator_subscription_tiers, public.creator_subscriptions,
  public.creator_verification_documents, public.creator_verification_events,
  public.creator_verification_requests, public.creator_verifications,
  public.fan_profiles, public.feature_flags, public.follows,
  public.fraud_signal_events, public.invoices, public.message_read_receipts,
  public.messages, public.notification_outbox, public.notification_preferences,
  public.notifications, public.payment_methods, public.payouts,
  public.performers, public.platform_config, public.poll_options,
  public.poll_votes, public.post_comments, public.post_likes,
  public.post_media, public.post_saves, public.posts, public.refund_requests,
  public.reports, public.risk_status, public.strikes, public.support_tickets,
  public.takedown_requests, public.transactions, public.user_warnings
  cascade;

-- ----------------------------------------------------------------------------
-- 3. Drop the scaffold enums. Six names collide with CABANA enums but carry
--    DIFFERENT labels (payout_status, post_status, post_visibility,
--    report_status, report_subject_type, transaction_type). CABANA's migrations
--    create enums inside `exception when duplicate_object` guards, so if these
--    were left in place the migrations would SILENTLY bind tables to the wrong
--    labels — they must be dropped first.
-- ----------------------------------------------------------------------------
drop type if exists
  public.admin_scope, public.appeal_kind, public.appeal_status,
  public.compliance_status, public.creator_verification_kind,
  public.creator_verification_status, public.invoice_status,
  public.media_processing_status, public.media_type, public.note_category,
  public.note_subject_type, public.payout_status, public.post_status,
  public.post_visibility, public.report_content_kind, public.report_priority,
  public.report_status, public.report_subject_type, public.risk_disposition,
  public.subscription_status, public.ticket_priority, public.ticket_status,
  public.transaction_type, public.user_role, public.verification_document_kind,
  public.verification_status
  cascade;

-- ----------------------------------------------------------------------------
-- 4. Drop the scaffold helper function (CABANA defines its own updated-at
--    triggers; set_updated_at is scaffold-only).
-- ----------------------------------------------------------------------------
drop function if exists public.set_updated_at() cascade;

-- ----------------------------------------------------------------------------
-- 5. Storage: KEEP all buckets (bucket inserts downstream are idempotent), but
--    DROP every existing storage.objects policy. These are the scaffold's, and
--    several reference app_private helpers (e.g. app_private.current_profile_id()
--    reads public.profiles.auth_user_id — a column CABANA does NOT have), so if
--    left in place they break planning of any storage INSERT on a shared bucket
--    like `avatars` (Postgres plans ALL applicable permissive policies, and one
--    broken reference fails the whole statement). At this point the CABANA
--    storage policies do not exist yet — the migrations create them — so
--    clearing all current policies leaves exactly the CABANA set afterward.
--    (Original run of this file had this as a no-op; corrected here. The already-
--    migrated cloud is fixed by 03_fix_storage_policies.sql.)
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

commit;

-- Next: apply the 16 repo migrations in order, then run
-- 02_post_migrations_backfill.sql.
