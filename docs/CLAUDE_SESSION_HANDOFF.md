# CABANA — Claude Agent Session Handoff

> Prepared June 25, 2026
>
> Workspace: `/Users/tdstudiosny/LuminaCreatorSuite`

## Mission

Continue evolving CABANA from its current creator OS/link-in-bio/storefront application into a premium creator subscription platform.

Do not rebuild or redesign the application. Preserve the existing CABANA visual system, authentication, creator dashboard, public profiles, links, storefront, analytics, and Supabase integration.

Use these documents as the source of truth:

1. [`CABANA_ARCHITECTURE.md`](../CABANA_ARCHITECTURE.md)
2. [`docs/CABANA_BUILD_ROADMAP.md`](./CABANA_BUILD_ROADMAP.md)
3. This handoff

## Latest Status — Phase 3 COMPLETE (Posts & Feed Foundation)

Built on the verified Phase 2C social graph. Local Docker only — no production Supabase, migration
repair, link, push, or deployment was touched (a config deny-list now blocks those commands).

**Scope delivered (posts + feed + composer only):** real creator publishing with `public` /
`followers` visibility and private image media. Comments / likes / saves are deferred to Phase 3.2;
`subscribers` / `purchase` visibility is rejected at write-time and never shown to non-creators
(no fan subscriptions until Phase 4).

- **Migration** `20260514000000_posts_feed.sql`: `post_visibility` / `post_status` / `post_media_kind`
  enums; `posts` + `post_media` tables with indexes and RLS; `is_following_creator` + `can_view_post`
  authorization helpers; ID-free `feed_creator_posts` (returns followers-only posts to non-followers as
  **locked stubs**) and `feed_home_posts` RPCs; a **private** `post-media` storage bucket with
  owner-scoped object policies. Extended `is_following_creator`/`is_current_user_creator` grants to
  `anon` (the posts SELECT policies are OR-evaluated for anonymous readers).
- **Pure module** `cabana-posts.ts` (+ `cabana-posts.test.ts`, in the 95% coverage set): caption /
  visibility / status-transition / media validation and row→domain mappers.
- **Protected actions** `post-actions.ts`: `createPost`, `updatePost`, `publishPost`, `archivePost`,
  `deletePost`, `addPostMedia`, `deletePostMedia`, `getOwnPosts`, `getCreatorFeed`, `getHomeFeed`, and
  `getPostMediaUrls`. The last is the only place the service role touches storage — gated by
  `can_view_post`. New `optionalSupabaseAuth` middleware makes the creator feed guest-callable while
  still resolving a signed-in viewer's `auth.uid()`.
- **Hooks** `use-posts.ts`: `useCreatorFeed`, `useHomeFeed`, `useOwnPosts`, `usePostMediaUrls`, and
  composer mutations (uploads to the private bucket via the authed client, then records the row).
- **UI**: `src/components/cabana/posts/` (`PostComposer`, `PostsDashboard`, `PostCard`,
  `PostMediaGallery`, `PostVisibilityBadge`, `LockedContentGate`, `HomeFeed`). `/dashboard/posts` is now
  a real composer + post manager (replaced `DemoPosts`), `/feed` is the real authenticated home feed, and
  `/$username` shows public posts inline with locked follower-post teases.
- **Tests**: `supabase/tests/posts_feed.sql` (owner CRUD, anon public read, follower gating, locked
  stubs, no draft/subscriber leakage, `can_view_post` truth table, owner-only `post_media`, private
  bucket); `smoke.sql` extended; a `posts_feed.sql` step added to the CI `db-validate` job.

**Local verification:** migration applies from zero; all four SQL suites (smoke, member_accounts,
social_relationships, posts_feed) pass through the DB container; 116 unit tests pass at 100% statements
/ 100% functions / 100% lines / 99.5% branches; lint / tsc / build green.

**Next:** Phase 3.2 (comments / likes / saves) or Phase 4 (creator subscriptions & entitlements) —
both gated on explicit approval. Remote schema reconciliation remains deferred.

---

## Phase 2C COMPLETE (Social Relationship Foundation)

Built on the verified Phase 2B account/auth layer. No production Supabase, migration repair, or
deployment was touched.

