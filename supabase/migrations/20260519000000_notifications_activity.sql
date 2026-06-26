-- ============================================================================
-- CABANA — Phase 7: Notifications & Activity foundation (DEMO / internal only)
-- ============================================================================
-- The internal event/outbox foundation that powers in-app alerts, unread
-- badges, activity feeds, and a FUTURE email/push pipeline. Purely additive.
--
-- NO external delivery: no Resend, Firebase, Expo, web push, or any provider.
-- `notification_outbox` is an inert queue (rows are created but never processed
-- by this phase). Event generation is implemented at the DATABASE layer as
-- AFTER INSERT triggers on the existing source tables (follows, post_likes,
-- post_comments, post_saves, creator_subscriptions, tips, purchases, messages,
-- payout_requests). Triggers are the safest server-side point: atomic with the
-- action, uniform across both direct-insert and SECURITY DEFINER RPC write
-- paths, and idempotent via source-row uniqueness + a per-notification
-- `dedupe_key`. No existing Phase 2–6 action files are modified.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.notification_type as enum (
    'new_follower', 'post_liked', 'post_commented', 'post_saved', 'new_subscriber',
    'tip_received', 'purchase_made', 'message_received', 'payout_requested', 'system'
  );
exception when duplicate_object then null; end $$;

-- Canonical activity log type. Mirrors notification_type (plus room to grow for
-- internal-only events that never surface as a user notification).
do $$ begin
  create type public.activity_type as enum (
    'new_follower', 'post_liked', 'post_commented', 'post_saved', 'new_subscriber',
    'tip_received', 'purchase_made', 'message_received', 'payout_requested', 'system'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_channel as enum ('in_app', 'email', 'push');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.outbox_status as enum ('pending', 'sent', 'failed', 'skipped', 'canceled');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
-- 1a. notifications — in-app notifications for a recipient. System/trigger-written
-- only (no client INSERT). `dedupe_key` (NOT NULL UNIQUE) makes generation
-- idempotent: re-firing the same event is a no-op.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type public.notification_type not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  constraint notifications_dedupe_key_unique unique (dedupe_key),
  constraint notifications_title_len check (char_length(title) <= 300),
  constraint notifications_body_len check (body is null or char_length(body) <= 1000)
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id) where read_at is null;

-- 1b. activity_events — canonical internal activity log (append-only). Every
-- generated event is logged here regardless of whether it surfaces as a user
-- notification.
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  recipient_id uuid references public.profiles (id) on delete set null,
  type public.activity_type not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_recipient_idx
  on public.activity_events (recipient_id, created_at desc);
create index if not exists activity_events_actor_idx
  on public.activity_events (actor_id, created_at desc);

-- 1c. notification_preferences — per-user settings. `email_enabled` / `push_enabled`
-- are placeholders for the future delivery pipeline (no provider exists yet).
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_notification_preferences_updated_at on public.notification_preferences;
create trigger touch_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

-- 1d. notification_outbox — future email/push delivery queue. Inert in this phase
-- (rows created from preferences but never processed). Not user-readable.
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel public.notification_channel not null,
  status public.outbox_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  scheduled_for timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_outbox_channel_unique unique (notification_id, channel)
);

create index if not exists notification_outbox_status_idx
  on public.notification_outbox (status, scheduled_for);

-- ----------------------------------------------------------------------------
-- 2. Helpers (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
-- Best available display name for a user (creator name → member display/username
-- → profile name → 'Someone').
create or replace function public.notif_display_name(_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select cp.name from public.creator_profiles cp
       where cp.user_id = _user_id and cp.name is not null limit 1),
    (select mp.display_name from public.member_profiles mp
       where mp.user_id = _user_id and mp.display_name is not null limit 1),
    (select mp.username from public.member_profiles mp where mp.user_id = _user_id limit 1),
    (select pr.name from public.profiles pr where pr.id = _user_id),
    'Someone'
  )
$$;

