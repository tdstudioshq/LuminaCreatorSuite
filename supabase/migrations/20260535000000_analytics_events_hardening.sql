-- ============================================================================
-- CABANA — analytics_events abuse/integrity hardening (20260535)
--
-- Corrective/additive. No RLS-policy and no other-table change. Adds two CHECK
-- constraints (event_type allow-list + metadata-object/payload-size caps), one
-- index, and narrows the anon/authenticated INSERT grant from table-wide to the
-- four intended columns (so id/created_at can no longer be set by clients).
--
-- Problem: analytics_events accepts anonymous inserts for any real creator
-- profile (the intended public link-in-bio tracking path), but the columns are
-- unconstrained, so any visitor with the publishable key can insert:
--   * arbitrary `event_type` strings (schema pollution / fake metrics), and
--   * unbounded `metadata` jsonb and `target_id` text (multi-MB rows -> storage
--     and cost growth).
-- The owner analytics reads filter `profile_id = ? and created_at >= ?` and
-- order by created_at, but the table has NO index, so every dashboard read is a
-- sequential scan + sort that degrades as the table grows (and as spam grows).
--
-- Fix (smallest safe public-beta hardening; preserves legitimate anon tracking):
--   1. Constrain event_type to the exact set the application emits, derived from
--      `CabanaEventType` in src/lib/cabana-analytics.ts (page_view | link_click |
--      product_click) — no invented names.
--   2. Cap attacker-controllable payload: metadata JSON text <= 4 KB and
--      target_id <= 256 chars (legitimate values are a short handle/url/title or
--      a 36-char UUID — orders of magnitude under the caps).
--   3. Add the (profile_id, created_at desc) index the owner reads need.
--
-- The CHECK constraints are added NOT VALID: they are ENFORCED on all new/updated
-- rows (the security goal) but skip validating pre-existing rows, so a later
-- cloud apply cannot fail on historical rows written through the pre-fix open
-- grant. (A `VALIDATE CONSTRAINT` after a cloud junk-row scan is an optional
-- follow-up.) Invalid/nonexistent profile targets are already blocked by the FK
-- + the "Visitors can record events on real profiles" INSERT policy — unchanged.
--
-- Rollback:
--   revoke insert (profile_id, event_type, target_id, metadata)
--     on public.analytics_events from anon, authenticated;
--   grant insert on public.analytics_events to anon, authenticated;
--   drop index if exists public.analytics_events_profile_created_idx;
--   alter table public.analytics_events drop constraint if exists analytics_events_event_type_check;
--   alter table public.analytics_events drop constraint if exists analytics_events_payload_size_check;
-- ============================================================================

-- 1. event_type allow-list (mirrors CabanaEventType).
alter table public.analytics_events
  add constraint analytics_events_event_type_check
  check (event_type in ('page_view', 'link_click', 'product_click'))
  not valid;

-- 2. Payload shape + size caps on the attacker-controllable fields. metadata
--    must be a JSON OBJECT (the app always sends an object; blocks arrays/
--    scalars/strings used to smuggle large payloads past intent).
alter table public.analytics_events
  add constraint analytics_events_payload_size_check
  check (
    jsonb_typeof(metadata) = 'object'
    and length(metadata::text) <= 4096
    and (target_id is null or char_length(target_id) <= 256)
  )
  not valid;

-- 3. Index the owner-analytics access path (profile_id + created_at range/order).
create index if not exists analytics_events_profile_created_idx
  on public.analytics_events (profile_id, created_at desc);

-- 4. Column-scoped INSERT: client roles may set only the four intended columns.
--    This supersedes the table-wide anon/authenticated INSERT grant (20260525)
--    so a caller can no longer set `id` or `created_at` explicitly — those are
--    always the column defaults (gen_random_uuid() / now()), which stops event
--    backdating/future-dating that would skew the time-bucketed dashboards.
--    RLS is orthogonal to column privileges, so the "Visitors can record events
--    on real profiles" INSERT policy still applies unchanged. The app inserts
--    exactly these columns (src/lib/cabana-analytics.ts), so legitimate tracking
--    is preserved; authenticated SELECT (owner reads) is untouched.
revoke insert on public.analytics_events from anon, authenticated;
grant insert (profile_id, event_type, target_id, metadata)
  on public.analytics_events to anon, authenticated;