**Delivered (relationship layer only — no posts/feed/messaging/notifications/subscriptions/payments):**

- **Migration** `20260513000000_social_relationships.sql`: member public usernames, `follows`,
  `blocks`, unique constraints, indexed FKs, authenticated-only base grants, and complete owner /
  creator RLS.
- **Safe public views**: `public_creator_profiles` and `public_member_profiles` expose only username,
  display name, avatar/banner, bio, placeholder verified/post counts, and follower/following counts.
  No auth/profile UUIDs, email, plan, theme, or private metadata.
- **Protected actions**: `followCreator`, `unfollowCreator`, `blockUser`, `unblockUser`,
  `getRelationshipState`, `getFollowerCount`, `getFollowingCount`; all use
  `attachSupabaseToken` + `requireSupabaseAuth`, the caller's scoped client, and no service role.
- **Hooks/UI**: `useRelationship`, `useFollow`; the temporary local creator-page follow toggle is now
  persistent and reports Follow/Following state.
- **Tests**: relationship validation/action tests plus `social_relationships.sql` for uniqueness,
  RLS isolation, creator follower visibility, anonymous denial, safe-view columns/counts, and
  protected RPC behavior.

**Local verification:** migration applies from zero; smoke, member-account, and social-relationship
SQL suites pass through the database container; 83 unit tests pass with 100% configured coverage.

**Next:** Phase 3 — Posts & Feed Foundation — gated on explicit approval. Remote `supabase db dump`
comparison and migration-history reconciliation remain deferred; do not run migration repair or
deploy.

---

## Phase 2A VERIFIED (Supabase Baseline + CI)

**Verification (June 25, 2026) — gap closed on real Docker + CI:**

- Workspace is now a **git repo** (first commit `e18e8ce`, branch pushed to `main` of the private repo `tdstudioshq/LuminaCreatorSuite`). `.gitignore` hardened to exclude `.env` (service-role key), `/coverage`, and `supabase/.temp`.
- `bun run db:validate` ran on a **real Docker daemon**: `supabase db reset` rebuilt the schema **from zero** (baseline migration + seed) cleanly, and the `supabase/tests/smoke.sql` assertions (8 tables, `app_role`, 4 functions, signup trigger, RLS, 3 buckets, aurora seed, reserved handles) **passed** (run via the DB container since the host has no `psql`).
- **GitHub Actions CI is green** (run `28170007528`): `Verify (lint·tsc·test·build)` ✅ and `Database baseline (rebuild from zero)` ✅ — the from-zero rebuild + smoke checks pass on a clean Ubuntu runner too.
- **Still pending (auth-blocked, not run):** remote schema reconciliation against the live project `dwnricswfskypqqfknnh` — no Supabase access token / DB password is available in this environment, and `supabase migration repair` mutates remote history, so per the "don't run destructive/ambiguous remote commands" rule it was **not** executed. Before treating the baseline as byte-exact: `supabase login`, `supabase link --project-ref dwnricswfskypqqfknnh`, `supabase db dump` + diff, confirm `major_version`, then `supabase migration repair --status applied 20260511000000`.

---

## Phase 2A delivered (Supabase Baseline + CI)

Progression since this handoff was first written: **Phase 1 (demo UI + pure helpers)** → **Phase 1C (current-app hardening)** → **Phase 2A (DB baseline + CI)**, all green on `lint` / `tsc` / `test` / `build`.

**Phase 2A delivered (infrastructure only — no new product features):**

- `supabase/migrations/20260511000000_baseline.sql` — squashed, **rebuildable-from-zero** baseline reconstructing the entire existing schema (8 tables, `app_role` enum, `handle_new_user`/`has_role`/`validate_creator_handle`/`touch_updated_at`, all triggers including signup provisioning, all RLS, 3 public storage buckets + owner-scoped object policies, reserved-handle seed, SECURITY DEFINER revokes).
- The 4 original incremental migrations moved to `supabase/_archive/pre_baseline_migrations/` (they could not rebuild from zero on their own — the root cause this baseline fixes).
- `supabase/seed.sql` (aurora demo so `/demo` + `/$username` render), `supabase/config.toml` (full local config), `supabase/tests/smoke.sql`, `scripts/db-validate.sh`, `supabase/README.md`.
- `package.json`: `db:reset`, `db:validate`. CI at `.github/workflows/ci.yml` (verify job + Docker-based db-validate job).

