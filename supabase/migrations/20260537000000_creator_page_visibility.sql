-- ============================================================================
-- CABANA — Phase 2A.1: Creator-page draft/published visibility foundation
-- ============================================================================
-- The secure visibility layer that the later admin creator-page write system
-- (Phase 2A.2) will depend on. This migration is SCHEMA + RLS + VIEW ONLY:
--
--   * a `page_status` lifecycle (draft | published | archived) on creator pages,
--   * appearance fields (`font_family`, `background_style`) on creator pages,
--   * link `kind` + per-link `is_visible`,
--   * an HTTP/HTTPS-only scheme constraint on `links.url`,
--   * base-table RLS that enforces "anon sees published only; owners see their
--     own page in any state; admins see all", with links inheriting their
--     parent page's visibility, and
--   * `public_creator_profiles` filtered to published rows.
--
-- Deliberately NOT in this migration (Phase 2A.2 / later): admin write RPCs,
-- audit triggers, ANY new SECURITY DEFINER function, admin UPDATE access on
-- creator_profiles/links, the editor UI, and creator invites/claims. No
-- production SQL is applied by this file — it is validated on local Docker via
-- `bun run db:validate` first.
--
-- One baseline policy is RESCOPED (not a behavior change): `Owners manage own
-- links` is narrowed from all-roles to `authenticated`. It references
-- creator_profiles.user_id, which anon cannot read (column-revoked since
-- 20260532), so it must not be evaluated for anon; anon's auth.uid() is null so
-- the policy never granted anon anything. This is flagged for review in the
-- 2A.1 report. (No SECURITY DEFINER helper is added: the anon links policy is
-- written to reference only anon-readable creator_profiles columns and is
-- transitively filtered by the anon creator_profiles SELECT policy.)
--
-- ── Existing-behavior preservation (no regression) ──────────────────────────
--   * `page_status` DEFAULT 'published' → every pre-existing creator_profiles
--     row (incl. the ownerless `aurora` seed and every account created by the
--     `handle_new_user` signup trigger) is published, so no live page goes dark.
--   * `links.is_visible` DEFAULT true + `links.kind` DEFAULT 'link' → every
--     existing link stays visible with unchanged behavior.
--   * `font_family` / `background_style` DEFAULT 'default' → a neutral value the
--     public renderer treats as "use the theme default", so appearance is
--     unchanged until an owner/admin opts into an override (2A.3).
--   * The URL constraint is added NOT VALID, so it never fails the migration on a
--     pre-existing non-conforming row; it DOES enforce on every INSERT/UPDATE
--     from here on. No existing row is rewritten.
--
-- ── Rollback implications (this repo is forward-only; no down migration) ─────
--   To revert, a follow-up migration would: drop the role-split SELECT policies
--   and restore the `USING (true)` public SELECT policies on creator_profiles +
--   links; re-scope `Owners manage own links` back to all roles; drop the
--   `WHERE page_status = 'published'` from public_creator_profiles (restore
--   20260530's body); revoke the anon column grants; and drop the added columns,
--   constraints, and the enum. All changes here are additive except the policy
--   REPLACEMENTS/RESCOPE, which run inside this migration's single transaction
--   (atomic — there is no window where a page is both un-dropped and un-created).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enum: creator page lifecycle
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.creator_page_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. creator_profiles: lifecycle + appearance columns (all additive, defaulted)
-- ----------------------------------------------------------------------------
-- page_status DEFAULT 'published' backfills every existing row as published.
-- font_family / background_style are CHECK-constrained closed allow-lists; the
-- 'default' value is the neutral "use theme default" that preserves today's look.
alter table public.creator_profiles
  add column if not exists page_status public.creator_page_status not null default 'published',
  add column if not exists font_family text not null default 'default'
    constraint creator_profiles_font_family_valid
    check (font_family in ('default', 'sans', 'serif', 'mono', 'display')),
  add column if not exists background_style text not null default 'default'
    constraint creator_profiles_background_style_valid
    check (background_style in ('default', 'solid', 'gradient', 'iridescent'));

-- Owner/admin reads of drafts filter by page_status per-row; index it alongside
-- the handle lookup path so the published filter stays cheap.
create index if not exists creator_profiles_page_status_idx
  on public.creator_profiles (page_status);

-- ----------------------------------------------------------------------------
-- 2. links: kind + per-link visibility (additive, defaulted)
-- ----------------------------------------------------------------------------
alter table public.links
  add column if not exists kind text not null default 'link'
    constraint links_kind_valid
    check (kind in ('link', 'header', 'social', 'embed')),
  add column if not exists is_visible boolean not null default true;

-- ----------------------------------------------------------------------------
-- 3. links.url: HTTP/HTTPS SCHEME-PREFIX constraint (NOT VALID)
-- ----------------------------------------------------------------------------
-- This is a SCHEME guard, NOT full URL validation. It asserts only that the
-- value BEGINS with an http:// or https:// scheme (case-insensitive), which
-- rejects javascript:, data:, vbscript:, ftp:, protocol-relative ("//host"),
-- and plain non-URL text on every INSERT/UPDATE. It does NOT validate host,
-- path, or overall well-formedness — a value like 'https://' (the app's
-- placeholder default; see cabana-store.addLink) or 'https:// has spaces' still
-- passes the prefix check. Full URL validity remains an APPLICATION-layer
-- responsibility (cabana-validation) and may be strengthened later only
-- alongside changes to the link-authoring flow; the regex is deliberately not
-- broadened in 2A.1. NOT VALID skips the one-time scan of pre-existing rows (so
-- a cloud apply can't fail on legacy data) but still enforces the check for all
-- new and updated rows — existing rows are never rewritten.
do $$ begin
  alter table public.links
    add constraint links_url_http_scheme
    check (url ~* '^https?://') not valid;
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 4. anon column grants: new PUBLIC appearance columns only
-- ----------------------------------------------------------------------------
-- anon holds a COLUMN-SCOPED SELECT on creator_profiles (20260532), so new
-- columns are not readable by anon unless granted.
--   * font_family / background_style — public appearance columns the public page
--     renders.
--   * page_status — REQUIRED by the base-table RLS below. PostgreSQL evaluates an
--     RLS USING expression against the invoking role's column privileges, so the
--     anon SELECT policy `using (page_status = 'published')` needs anon to hold
--     column SELECT on page_status or every anon read of the table fails 42501
--     (a table-wide "permission denied", not a per-row filter). Exposing it leaks
--     nothing: anon's RLS only ever returns published rows, so the column value
--     anon can observe is always 'published' — no draft/archived row is visible.
-- user_id remains column-revoked from anon (20260532); the auth UUID never leaks.
grant select (page_status, font_family, background_style) on public.creator_profiles to anon;

-- ----------------------------------------------------------------------------
-- 5. Base-table RLS: published-visibility, role-split
-- ----------------------------------------------------------------------------
-- The public /$username page reads the creator_profiles / links BASE TABLES
-- directly (not the view), so the draft boundary MUST live in the base-table
-- SELECT policies, not only in the view. Policies are role-split so anon never
-- evaluates is_current_user_admin() (anon lacks EXECUTE on it).

-- 5a. creator_profiles — replace the baseline public USING(true) SELECT.
drop policy if exists "Public can view creator profiles" on public.creator_profiles;

create policy "Anon can view published creator pages"
  on public.creator_profiles for select to anon
  using (page_status = 'published');

create policy "Authenticated can view published, own, or admin creator pages"
  on public.creator_profiles for select to authenticated
  using (
    page_status = 'published'
    or user_id = (select auth.uid())                 -- owner sees own page in ANY state
    or (select public.is_current_user_admin())        -- admin sees all
  );

-- The baseline owner INSERT / owner UPDATE policies on creator_profiles are
-- intentionally left unchanged (no admin write path is introduced here).

-- 5b. links — replace the baseline public USING(true) SELECT.
--
-- No new function is introduced. A link's visibility depends on its PARENT
-- page's status, so a links policy must consult creator_profiles. A table
-- referenced inside an RLS policy is itself RLS-filtered for the invoking role
-- AND requires that role's column privileges on the columns it references. Two
-- rules follow:
--   * The anon links policy may reference only creator_profiles columns anon can
--     read. It references cp.id (anon-granted) and NOT cp.user_id (anon-revoked
--     since 20260532). Its EXISTS is transitively filtered by the anon
--     creator_profiles policy (5a), which returns only published pages — so a
--     draft/archived parent hides its links by construction. (Confirmed against
--     the analytics_events anon-insert path, which uses the same id-only shape.)
--   * The baseline "Owners manage own links" FOR ALL policy references
--     cp.user_id, which anon cannot read — so it must NOT be evaluated for anon.
drop policy if exists "Public can view links" on public.links;

-- Scope the baseline "Owners manage own links" FOR ALL policy to `authenticated`
-- so anon never evaluates its cp.user_id reference. Behavior-preserving: anon's
-- auth.uid() is null, so anon could never satisfy `cp.user_id = auth.uid()` —
-- the policy never granted anon anything. Owners are always authenticated; its
-- owner semantics (SELECT/INSERT/UPDATE/DELETE own links in any state) are
-- unchanged.
alter policy "Owners manage own links" on public.links to authenticated;

-- anon: a link is visible only if it is is_visible AND its parent page is
-- visible-to-anon (i.e. published — enforced by 5a's anon creator_profiles
-- policy, which this EXISTS is filtered through). References only cp.id.
create policy "Anon can view visible links on published pages"
  on public.links for select to anon
  using (
    is_visible
    and exists (
      select 1
      from public.creator_profiles cp
      where cp.id = links.profile_id
    )
  );

-- authenticated: visible links on published pages, OR any link on a page they
-- own (any state), OR everything for an admin. authenticated has full-table
-- SELECT on creator_profiles, so the parent's page_status / user_id may be
-- referenced directly here.
create policy "Authenticated can view visible, own, or admin links"
  on public.links for select to authenticated
  using (
    (
      is_visible
      and exists (
        select 1
        from public.creator_profiles cp
        where cp.id = links.profile_id
          and cp.page_status = 'published'
      )
    )
    or exists (
      select 1
      from public.creator_profiles cp
      where cp.id = links.profile_id
        and cp.user_id = (select auth.uid())
    )
    or (select public.is_current_user_admin())
  );

-- ----------------------------------------------------------------------------
-- 6. public_creator_profiles: filter to published pages
-- ----------------------------------------------------------------------------
-- Recreate the view with the SAME projection and aggregate definitions as
-- 20260530 (H5: real published post_count), adding only WHERE page_status =
-- 'published' so drafts and archived pages never surface through the view. The
-- view stays security_invoker = false (it must aggregate private follows/posts)
-- and security_barrier = true. create-or-replace preserves grants; they are
-- re-asserted defensively so a from-zero rebuild is never left without read
-- access.
create or replace view public.public_creator_profiles
with (security_barrier = true, security_invoker = false)
as
select
  cp.handle as username,
  cp.name as display_name,
  cp.avatar_url,
  cp.banner_url,
  cp.bio,
  false::boolean as verified,
  (
    select count(*)
    from public.follows f
    where f.following_creator_id = cp.id
  )::bigint as follower_count,
  (
    select count(*)
    from public.follows f
    where f.follower_id = cp.user_id
  )::bigint as following_count,
  (
    select count(*)
    from public.posts p
    where p.creator_profile_id = cp.id
      and p.status = 'published'
  )::bigint as post_count
from public.creator_profiles cp
where cp.page_status = 'published';

revoke all on public.public_creator_profiles from public, anon, authenticated;
grant select on public.public_creator_profiles to anon, authenticated;
