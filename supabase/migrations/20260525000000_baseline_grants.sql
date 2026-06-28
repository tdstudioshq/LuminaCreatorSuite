-- ============================================================================
-- CABANA — baseline table privilege grants (corrective, additive)
-- ----------------------------------------------------------------------------
-- The original baseline migration (20260511000000_baseline.sql) enabled RLS and
-- created policies on its tables but never issued table-level GRANTs to the
-- PostgREST roles. RLS policies are evaluated only AFTER the role passes the
-- table privilege check, so without a GRANT, anon/authenticated calls fail with
-- `42501 permission denied` before any policy runs — the public creator page
-- (`/$username`) and the entire dashboard (creator_profiles/links/products and
-- the role/subscription reads) are unreachable on a freshly built database.
--
-- Every migration from Phase 3 onward grants explicitly (e.g.
-- `grant select on public.posts to anon, authenticated;`); the seven baseline
-- tables were simply never backfilled. This migration adds exactly those grants,
-- mirroring each table's existing RLS policy intent (no policy is added or
-- changed here — RLS already constrains which rows each role may touch):
--
--   creator_profiles  SELECT USING(true)            -> anon, authenticated read
--                     INSERT/UPDATE auth.uid()=owner -> authenticated write
--   links / products  SELECT USING(true)            -> anon, authenticated read
--                     ALL (owner)                    -> authenticated write
--   reserved_handles  SELECT USING(true)            -> anon, authenticated read
--   subscriptions     SELECT auth.uid()=owner        -> authenticated read
--   user_roles        SELECT self/admin, ALL admin   -> authenticated read+write
--   analytics_events  INSERT public, SELECT owner    -> anon insert, owner read
--
-- GRANT is idempotent (re-granting an existing privilege is a no-op), so this
-- migration is safe to re-apply. service_role is intentionally untouched: it is
-- granted out-of-band by Supabase's default ACLs, matching the existing pattern
-- in the Phase 3+ migrations (none of which grant service_role explicitly).
-- ============================================================================

-- creator_profiles: public profile read; owner-only insert/update (no delete
-- policy exists — profile removal happens via the auth.users cascade).
grant select on public.creator_profiles to anon, authenticated;
grant insert, update on public.creator_profiles to authenticated;

-- links: public read (rendered on the public page); owner full write.
grant select on public.links to anon, authenticated;
grant insert, update, delete on public.links to authenticated;

-- products: public read (storefront on the public page); owner full write.
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

-- reserved_handles: public read only (handle availability checks); no writes.
grant select on public.reserved_handles to anon, authenticated;

-- subscriptions (CABANA SaaS plan): owner read only; rows are written by the
-- handle_new_user SECURITY DEFINER trigger, so no client write grant.
grant select on public.subscriptions to authenticated;

-- user_roles: self/admin read and admin-only write (both governed by RLS).
grant select, insert, update, delete on public.user_roles to authenticated;

-- analytics_events: anyone may record an event for a real creator profile
-- (INSERT policy), while only the owning creator may read their events.
grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;
