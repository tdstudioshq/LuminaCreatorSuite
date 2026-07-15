-- ============================================================================
-- CABANA — Cloudflare Stream publish integrity (20260541) — video hardening
-- ============================================================================
-- Makes two Stream invariants DATABASE-authoritative, closing the two gaps the
-- app-layer publish gate (post-actions.assertPublishableMediaRows) cannot cover
-- because raw PostgREST bypasses it. Purely additive — no table, column, enum,
-- or policy change; no data change; no application-code dependency.
--
--   A. Publish-readiness trigger on `posts`.
--      `posts` carries a table-wide UPDATE grant (20260514:210) under an
--      ownership-only policy (20260514:175), so a creator can
--      `PATCH /rest/v1/posts?id=eq.<own-id>` with {"status":"published"} and
--      expose a post whose attached video is still processing/errored — no
--      server action involved. A BEFORE trigger rejects that transition when
--      any attached Stream asset is not genuinely READY. The check reads
--      TRUSTED lifecycle state (`stream_videos.status`) — never
--      `post_media.processing_status` (written best-effort, can lag), never a
--      client flag. Fail-closed: a null/missing lifecycle row also blocks.
--      The publish and the check are ATOMIC (one BEFORE trigger on the write).
--
--   B. Narrowed INSERT grant on `stream_videos`.
--      `authenticated` held a TABLE-WIDE INSERT grant (20260536:147) and the
--      INSERT policy checks only ownership (20260536:122), so a creator could
--      raw-insert a row with status='ready' (plus ready_at, dimensions, error
--      fields) — forging provider-controlled state that a publish trigger
--      alone would then trust. Combined with a real Cloudflare asset this is a
--      genuine forge. Narrow the grant to EXACTLY the four columns the ticket
--      flow sets (stream-actions.insertTicketRow), so every provider-controlled
--      column is non-insertable and a forged value is rejected at the PRIVILEGE
--      layer (42501) before RLS runs. status falls to its 'pending_upload'
--      default; the webhook (service_role) stays the only writer that advances
--      it, and authenticated already has NO update grant (20260536), so there
--      is no update forge vector either.
--
-- Why a trigger for A and a grant for B: A must consult OTHER rows
-- (post_media ⋈ stream_videos) at write time — a grant/policy cannot express a
-- cross-table readiness join, so it must be a trigger. B is a single-table
-- column-authority question — a column-scoped grant expresses it declaratively
-- and denies at the privilege layer, which is tighter than any trigger.
--
-- Rollback:
--   drop trigger if exists posts_publish_media_ready on public.posts;
--   drop function if exists public.assert_post_media_publishable();
--   revoke insert on public.stream_videos from authenticated;   -- reset grant
--   grant insert on public.stream_videos to authenticated;      -- (20260536 state)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Publish-readiness trigger on posts
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so the gate reads GROUND TRUTH regardless of the caller's
-- RLS visibility — this is a security boundary, and authoritative lifecycle
-- visibility is exactly what makes it one. It only reads + raises; it never
-- writes or returns data, so definer rights cannot be leveraged for anything
-- else. search_path='' pins every reference to public.*.
create or replace function public.assert_post_media_publishable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Fire ONLY on the transition INTO published — a fresh publish (INSERT as
  -- published, or a status change to published). Editing an already-published
  -- post is deliberately NOT re-checked: a video that errors AFTER a valid
  -- publish must not retroactively block unrelated caption edits. Exposure
  -- happens once, at the transition; that is the moment to gate.
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    -- Block if ANY cloudflare-stream media on this post is not backed by a
    -- genuinely READY stream_videos row. `not exists (... status='ready')`
    -- collapses every failure mode into one fail-closed test:
    --   * pending_upload / processing / error  → no ready row → blocked
    --   * a null stream_video_id (coherence-impossible, but belt)  → blocked
    --   * a missing lifecycle row (FK-impossible, but belt)        → blocked
    -- Image-only posts have no cloudflare-stream media, so the outer EXISTS is
    -- false and they publish unaffected.
    if exists (
      select 1
      from public.post_media pm
      where pm.post_id = new.id
        and pm.storage_bucket = 'cloudflare-stream'
        and not exists (
          select 1
          from public.stream_videos sv
          where sv.id = pm.stream_video_id
            and sv.status = 'ready'
        )
    ) then
      raise exception
        'Cannot publish: an attached video is still processing or unavailable'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Not directly callable — it is a trigger body, not an API.
revoke execute on function public.assert_post_media_publishable()
  from public, anon, authenticated;

drop trigger if exists posts_publish_media_ready on public.posts;
create trigger posts_publish_media_ready
  before insert or update on public.posts
  for each row execute function public.assert_post_media_publishable();

-- ----------------------------------------------------------------------------
-- B. Narrow the stream_videos INSERT grant to the ticket-flow columns
-- ----------------------------------------------------------------------------
-- Revoke-then-column-grant. After this, `authenticated` may INSERT ONLY these
-- four columns; every provider-controlled column (status, ready_at,
-- duration_seconds, size_bytes, width, height, error_code, error_message,
-- created_at) is non-insertable → 42501 on any attempt to set one. The INSERT
-- policy is unchanged and still enforces ownership; SELECT/DELETE grants and
-- the (absent) UPDATE grant are unchanged; service_role is untouched.
revoke insert on public.stream_videos from authenticated;
grant insert (uid, owner_user_id, creator_profile_id, upload_expires_at)
  on public.stream_videos to authenticated;
