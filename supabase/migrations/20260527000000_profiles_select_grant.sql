-- ============================================================================
-- Corrective grant: public.profiles was missing a table-level SELECT privilege
-- for the `authenticated` role.
--
-- public.profiles has an own-row SELECT policy ("Users can view own profile",
-- USING auth.uid() = id) but no GRANT, so PostgREST denied authenticated
-- reads with 42501/403 before RLS was ever evaluated — which made
-- useAccountType() fail and the dashboard guard hang on "Securing your studio…"
-- through the react-query retry window. The 20260525000000_baseline_grants.sql
-- corrective pass covered the seven baseline tables but not public.profiles.
--
-- This mirrors the existing RLS intent (own-row only). anon is intentionally
-- NOT granted — profiles stays private (account_type, email); public creator
-- data is served through creator_profiles / the public_* views.
-- ============================================================================

grant select on public.profiles to authenticated;
