-- ============================================================================
-- CABANA — post_media service-role grant behavioral checks (20260529):
--   * service_role can SELECT public.post_media (the getPostMediaUrls path)
--   * anon still has no direct read on public.post_media (leak-proof design)
--   * authenticated keeps owner-scoped table access (grant unchanged)
-- Runs against a freshly reset local instance:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/post_media_service_grant.sql
-- Read-only; any failed assertion raises and exits non-zero.
-- ============================================================================

do $$
begin
  if not has_table_privilege('service_role', 'public.post_media', 'select') then
    raise exception
      'service_role must be able to SELECT public.post_media — getPostMediaUrls signs media through the service client after can_view_post';
  end if;

  if has_table_privilege('anon', 'public.post_media', 'select') then
    raise exception
      'anon must NOT read public.post_media directly (media paths flow only through getPostMediaUrls)';
  end if;

  if not has_table_privilege('authenticated', 'public.post_media', 'select') then
    raise exception
      'authenticated must keep SELECT on public.post_media (owner-only via RLS)';
  end if;
end $$;

-- Behavioral: the service role can actually run the getPostMediaUrls read.
set role service_role;
do $$
declare
  n bigint;
begin
  select count(*) into n from public.post_media;
  -- No assertion on the count — an empty fresh DB is fine; reaching here
  -- proves the read no longer fails with 42501.
end $$;
reset role;

select 'post_media_service_grant checks passed' as result;
