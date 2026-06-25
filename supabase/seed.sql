-- ============================================================================
-- CABANA — local/staging seed data
-- ============================================================================
-- Applied automatically by `supabase db reset` after the baseline migration.
-- Provides the ownerless `aurora` demo creator so the /demo and /$username
-- routes render on a freshly rebuilt instance. NOT applied to production.
--
-- Deterministic UUIDs keep reruns stable. The validate_creator_handle trigger
-- permits the reserved `aurora` handle precisely because user_id is null.
-- ============================================================================

insert into public.creator_profiles (id, user_id, handle, name, bio, avatar_url, theme, plan)
values (
  '00000000-0000-4000-a000-000000000001',
  null,
  'aurora',
  'Aurora',
  'Cinematic R&B. Quiet luxury. Released by invitation.',
  'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=600&q=80',
  'iridescent',
  'pro'
)
on conflict (id) do nothing;

insert into public.links (id, profile_id, title, url, icon, featured, position, clicks)
values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'Latest drop', 'https://example.com/drop', 'sparkles', true, 0, 1280),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001', 'Instagram', 'https://instagram.com/aurora', 'instagram', false, 1, 940),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000001', 'Listen on Spotify', 'https://open.spotify.com/aurora', 'music', false, 2, 612)
on conflict (id) do nothing;

insert into public.products (id, profile_id, title, price, type, image_url, sales, position)
values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', 'Signed vinyl', '$48', 'Physical', 'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=600&q=80', 312, 0),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001', 'Studio presets', '$24', 'Download', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80', 184, 1)
on conflict (id) do nothing;
