-- ============================================================================
-- DRY-RUN HARNESS ONLY — reproduces the verified cabanadatabase scaffold on a
-- fresh/empty local Postgres so 01_pre_migrations_reset.sql + 02 backfill can be
-- exercised for real. NOT part of the reconciliation plan; never runs on cloud.
--
-- Mirrors the live state introspected 2026-07-07:
--   * 26 public enums (exact labels)
--   * public.profiles scaffold shape + the 1 real admin row + its 3 RLS policies
--   * the 50 other scaffold tables (empty stubs — DROP only needs the name)
--   * set_updated_at() + a trigger using it
--   * storage buckets (avatars public + 4 private) and 2 sample policies
--   * one auth.users row matching the admin (id 4d54cf94…)
-- Simplifications (honest, don't affect what 01/02 exercise): stub tables carry
-- only an id column; scaffold FKs/columns beyond profiles are omitted.
-- ============================================================================

-- Assumes a clean/empty `public` (the driver drops+recreates it first).

create extension if not exists pgcrypto;

-- --- 26 enums, exact live labels -------------------------------------------
create type public.admin_scope as enum ('moderation','finance','compliance');
create type public.appeal_kind as enum ('suspension','ban','content_removal','verification');
create type public.appeal_status as enum ('open','info_requested','approved','denied');
create type public.compliance_status as enum ('pending','approved','rejected','needs_review');
create type public.creator_verification_kind as enum ('identity','business');
create type public.creator_verification_status as enum ('pending','approved','rejected','info_requested','expired','reverification_required','identity_mismatch');
create type public.invoice_status as enum ('paid','failed','open','refunded','void');
create type public.media_processing_status as enum ('pending','uploading','processing','ready','failed','rejected');
create type public.media_type as enum ('image','video','audio','file');
create type public.note_category as enum ('general','moderation','payments','legal');
create type public.note_subject_type as enum ('user','report','appeal','support_ticket');
create type public.payout_status as enum ('requested','approved','paid','declined','on_hold','canceled','failed');
create type public.post_status as enum ('draft','scheduled','published','archived','deleted');
create type public.post_visibility as enum ('public','subscribers','ppv');
create type public.report_content_kind as enum ('image','video','text','comment','bio','display_name','link','profile');
create type public.report_priority as enum ('low','medium','high','critical');
create type public.report_status as enum ('open','assigned','resolved','dismissed','escalated');
create type public.report_subject_type as enum ('post','comment','message','profile','media');
create type public.risk_disposition as enum ('flagged','monitoring','cleared');
create type public.subscription_status as enum ('active','canceled','past_due','expired');
create type public.ticket_priority as enum ('low','normal','high','urgent');
create type public.ticket_status as enum ('open','pending','resolved','closed');
create type public.transaction_type as enum ('subscription','tip','ppv_unlock','refund','chargeback','payout','platform_fee','processor_fee','adjustment');
create type public.user_role as enum ('fan','creator','admin');
create type public.verification_document_kind as enum ('id','selfie','business');
create type public.verification_status as enum ('not_started','pending','approved','rejected','expired');

-- --- set_updated_at() (exact live body) ------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path to '' as $function$
begin new.updated_at = now(); return new; end;
$function$;

-- --- auth.users row for the pre-existing admin -----------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values ('00000000-0000-0000-0000-000000000000',
  '4d54cf94-bde8-4647-939b-03d1f08f14fc', 'authenticated', 'authenticated',
  'tyler.diorio@gmail.com', crypt('dryrun-only', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{"name":"tyler.diorio"}', false)
on conflict (id) do nothing;

-- --- public.profiles (scaffold shape) + real admin row + RLS ---------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  role public.user_role not null default 'fan',
  admin_scopes public.admin_scope[] not null default '{}',
  display_name text not null,
  username text not null,
  email text not null,
  avatar_url text, banner_url text, bio text,
  date_of_birth date, age_verified_at timestamptz,
  suspended_at timestamptz, suspension_reason text, deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.profiles (id, auth_user_id, role, admin_scopes, display_name, username, email, created_at, updated_at)
values ('169fb401-481a-4bb2-abe3-aa9a95f282b7', '4d54cf94-bde8-4647-939b-03d1f08f14fc',
  'admin', '{moderation,finance,compliance}', 'tyler.diorio', 'tyler_diorio',
  'tyler.diorio@gmail.com', '2026-07-06 23:47:35.294864+00', '2026-07-06 23:47:35.294864+00');

alter table public.profiles enable row level security;
create policy profiles_select_own_or_admin on public.profiles for select using (auth.uid() = auth_user_id);
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = auth_user_id);
create policy profiles_update_own on public.profiles for update using (auth.uid() = auth_user_id);
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- --- the 50 other scaffold tables (empty stubs) ----------------------------
-- 01's guard scans exactly these; DROP ... CASCADE only needs the names to exist.
do $$
declare t text; scaffold text[] := array[
  'admin_notes','age_verifications','analytics_events','appeal_events','appeals',
  'audit_logs','blocks','chargebacks','collections','compliance_records',
  'content_entitlements','content_performers','conversations','creator_balances',
  'creator_profiles','creator_subscription_tiers','creator_subscriptions',
  'creator_verification_documents','creator_verification_events',
  'creator_verification_requests','creator_verifications','fan_profiles',
  'feature_flags','follows','fraud_signal_events','invoices','message_read_receipts',
  'messages','notification_outbox','notification_preferences','notifications',
  'payment_methods','payouts','performers','platform_config','poll_options',
  'poll_votes','post_comments','post_likes','post_media','post_saves','posts',
  'refund_requests','reports','risk_status','strikes','support_tickets',
  'takedown_requests','transactions','user_warnings'];
begin
  foreach t in array scaffold loop
    execute format('create table public.%I (id uuid primary key default gen_random_uuid())', t);
  end loop;
end $$;

-- Sample RLS + policies on collision tables, to prove they drop via CASCADE.
alter table public.posts enable row level security;
create policy posts_stub_read on public.posts for select using (true);
alter table public.reports enable row level security;
create policy reports_stub_read on public.reports for select using (true);
alter table public.creator_profiles enable row level security;
create policy creator_profiles_stub_read on public.creator_profiles for select using (true);

-- --- storage buckets + 2 sample policies (mirrors live) --------------------
insert into storage.buckets (id, name, public) values
  ('avatars','avatars',true),
  ('creator-media','creator-media',false),
  ('message-media','message-media',false),
  ('verification-documents','verification-documents',false),
  ('compliance-documents','compliance-documents',false)
on conflict (id) do nothing;
create policy avatars_owner_list on storage.objects for select
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy creator_media_creator_write on storage.objects for insert
  with check (bucket_id = 'creator-media' and auth.uid()::text = (storage.foldername(name))[1]);
