-- ============================================================================
-- CABANA — Cloudflare Stream DB contract (20260536) — video Checkpoint 2
-- ============================================================================
-- Adds the ownership + lifecycle model for Cloudflare Stream video while
-- changing NOTHING about existing post / image / feed / entitlement behavior.
-- Purely additive:
--   * `stream_video_status` enum (pending_upload → processing → ready|error)
--   * `stream_videos` — the upload ledger. A row exists from the moment an
--     upload ticket is issued (BEFORE any bytes move), which is what makes
--     orphaned Cloudflare assets discoverable and sweepable later.
--   * `post_media.stream_video_id` (nullable) + a COMPOSITE ownership FK
--     (stream_video_id, owner_user_id) → stream_videos (id, owner_user_id):
--     because the existing 20260533 WITH CHECK already forces
--     owner_user_id = auth.uid(), the FK makes it DECLARATIVELY impossible to
--     attach another creator's stream video — with zero policy changes.
--   * a coherence CHECK tying the sentinel bucket 'cloudflare-stream' to the
--     FK, and a partial unique index (one attachment per stream video, ever).
--
-- The 20260533 post_media policy is intentionally UNTOUCHED. Stream rows use
-- storage_path '<owner_user_id>/stream/<cloudflare_uid>', whose first segment
-- satisfies that policy's split_part(...) = auth.uid() check by construction.
-- Feed RPCs aggregate post_media by post_id with no bucket filter, so video
-- rows flow through the existing ID-free media JSON unchanged.
--
-- Lifecycle writes (status flips from the webhook/poller — Checkpoint 3) are
-- SYSTEM writes: clients have NO update path (no policy, no grant); the
-- service role gets explicit grants because from-zero rebuilds have no
-- platform ACLs (the 20260529 lesson).
--
-- NO Cloudflare API interaction, seed data, RPC, or application code here.
--
-- Rollback (destructive only to stream data; nothing else depends on it):
--   drop index if exists post_media_stream_video_uniq;
--   alter table public.post_media drop constraint if exists post_media_stream_coherence;
--   alter table public.post_media drop constraint if exists post_media_stream_video_owner_fk;
--   alter table public.post_media drop column if exists stream_video_id;
--   drop table if exists public.stream_videos;
--   drop type if exists public.stream_video_status;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enum (idempotent, house pattern)
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.stream_video_status as enum
    ('pending_upload', 'processing', 'ready', 'error');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. stream_videos — the upload ledger
-- ----------------------------------------------------------------------------
-- owner_user_id is the AUTH user id (profiles.id references auth.users(id)),
-- so RLS can compare it to auth.uid() directly — same model as post_media.
-- Numeric CHECKs mirror exactly what the pure parser (cabana-stream.ts) can
-- emit: Cloudflare's -1 "unknown" sentinels are mapped to NULL before any DB
-- write, so stored values are always >= 0. `>= 0` (not `> 0`) is deliberate:
-- a webhook write must never stall the ready-flip over an undocumented
-- zero-dimension payload (see the test file header for the full rationale).
create table if not exists public.stream_videos (
  id                 uuid primary key default gen_random_uuid(),
  uid                text not null unique,
  owner_user_id      uuid not null references public.profiles (id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  status             public.stream_video_status not null default 'pending_upload',
  duration_seconds   numeric,
  size_bytes         bigint,
  width              integer,
  height             integer,
  error_code         text,
  error_message      text,
  upload_expires_at  timestamptz,
  ready_at           timestamptz,
  created_at         timestamptz not null default now(),
  -- Composite target for the post_media ownership FK below.
  constraint stream_videos_id_owner_uniq unique (id, owner_user_id),
  constraint stream_videos_duration_nonneg check (duration_seconds is null or duration_seconds >= 0),
  constraint stream_videos_size_nonneg check (size_bytes is null or size_bytes >= 0),
  constraint stream_videos_width_nonneg check (width is null or width >= 0),
  constraint stream_videos_height_nonneg check (height is null or height >= 0),
  -- ready_at only ever appears on a ready row (one-directional on purpose:
  -- a ready-flip that omits ready_at must not stall the lifecycle).
  constraint stream_videos_ready_at_coherent check (ready_at is null or status = 'ready')
);

-- Quota check at ticket time: count of the caller's active uploads —
--   select count(*) from stream_videos
--   where owner_user_id = ? and status in ('pending_upload','processing');
create index if not exists stream_videos_owner_status_idx
  on public.stream_videos (owner_user_id, status);

-- Rolling 24h quota at ticket time: count of the caller's recent tickets —
--   select count(*) from stream_videos
--   where owner_user_id = ? and created_at > now() - interval '24 hours';
create index if not exists stream_videos_owner_created_idx
  on public.stream_videos (owner_user_id, created_at desc);

-- Stale-upload sweep: expired tickets that never uploaded —
--   select * from stream_videos
--   where status = 'pending_upload' and upload_expires_at < now();
create index if not exists stream_videos_pending_expiry_idx
  on public.stream_videos (upload_expires_at)
  where status = 'pending_upload';

-- FK-cascade support for creator_profiles deletions (owner_user_id cascades
-- are covered by the leading column of stream_videos_owner_status_idx).
create index if not exists stream_videos_creator_profile_idx
  on public.stream_videos (creator_profile_id);

-- ----------------------------------------------------------------------------
-- 2. RLS — owner-scoped reads/inserts/deletes; NO client update path
-- ----------------------------------------------------------------------------
alter table public.stream_videos enable row level security;

create policy "Owners read own stream videos"
  on public.stream_videos for select
  using (owner_user_id = (select auth.uid()));

-- INSERT: the row must be owned by the caller AND its creator_profile_id must
-- be the CALLER's creator profile (is_current_user_creator is the established
-- SECURITY DEFINER helper: creator_profiles.user_id = auth.uid()). A member
-- account (no creator profile) can never satisfy the second predicate.
create policy "Creators insert own stream videos"
  on public.stream_videos for insert
  with check (
    owner_user_id = (select auth.uid())
    and public.is_current_user_creator(creator_profile_id)
  );

