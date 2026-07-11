-- ============================================================================
-- CABANA — creator_profiles anon column-scoped SELECT (20260532)
--
-- Corrective, additive-only. No table/column/enum/RLS-policy/data change.
--
-- Problem: baseline (20260511) grants the "Public can view creator profiles"
-- SELECT policy USING (true), and 20260525_baseline_grants grants anon a
-- TABLE-WIDE `select on public.creator_profiles`. Together they let any holder
-- of the anon (publishable) key read `creator_profiles.user_id` — the account's
-- auth.users UUID — straight off the base table via PostgREST
-- (GET /rest/v1/creator_profiles?select=user_id). The July-10 app-layer fix
-- (useCreatorByHandle explicit column list) only kept user_id off the app's
-- wire; the raw REST API exposure persisted.
--
-- Fix: replace the anon table-wide SELECT with a COLUMN-SCOPED SELECT covering
-- every public profile column EXCEPT user_id. The public read still works (the
-- public page / discovery select only these columns), auth UUIDs stop leaking
-- to anon, and nothing else changes:
--   * the "Public can view creator profiles" policy is UNCHANGED (still true);
--   * `authenticated` keeps full-table SELECT (owners read their own user_id
--     via useCabana / getMyProfileId — those run authenticated, own-row);
--   * no policy, insert/update grant, column, constraint, or row is touched.
--
-- Column list verified against the live cloud table (rpzaeqoqcaxxavltgvpe) and
-- the repo migrations 20260511 (11 base cols) + 20260528 (headline /
-- accent_color / button_style) on 2026-07-10: 14 columns total, identical on
-- both sides; the 13 below are all of them except user_id.
--
-- Rollback: restore the prior table-wide grant —
--   revoke select on public.creator_profiles from anon;
--   grant  select on public.creator_profiles to   anon;
-- (Additive/idempotent; safe to re-run.)
-- ============================================================================

-- Drop the table-wide anon SELECT (this is what currently exposes user_id).
revoke select on public.creator_profiles from anon;

-- Re-grant anon SELECT on the public profile columns only — user_id omitted.
grant select (
  id,
  handle,
  name,
  bio,
  avatar_url,
  banner_url,
  theme,
  plan,
  created_at,
  updated_at,
  headline,
  accent_color,
  button_style
) on public.creator_profiles to anon;

-- `authenticated` is intentionally left with its full-table SELECT
-- (20260525_baseline_grants) so owner reads of user_id keep working.
