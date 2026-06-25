
-- Restrict storage SELECT to owner-only (public CDN URLs still serve files; this only blocks listing).
drop policy if exists "avatars public read" on storage.objects;
drop policy if exists "banners public read" on storage.objects;
drop policy if exists "products public read" on storage.objects;

create policy "avatars owner select"
  on storage.objects for select
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "banners owner select"
  on storage.objects for select
  using (bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "products owner select"
  on storage.objects for select
  using (bucket_id = 'products' and auth.uid()::text = (storage.foldername(name))[1]);

-- Revoke direct EXECUTE on SECURITY DEFINER helpers; they are only invoked by RLS policies and triggers.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_creator_handle() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
