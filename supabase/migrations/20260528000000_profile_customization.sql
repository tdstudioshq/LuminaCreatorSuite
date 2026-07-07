-- ============================================================================
-- Profile customization fields (additive) for the profile-first onboarding.
--
-- Adds three columns to public.creator_profiles:
--   * headline     — a short title/tagline shown under the display name
--   * accent_color — optional brand accent (hex, e.g. '#c084fc'); '' = theme default
--   * button_style — link/button shape: 'rounded' (default) | 'pill' | 'square'
--
-- All have defaults so existing/older profiles keep working (headline '',
-- accent_color '', button_style 'rounded'). No RLS change: these are plain
-- columns on the already-RLS'd creator_profiles table, covered by its existing
-- owner-update / public-read policies and the table-level grants from
-- 20260511000000_baseline.sql + 20260525000000_baseline_grants.sql (table-level
-- grants apply to all columns, so no new GRANT is needed).
-- ============================================================================

alter table public.creator_profiles
  add column if not exists headline text not null default '',
  add column if not exists accent_color text not null default ''
    constraint creator_profiles_accent_color_hex
    check (accent_color = '' or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists button_style text not null default 'rounded'
    constraint creator_profiles_button_style_valid
    check (button_style in ('rounded', 'pill', 'square'));