**At the Phase 2A boundary, did NOT:** rename `subscriptions`, add
`creator_subscriptions`/`member_profiles`/posts/messaging/notifications/payments, change UI/routes,
or touch production data. Phase 2B later added only `member_profiles` and the `/account` foundation.

**Historical authoring blocker (local/CI portion now closed):** the original authoring sandbox could
not run Docker or `psql`. Subsequent Phase 2A/2B verification proved the baseline and member
migration on local Docker and CI. Remote `supabase db dump` comparison and migration-history
reconciliation remain intentionally deferred. See
[`CABANA_DATABASE.md` §"Baseline migration"](../CABANA_DATABASE.md#baseline-migration-phase-2a)
and `supabase/README.md`.

**At the Phase 2A boundary, next was:** Phase 2B. Part 1 is now complete; part 2 remains gated.

## Current Product State

CABANA currently includes:

- TanStack Start, React 19, Vite, and Tailwind CSS 4.
- File-based TanStack Router routing.
- Supabase Auth with email/password and password recovery.
- Supabase-backed creator profiles, links, products, storage uploads, and analytics events.
- Supabase-backed creator/member account branching and private member profiles.
- Persistent follows, private blocks, and ID-free public profile views.
- Public creator pages at `/$username`.
- Authenticated creator dashboard.
- Authenticated member account foundation at `/account`.
- Demo-only AI Studio, media kit, settings integrations, and admin portal.
- Luxury dark, glass, chrome, and iridescent CABANA design system.

The application does not yet have production posts/feed, creator subscriptions, messages,
notifications, tips, transactions, balances, payouts, reports, or audit logs. Member profiles,
follows, and blocks are implemented with RLS.

## Phase 1 Foundation Completed

### Domain types

Added:

- [`src/lib/cabana-types.ts`](../src/lib/cabana-types.ts)

It defines:

- `MemberProfile`
- `CreatorPost`
- `PostMedia`
- `Comment`
- `Like`
- `Save`
- `Follow`
- `CreatorSubscription`
- `Conversation`
- `Message`
- `Notification`
- `Tip`
- `Transaction`
- `CreatorBalance`
- `Payout`
- `Report`
- `AuditLog`

These began as frontend/demo contracts. The account and follow shapes now have live Phase 2B/2C
counterparts; post, message, notification, monetization, report, and audit contracts remain planned.

### Demo data

Added:

- [`src/lib/cabana-demo-data.ts`](../src/lib/cabana-demo-data.ts)

It contains deterministic generators for:

- Members
- Posts and post media
- Comments, likes, and saves
- Follows
- Creator subscriptions
- Conversations and messages
- Notifications
- Transactions

The fixed demo clock is June 25, 2026. Mock provider references use a `mock_` prefix.

### Shared placeholder UI

Added:

- [`src/components/cabana/foundation/FoundationPage.tsx`](../src/components/cabana/foundation/FoundationPage.tsx)

This component provides the shared CABANA-styled “Demo foundation / Coming soon” presentation. It supports:

- Public screens with `GlobalNav`.
- Creator screens inside the existing dashboard layout.
- Capability lists.
- Clear notices that payments, private messages, entitlements, and payouts are inactive.

### New creator routes

- `/dashboard/posts`
- `/dashboard/subscribers`
- `/dashboard/messages`
- `/dashboard/earnings`
- `/dashboard/notifications`

These routes inherit the existing dashboard auth gate.

### New public/member foundation routes

- `/feed`
- `/discover`
- `/messages`
- `/notifications`

These routes are currently public placeholders and must not render private member data.

### Navigation

Updated:

- [`src/components/cabana/dashboard/Sidebar.tsx`](../src/components/cabana/dashboard/Sidebar.tsx)

Added dashboard navigation links for:

- Posts
- Subscribers
- Messages
- Earnings
- Notifications

The desktop navigation is scrollable because the item count increased.

## Phase 2C Validation State

The complete gate was run before the Phase 2B commit:

```bash
bun run lint
bunx tsc --noEmit
bun run test:coverage
bun run build
supabase start
bun run db:validate
docker exec -i supabase_db_dwnricswfskypqqfknnh psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < supabase/tests/smoke.sql
docker exec -i supabase_db_dwnricswfskypqqfknnh psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < supabase/tests/member_accounts.sql
docker exec -i supabase_db_dwnricswfskypqqfknnh psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < supabase/tests/social_relationships.sql
supabase stop
```

Results: lint, TypeScript, production build, 83 unit tests, 100% coverage on the selected business
modules, from-zero rebuild, smoke assertions, account branching, member RLS, follow/block RLS,
uniqueness, safe public views, protected relationship RPCs, and anonymous denial pass locally.

## Repository State

The repository is connected to `tdstudioshq/LuminaCreatorSuite`. Phase 2C work is isolated on
`feat/phase-2c-social-relationships`. Keep Phase 3 limited to posts/feed; do not fold messaging,
notifications, subscriptions, or monetization into it.

## Hard Constraints

Do not:

- Rebuild from scratch.
- Redesign the CABANA UI.
- Remove or replace existing routes.
- Replace the current Supabase schema.
- Add Stripe or another payment processor yet.
- Add real payouts or KYC.
- Add adult-content functionality.
- Expose service-role credentials.
- Put private member/message data on public routes.
- Treat mock transactions as real financial records.
- Rename the current `subscriptions` table without a migration plan.
- Edit `src/routeTree.gen.ts` manually.

Continue to:

- Use integer cents for mock money.
- Clearly label all monetization behavior as demo-only.
- Keep domain logic Supabase-ready.
- Use RLS-ready ownership models.
- Keep changes small and reviewable.
- Run lint, build, and TypeScript checks before handoff.

## Supabase Risks

- The checked-in baseline, member, and relationship migrations rebuild successfully on local Docker.
- They were reconstructed locally rather than reconciled against a fresh live
  `supabase db dump`; remote reconciliation remains deferred.
- The existing `subscriptions` table means CABANA platform SaaS subscriptions, not fan-to-creator subscriptions.
- Future fan subscriptions should use `creator_subscriptions`.
- Current public creator reads can expose `creator_profiles.user_id`.
- The new public views are safe, but the legacy links/products/analytics bundle still depends on the
  direct creator-profile read; migrate that bundle before removing the old public table path.
- Current public storage URLs are unsuitable for premium/private media.

Do not touch production Supabase, run migration repair, or deploy. Any next table still requires an
approved migration, RLS design, and behavioral tests.

## Recommended Next Task: Phase 3 — Posts & Feed Foundation (Gated)

Do not start automatically. With explicit approval:

Recommended order:

1. Add `posts`, `media`, and `post_media` with creator-owner writes.
2. Add public/follower read rules using the Phase 2C relationship graph.
3. Add comments, likes, and saves with per-table behavioral RLS tests.
4. Keep post media private and issue signed URLs only after authorization.
5. Build the smallest real feed and composer without messaging, notifications, or monetization.

## Files To Inspect First

```text
CABANA_ARCHITECTURE.md
docs/CABANA_BUILD_ROADMAP.md
src/lib/cabana-types.ts
src/lib/cabana-demo-data.ts
src/components/cabana/foundation/FoundationPage.tsx
src/components/cabana/dashboard/Sidebar.tsx
src/routes/dashboard.tsx
src/styles.css
src/lib/cabana-store.ts
src/lib/cabana-account.ts
src/lib/account-actions.ts
src/lib/use-account.ts
src/lib/cabana-relationships.ts
src/lib/relationship-actions.ts
src/lib/use-relationships.ts
src/integrations/supabase/auth-client-middleware.ts
src/integrations/supabase/types.ts
src/routes/account.tsx
supabase/migrations/20260512000000_member_accounts.sql
supabase/migrations/20260513000000_social_relationships.sql
supabase/tests/member_accounts.sql
supabase/tests/social_relationships.sql
```

## End-of-Session Handoff Requirements

At the end of the next session, report:

- Files added and changed.
- Routes or components implemented.
- Whether any Supabase schema or data was touched.
- Demo versus production behavior.
- Lint, build, and TypeScript results.
- Known warnings or blockers.
- Exact recommended next task.
