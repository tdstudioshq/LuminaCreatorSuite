-- ============================================================================
-- CABANA ⇄ cabanadatabase reconciliation — corrective patch (post-apply)
--
-- *** DESTRUCTIVE on the cloud project's storage.objects — apply only with
--     explicit approval. ***
--
-- Why: the cloud reconciliation ran 01 BEFORE 01 was fixed to drop scaffold
-- storage policies, so cloud storage.objects ended up with BOTH sets:
--   * CABANA's correct owner-scoped policies ("avatars owner *", "banners
--     owner *", "products owner *", "post-media owner *"), and
--   * the leftover scaffold policies (avatars_owner_*, creator_media_*,
--     message_media_*, verification_documents_*, compliance_documents_*,
--     "artwork public read", "subtitles authenticated read").
-- Some scaffold policies call app_private.current_profile_id(), whose body is
--   `select id from public.profiles where auth_user_id = auth.uid()`
-- but CABANA's public.profiles has NO auth_user_id column. Postgres plans every
-- applicable permissive policy for a storage INSERT, so on the shared `avatars`
-- bucket the broken scaffold policy fails the whole upload with:
--   "schema mismatch … SQL function current_profile_id during startup".
--
-- Fix: drop every storage.objects policy that is NOT one of CABANA's 16, leaving
-- exactly the CABANA set (matching the intended end state the local dry-run
-- produced). Idempotent.
-- ============================================================================

do $$
declare
  r record;
  keep text[] := array[
    'avatars owner select','avatars owner insert','avatars owner update','avatars owner delete',
    'banners owner select','banners owner insert','banners owner update','banners owner delete',
    'products owner select','products owner insert','products owner update','products owner delete',
    'post-media owner select','post-media owner insert','post-media owner update','post-media owner delete'
  ];
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname <> all(keep)
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'dropped storage policy: %', r.policyname;
  end loop;
end $$;

-- Verify afterward (expect only the 16 CABANA policies, none referencing app_private):
--   select policyname,
--          (qual like '%app_private%' or coalesce(with_check,'') like '%app_private%') as refs_app_private
--   from pg_policies where schemaname='storage' and tablename='objects' order by policyname;