-- True if the recipient has blocked the actor (suppress notifications across a block).
create or replace function public.notif_is_blocked(_recipient_id uuid, _actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where b.blocker_id = _recipient_id and b.blocked_user_id = _actor_id
  )
$$;

-- Central emitter. Always logs an activity_event. When `_notify` and the
-- recipient is eligible (exists, not self, not blocked, in-app enabled), inserts
-- an idempotent notification (ON CONFLICT (dedupe_key) DO NOTHING) and, for each
-- enabled future channel (email/push), an inert outbox row.
create or replace function public.emit_notification(
  _recipient_id uuid,
  _actor_id uuid,
  _type public.notification_type,
  _title text,
  _body text,
  _entity_type text,
  _entity_id uuid,
  _metadata jsonb,
  _dedupe_key text,
  _notify boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in_app boolean := true;
  v_email boolean := false;
  v_push boolean := false;
  v_notif_id uuid;
begin
  -- Canonical log (always), regardless of recipient eligibility.
  insert into public.activity_events (actor_id, recipient_id, type, entity_type, entity_id, metadata)
  values (_actor_id, _recipient_id, _type::text::public.activity_type, _entity_type, _entity_id,
          coalesce(_metadata, '{}'::jsonb));

  if not _notify or _recipient_id is null then
    return;
  end if;
  -- No self-notifications (actor null = system/self event is allowed through).
  if _actor_id is not null and _actor_id = _recipient_id then
    return;
  end if;
  if _actor_id is not null and public.notif_is_blocked(_recipient_id, _actor_id) then
    return;
  end if;

  select np.in_app_enabled, np.email_enabled, np.push_enabled
    into v_in_app, v_email, v_push
  from public.notification_preferences np where np.user_id = _recipient_id;
  if not found then
    v_in_app := true; v_email := false; v_push := false;
  end if;

  if not v_in_app then
    return;
  end if;

  insert into public.notifications
    (recipient_id, actor_id, type, title, body, entity_type, entity_id, dedupe_key)
  values
    (_recipient_id, _actor_id, _type, _title, _body, _entity_type, _entity_id, _dedupe_key)
  on conflict (dedupe_key) do nothing
  returning id into v_notif_id;

  -- Already emitted (dedupe) → do not duplicate outbox rows either.
  if v_notif_id is null then
    return;
  end if;

  if v_email then
    insert into public.notification_outbox (notification_id, channel)
    values (v_notif_id, 'email') on conflict (notification_id, channel) do nothing;
  end if;
  if v_push then
    insert into public.notification_outbox (notification_id, channel)
    values (v_notif_id, 'push') on conflict (notification_id, channel) do nothing;
  end if;
end;
$$;

revoke execute on function public.notif_display_name(uuid) from public, anon, authenticated;
revoke execute on function public.notif_is_blocked(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.emit_notification(uuid, uuid, public.notification_type, text, text, text, uuid, jsonb, text, boolean)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Event-generation triggers (AFTER INSERT on source tables)
-- ----------------------------------------------------------------------------
-- new_follower
create or replace function public.on_follow_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid; v_actor_name text;
begin
  select cp.user_id into v_recipient from public.creator_profiles cp
  where cp.id = new.following_creator_id;
  v_actor_name := public.notif_display_name(new.follower_id);
  perform public.emit_notification(
    v_recipient, new.follower_id, 'new_follower',
    v_actor_name || ' started following you', null,
    'creator', new.following_creator_id,
    jsonb_build_object('actor_name', v_actor_name),
    'new_follower:' || new.following_creator_id::text || ':' || new.follower_id::text
  );
  return null;
end;
$$;

drop trigger if exists notify_on_follow on public.follows;
create trigger notify_on_follow after insert on public.follows
  for each row execute function public.on_follow_notify();

-- post_liked
create or replace function public.on_like_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid; v_actor_name text;
begin
  select cp.user_id into v_recipient
  from public.posts p join public.creator_profiles cp on cp.id = p.creator_profile_id
  where p.id = new.post_id;
  v_actor_name := public.notif_display_name(new.user_id);
  perform public.emit_notification(
    v_recipient, new.user_id, 'post_liked',
    v_actor_name || ' liked your post', null,
    'post', new.post_id,
    jsonb_build_object('actor_name', v_actor_name),
    'post_liked:' || new.post_id::text || ':' || new.user_id::text
  );
  return null;
end;
$$;

drop trigger if exists notify_on_like on public.post_likes;
create trigger notify_on_like after insert on public.post_likes
  for each row execute function public.on_like_notify();

-- post_commented (visible comments only)
create or replace function public.on_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid; v_actor_name text;
begin
  if new.status <> 'visible' then
    return null;
  end if;
  select cp.user_id into v_recipient
  from public.posts p join public.creator_profiles cp on cp.id = p.creator_profile_id
  where p.id = new.post_id;
  v_actor_name := public.notif_display_name(new.author_id);
  perform public.emit_notification(
    v_recipient, new.author_id, 'post_commented',
    v_actor_name || ' commented on your post', left(new.body, 140),
    'post', new.post_id,
    jsonb_build_object('actor_name', v_actor_name, 'comment_id', new.id),
    'post_commented:' || new.id::text
  );
  return null;
end;
$$;

drop trigger if exists notify_on_comment on public.post_comments;
create trigger notify_on_comment after insert on public.post_comments
  for each row execute function public.on_comment_notify();

-- post_saved
create or replace function public.on_save_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid; v_actor_name text;
begin
  select cp.user_id into v_recipient
  from public.posts p join public.creator_profiles cp on cp.id = p.creator_profile_id
  where p.id = new.post_id;
  v_actor_name := public.notif_display_name(new.user_id);
  perform public.emit_notification(
    v_recipient, new.user_id, 'post_saved',
    v_actor_name || ' saved your post', null,
    'post', new.post_id,
    jsonb_build_object('actor_name', v_actor_name),
    'post_saved:' || new.post_id::text || ':' || new.user_id::text
  );
  return null;
end;
$$;

drop trigger if exists notify_on_save on public.post_saves;
create trigger notify_on_save after insert on public.post_saves
  for each row execute function public.on_save_notify();

-- new_subscriber
create or replace function public.on_subscription_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid; v_actor_name text;
begin
  select cp.user_id into v_recipient from public.creator_profiles cp
  where cp.id = new.creator_profile_id;
  v_actor_name := public.notif_display_name(new.member_user_id);
  perform public.emit_notification(
    v_recipient, new.member_user_id, 'new_subscriber',
    v_actor_name || ' subscribed to you', null,
    'creator', new.creator_profile_id,
    jsonb_build_object('actor_name', v_actor_name, 'price_cents', new.price_cents,
                       'currency', new.currency),
    'new_subscriber:' || new.id::text
  );
  return null;
end;
$$;

drop trigger if exists notify_on_subscription on public.creator_subscriptions;
create trigger notify_on_subscription after insert on public.creator_subscriptions
  for each row execute function public.on_subscription_notify();

-- tip_received
create or replace function public.on_tip_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid; v_actor_name text;
begin
  select cp.user_id into v_recipient from public.creator_profiles cp
  where cp.id = new.creator_profile_id;
  v_actor_name := public.notif_display_name(new.sender_user_id);
  perform public.emit_notification(
    v_recipient, new.sender_user_id, 'tip_received',
    v_actor_name || ' sent you a tip', new.message,
    'tip', new.id,
    jsonb_build_object('actor_name', v_actor_name, 'amount_cents', new.amount_cents,
                       'currency', new.currency),
    'tip_received:' || new.id::text
  );
  return null;
end;
$$;

drop trigger if exists notify_on_tip on public.tips;
create trigger notify_on_tip after insert on public.tips
  for each row execute function public.on_tip_notify();

-- purchase_made
create or replace function public.on_purchase_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid; v_actor_name text;
begin
  if new.creator_profile_id is null then
    return null;
  end if;
  select cp.user_id into v_recipient from public.creator_profiles cp
  where cp.id = new.creator_profile_id;
  v_actor_name := public.notif_display_name(new.buyer_user_id);
  perform public.emit_notification(
    v_recipient, new.buyer_user_id, 'purchase_made',
    v_actor_name || ' unlocked your post', null,
    'post', new.post_id,
    jsonb_build_object('actor_name', v_actor_name, 'amount_cents', new.amount_cents,
                       'currency', new.currency),
    'purchase_made:' || new.id::text
  );
  return null;
end;
$$;

drop trigger if exists notify_on_purchase on public.purchases;
create trigger notify_on_purchase after insert on public.purchases
  for each row execute function public.on_purchase_notify();

-- message_received (one notification per recipient participant; skip system/deleted)
create or replace function public.on_message_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor_name text; v_participant uuid;
begin
  if new.message_type = 'system' or new.deleted_at is not null then
    return null;
  end if;
  v_actor_name := public.notif_display_name(new.sender_id);
  for v_participant in
    select cp.user_id from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id and cp.user_id <> new.sender_id
  loop
    perform public.emit_notification(
      v_participant, new.sender_id, 'message_received',
      v_actor_name || ' sent you a message', left(coalesce(new.body, ''), 140),
      'conversation', new.conversation_id,
      jsonb_build_object('actor_name', v_actor_name, 'message_id', new.id),
      'message_received:' || new.id::text || ':' || v_participant::text
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message after insert on public.messages
  for each row execute function public.on_message_notify();

-- payout_requested (creator/admin pipeline: activity + self-notification; actor null)
create or replace function public.on_payout_request_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid;
begin
  select cp.user_id into v_recipient from public.creator_profiles cp
  where cp.id = new.creator_profile_id;
  perform public.emit_notification(
    v_recipient, null, 'payout_requested',
    'Payout requested', null,
    'payout', new.id,
    jsonb_build_object('amount_cents', new.amount_cents, 'currency', new.currency,
                       'creator_profile_id', new.creator_profile_id),
    'payout_requested:' || new.id::text
  );
  return null;
end;
$$;

drop trigger if exists notify_on_payout_request on public.payout_requests;
create trigger notify_on_payout_request after insert on public.payout_requests
  for each row execute function public.on_payout_request_notify();

-- ----------------------------------------------------------------------------
-- 4. RLS + grants
-- ----------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.activity_events enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;

-- notifications: a user reads only their own; updates only their own (read_at);
-- admins read all. No client INSERT/DELETE (system/trigger-written only).
create policy "Users read own notifications"
  on public.notifications for select
  using (recipient_id = (select auth.uid()));
create policy "Admins read all notifications"
  on public.notifications for select
  using ((select public.is_current_user_admin()));
create policy "Users update own notifications"
  on public.notifications for update
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- activity_events: a user reads events about/by them; admins read all.
create policy "Users read own activity"
  on public.activity_events for select
  using (recipient_id = (select auth.uid()) or actor_id = (select auth.uid()));
create policy "Admins read all activity"
  on public.activity_events for select
  using ((select public.is_current_user_admin()));

-- notification_preferences: a user fully manages only their own row.
create policy "Users read own preferences"
  on public.notification_preferences for select
  using (user_id = (select auth.uid()));
create policy "Users insert own preferences"
  on public.notification_preferences for insert
  with check (user_id = (select auth.uid()));
create policy "Users update own preferences"
  on public.notification_preferences for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- notification_outbox: NOT user-readable; admins only (internal delivery queue).
create policy "Admins read outbox"
  on public.notification_outbox for select
  using ((select public.is_current_user_admin()));

-- Column-scoped update: users may only flip read_at on their notifications.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.activity_events to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.notification_outbox to authenticated; -- RLS limits to admins

revoke all on public.notifications from anon;
revoke all on public.activity_events from anon;
revoke all on public.notification_preferences from anon;
revoke all on public.notification_outbox from anon;

-- ----------------------------------------------------------------------------
-- 5. Realtime — publish notifications (RLS still gates delivery to recipient)
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
