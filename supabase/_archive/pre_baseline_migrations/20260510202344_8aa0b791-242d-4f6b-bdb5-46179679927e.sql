
-- 1. Pin search_path on touch_updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql
security invoker
set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;

-- 2. Revoke public/authenticated execute on the trigger-only function
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. Replace overly broad storage SELECT policies with owner-only listing
drop policy if exists "Public read avatars" on storage.objects;
drop policy if exists "Public read banners" on storage.objects;
drop policy if exists "Public read products" on storage.objects;

create policy "Owners list own avatar files" on storage.objects
  for select using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "Owners list own banner files" on storage.objects
  for select using (
    bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "Owners list own product files" on storage.objects
  for select using (
    bucket_id = 'products' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. Tighten analytics insert: must reference an existing creator profile
drop policy if exists "Anyone can insert analytics events" on public.analytics_events;
create policy "Visitors can record events on real profiles" on public.analytics_events
  for insert with check (
    profile_id is not null
    and exists (select 1 from public.creator_profiles cp where cp.id = profile_id)
  );
