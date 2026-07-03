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

-- A published Phase 6 `purchase` post so the (demo) unlock flow has something to
-- buy on a fresh instance. A signed-in member can unlock it via create_mock_purchase.
insert into public.posts (id, creator_profile_id, caption, visibility, status, published_at, price_cents, currency)
values (
  '00000000-0000-4000-d000-000000000001',
  '00000000-0000-4000-a000-000000000001',
  'Unreleased acoustic session — unlock to listen.',
  'purchase',
  'published',
  now(),
  900,
  'USD'
)
on conflict (id) do nothing;

-- A demo member (auth user → profile via handle_new_user) so the Phase 8 admin
-- moderation queue has reports to triage on a fresh instance. Local/staging only.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-4000-e000-000000000001',
  'demo.reporter@cabana.local',
  '{"name":"Demo Reporter","account_type":"member"}'::jsonb
)
on conflict (id) do nothing;

-- Login-page demo identities. These are local/staging-only credentials:
-- fan@cabana.demo, creator@cabana.demo, admin@cabana.demo / password123
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-e100-000000000001',
    'authenticated',
    'authenticated',
    'fan@cabana.demo',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Demo Fan","account_type":"member"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-e100-000000000002',
    'authenticated',
    'authenticated',
    'creator@cabana.demo',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Demo Creator","account_type":"creator"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-e100-000000000003',
    'authenticated',
    'authenticated',
    'admin@cabana.demo',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Demo Admin","account_type":"creator"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at;

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-e200-000000000001',
    '00000000-0000-4000-e100-000000000001',
    '00000000-0000-4000-e100-000000000001',
    '{"sub":"00000000-0000-4000-e100-000000000001","email":"fan@cabana.demo","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-e200-000000000002',
    '00000000-0000-4000-e100-000000000002',
    '00000000-0000-4000-e100-000000000002',
    '{"sub":"00000000-0000-4000-e100-000000000002","email":"creator@cabana.demo","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-e200-000000000003',
    '00000000-0000-4000-e100-000000000003',
    '00000000-0000-4000-e100-000000000003',
    '{"sub":"00000000-0000-4000-e100-000000000003","email":"admin@cabana.demo","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict (provider_id, provider) do update set
  identity_data = excluded.identity_data,
  updated_at = excluded.updated_at;

insert into public.user_roles (user_id, role)
values ('00000000-0000-4000-e100-000000000003', 'admin')
on conflict (user_id, role) do nothing;

-- Two seeded reports against the aurora demo content (open + reviewing) so a
-- signed-in admin/moderator sees a populated queue at /admin/reports.
insert into public.reports (id, reporter_user_id, subject_type, subject_id, reason, details, status)
values
  (
    '00000000-0000-4000-f000-000000000001',
    '00000000-0000-4000-e000-000000000001',
    'post', '00000000-0000-4000-d000-000000000001',
    'spam', 'This unlock post reads like a scam.', 'open'
  ),
  (
    '00000000-0000-4000-f000-000000000002',
    '00000000-0000-4000-e000-000000000001',
    'creator', '00000000-0000-4000-a000-000000000001',
    'impersonation', 'Suspected impersonation of a verified artist.', 'reviewing'
  )
on conflict (id) do nothing;

-- Two demo payout requests (pending + on hold) against the aurora demo creator,
-- each with a reserved (processing) disbursement, so a signed-in admin sees a
-- populated queue at /admin/payouts. Local/staging only; no real funds.
insert into public.payout_requests (id, creator_profile_id, amount_cents, currency, status, note)
values
  (
    '00000000-0000-4000-c000-000000000001',
    '00000000-0000-4000-a000-000000000001', 5000, 'USD', 'requested', 'First withdrawal'
  ),
  (
    '00000000-0000-4000-c000-000000000002',
    '00000000-0000-4000-a000-000000000001', 12000, 'USD', 'on_hold', 'Awaiting verification'
  )
on conflict (id) do nothing;

insert into public.payouts (
  id, creator_profile_id, payout_request_id, amount_cents, currency, status, requested_at
)
values
  (
    '00000000-0000-4000-c100-000000000001',
    '00000000-0000-4000-a000-000000000001',
    '00000000-0000-4000-c000-000000000001', 5000, 'USD', 'processing', now()
  ),
  (
    '00000000-0000-4000-c100-000000000002',
    '00000000-0000-4000-a000-000000000001',
    '00000000-0000-4000-c000-000000000002', 12000, 'USD', 'processing', now()
  )
on conflict (id) do nothing;
