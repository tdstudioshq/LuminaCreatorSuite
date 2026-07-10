-- ============================================================================
-- CABANA — corrective grant: service_role SELECT on public.post_media
-- ----------------------------------------------------------------------------
-- `getPostMediaUrls` (src/lib/post-actions.ts) is the ONLY trusted server path
-- allowed to read post media metadata for non-owners: it authorizes the viewer
-- with `can_view_post` under the CALLER's context, then reads `post_media` and
-- signs the private-bucket objects with the service-role client.
--
-- Hosted Supabase grants service_role on public tables through platform
-- default ACLs, but a from-zero rebuild (local Docker, CI, db:validate) does
-- not — there service_role holds only TRUNCATE/REFERENCES/TRIGGER, so the
-- media read fails with 42501 and uploaded post images never render anywhere.
--
-- Additive grant only. No policy/RLS change: post_media stays owner-only for
-- authenticated users and fully revoked for anon; the service-role read is
-- still gated by the `can_view_post` check in the server function.
-- ============================================================================

grant select on public.post_media to service_role;