create policy "Owners delete own stream videos"
  on public.stream_videos for delete
  using (owner_user_id = (select auth.uid()));

-- Deliberately NO update policy: status/metadata are system-written by the
-- lifecycle writer (webhook/poller via service role). Clients also get no
-- UPDATE grant, so a direct PostgREST PATCH fails at the privilege layer
-- before RLS is even consulted.

-- ----------------------------------------------------------------------------
-- 3. Grants — explicit; from-zero rebuilds have no platform ACLs (20260529)
-- ----------------------------------------------------------------------------
-- Revoke-then-grant on purpose: HOSTED Supabase auto-grants ALL on new public
-- tables via platform default privileges (the inverse of the 20260529 lesson),
-- so without the explicit revoke, `authenticated` would silently keep UPDATE
-- on the cloud backend — RLS would still block every row, but the intended
-- privilege-layer denial (42501) would hold only on local rebuilds.
revoke all on public.stream_videos from public, anon, authenticated;
grant select, insert, delete on public.stream_videos to authenticated;
-- Lifecycle writer (webhook/status-poll/sweep, Checkpoint 3): reads rows by
-- uid, updates status/metadata, deletes swept orphans. No INSERT — tickets
-- are inserted under the caller's RLS, never by the service role.
grant select, update, delete on public.stream_videos to service_role;

-- The same lifecycle writer flips the linked post_media row's processing
-- state (and records dimensions) when Cloudflare reports ready/error.
-- Column-scoped on purpose: the service role gets no path to move a media
-- row between posts/owners or rewrite storage paths.
grant update (processing_status, width, height) on public.post_media to service_role;

-- ----------------------------------------------------------------------------
-- 4. post_media linkage — additive column + declarative ownership
-- ----------------------------------------------------------------------------
alter table public.post_media add column if not exists stream_video_id uuid;

-- Composite ownership FK. ON DELETE CASCADE is safe here because post_media
-- is pure render metadata (no financial/audit data): if the underlying video
-- row is removed (creator delete or orphan sweep), a dangling media row would
-- only ever render a broken player. The REVERSE direction is intentionally
-- not cascaded — deleting a post removes its post_media rows (existing
-- post_id FK) but leaves the stream_videos row intact as an unattached,
-- sweepable ledger entry.
do $$ begin
  alter table public.post_media
    add constraint post_media_stream_video_owner_fk
    foreign key (stream_video_id, owner_user_id)
    references public.stream_videos (id, owner_user_id)
    on delete cascade;
exception when duplicate_object then null; end $$;

-- Sentinel bucket and FK can never drift apart: a Stream row cannot
-- masquerade as a Supabase Storage row (and vice versa). Existing image rows
-- (storage_bucket 'post-media', stream_video_id NULL) satisfy this as
-- false = false.
do $$ begin
  alter table public.post_media
    add constraint post_media_stream_coherence
    check ((storage_bucket = 'cloudflare-stream') = (stream_video_id is not null));
exception when duplicate_object then null; end $$;

-- One stream video attaches to at most one post_media row AT A TIME (after a
-- detach, the video could re-attach — in practice the app deletes the ledger
-- row with the media, so this never occurs). One-live-attachment is exactly
-- what makes the delete story sound: removing one post's media can safely
-- remove the Cloudflare asset without breaking another post. Also serves as
-- the referencing-side index for the composite FK's cascade lookups.
create unique index if not exists post_media_stream_video_uniq
  on public.post_media (stream_video_id)
  where stream_video_id is not null;
