#!/usr/bin/env bash
# Dry-run the cabanadatabase reconciliation against the LOCAL Supabase Docker DB.
# Never touches cloud. Sequence: clean slate -> simulate cloud scaffold ->
# 01 reset -> 16 CABANA migrations -> 02 backfill -> validation.
set -euo pipefail

DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
PSQL="psql $DB -v ON_ERROR_STOP=1 -q"
REPO="/Users/tdstudiosny/LuminaCreatorSuite"
REC="$REPO/supabase/reconcile"
MIG="$REPO/supabase/migrations"

echo "===== STEP 0: clean slate (drop storage policies + reset public schema) ====="
# Note: storage.objects/buckets rows are left in place (a Supabase trigger blocks
# direct deletion); all bucket inserts downstream are ON CONFLICT DO NOTHING, so
# leftover buckets are harmless. We only clear storage POLICIES so migration
# `create policy` calls don't collide with a prior run.
$PSQL <<'SQL'
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='storage' and tablename='objects'
  loop execute format('drop policy %I on storage.objects', r.policyname); end loop;
end $$;
drop schema if exists legacy_reel cascade;
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant create on schema public to postgres;
SQL
echo "clean slate OK"

echo "===== STEP 1: simulate cloud scaffold ====="
$PSQL -f "$REC/00_simulate_cloud_scaffold.sql"
echo "scaffold loaded: $($PSQL -t -c "select count(*) from information_schema.tables where table_schema='public'" | tr -d ' ') public tables, $($PSQL -t -c "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'" | tr -d ' ') enums, profiles rows=$($PSQL -t -c 'select count(*) from public.profiles' | tr -d ' ')"

echo "===== STEP 2: 01_pre_migrations_reset.sql ====="
$PSQL -f "$REC/01_pre_migrations_reset.sql"
echo "post-reset: public tables=$($PSQL -t -c "select count(*) from information_schema.tables where table_schema='public'" | tr -d ' '), public enums=$($PSQL -t -c "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'" | tr -d ' '), legacy_reel.profiles rows=$($PSQL -t -c 'select count(*) from legacy_reel.profiles' | tr -d ' ')"

echo "===== STEP 3: apply 16 CABANA migrations in order ====="
for f in $(ls "$MIG"/*.sql | sort); do
  printf '  -> %s ... ' "$(basename "$f")"
  $PSQL -f "$f" >/dev/null
  echo "ok"
done
echo "all migrations applied"

echo "===== STEP 4: 02_post_migrations_backfill.sql ====="
$PSQL -f "$REC/02_post_migrations_backfill.sql"
echo "backfill applied"

echo "===== STEP 5: VALIDATION ====="
$PSQL <<'SQL'
\echo '-- profiles.account_type present?'
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='account_type') as account_type_col;
\echo '-- post_visibility now has CABANA labels (public,followers,subscribers,purchase)?'
select array_to_string(enum_range(null::public.post_visibility),',') as post_visibility_labels;
\echo '-- payout_status now CABANA labels (queued,processing,paid,failed,canceled)?'
select array_to_string(enum_range(null::public.payout_status),',') as payout_status_labels;
\echo '-- handle_new_user trigger on auth.users?'
select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users' and not tgisinternal;
\echo '-- admin backfill: profile + roles + creator_profile for 4d54cf94'
select pr.account_type,
       (select array_agg(role order by role) from public.user_roles ur where ur.user_id='4d54cf94-bde8-4647-939b-03d1f08f14fc') as roles,
       (select handle from public.creator_profiles cp where cp.user_id='4d54cf94-bde8-4647-939b-03d1f08f14fc') as creator_handle
from public.profiles pr where pr.id='4d54cf94-bde8-4647-939b-03d1f08f14fc';
\echo '-- CABANA table count + RLS-enabled count + policy count'
select
  (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables,
  (select count(*) from pg_policies where schemaname='public') as policies;
\echo '-- key CABANA tables present?'
select string_agg(t, ', ' order by t) as missing_expected_tables from unnest(array['links','products','member_profiles','user_roles','reserved_handles','subscriptions','posts','creator_profiles','activity_events','purchases','tips','payout_requests']) t
where to_regclass('public.'||t) is null;
\echo '-- no scaffold leftovers (fan_profiles/performers/appeals should be gone)?'
select string_agg(t, ', ') as leftover_scaffold from unnest(array['fan_profiles','performers','appeals','chargebacks','support_tickets','age_verifications']) t where to_regclass('public.'||t) is not null;
SQL
echo "===== DRY-RUN COMPLETE ====="
