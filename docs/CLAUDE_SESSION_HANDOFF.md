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

## Latest Status — Phase 2B part 1 COMPLETE (Member Accounts & Auth Infrastructure)

Built on the verified 2A baseline. **All gates green** (`lint` / `tsc` / `test` / `build` / `db:validate`), all run on a real Docker host.

**Delivered (additive — no `subscriptions` rename, no `creator_subscriptions`/posts/feed/messaging/payments):**

- **Migration** `supabase/migrations/20260512000000_member_accounts.sql`: `account_type` enum ('creator'|'member', default **creator**); `profiles.account_type` (NOT NULL default creator); private **`member_profiles`** table (owner-only RLS, explicit `authenticated` grants + `anon` revoke, `updated_at` touch); `handle_new_user` now **branches** (creator → creator_profile + free subscription; member → member_profile; both get `user` role); reserves `account`/`member` handles.
- **Server-action tier (T2) wired**: `src/integrations/supabase/auth-client-middleware.ts` (`attachSupabaseToken`) pairs with the generated `requireSupabaseAuth`; `src/lib/account-actions.ts` exposes `getAccountContext` / `getMemberProfile` / `updateMemberProfile` (RLS-scoped, never service role).
- **Pure logic** `src/lib/cabana-account.ts` (account-type resolution, member-profile mapping/normalization, context shaping) — 100% covered by `cabana-account.test.ts` (73 tests total).
- **Client**: signup creator/member toggle (`cabana-auth.ts` `signup({…, accountType})`); account-aware `/dashboard` guard (members → `/account`); new **`/account`** member-profile foundation route; hooks in `src/lib/use-account.ts`.
- **DB tests**: `supabase/tests/member_accounts.sql` (trigger branching + member RLS incl. anon-deny) added to `db:validate` + CI; `smoke.sql` extended.
- **`types.ts`** hand-extended (member_profiles + account_type), commented, pending Lovable regen.

**Verified on Docker:** from-zero `db reset` (baseline + member migration) clean; smoke + behavioral SQL pass; creator signup → creator_profile+subscription, member signup → member_profile, RLS isolates members, anon denied.

**Next:** Phase 2B part 2 (follows + social feed: posts/comments/likes/saves, public-safe views, private media) — gated. Also still pending from 2A: remote `supabase db dump` diff + `migration repair` before any production deploy.

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

**Did NOT:** rename `subscriptions`, add `creator_subscriptions`/`member_profiles`/posts/messaging/notifications/payments, change UI/routes, or touch production data.

**Execution blocker (honest):** the authoring sandbox has **no Docker, no network, no psql**, so a from-zero `supabase db reset` and a remote `supabase db dump` could not be run here. The baseline is **validated by construction** (reconstructed from `types.ts` + the four migrations + architecture doc) and is wired to run for real in CI on a Docker runner. Before trusting it as byte-exact, diff it against a live `supabase db dump` and reconcile remote migration history (`migration repair`). See [`CABANA_DATABASE.md` §"Baseline migration"](../CABANA_DATABASE.md#baseline-migration-phase-2a) and `supabase/README.md`.

**Next:** Phase 2B (member accounts + social feed) — gated on explicit go-ahead and on verifying the baseline against the live DB.

## Current Product State

CABANA currently includes:

- TanStack Start, React 19, Vite, and Tailwind CSS 4.
- File-based TanStack Router routing.
- Supabase Auth with email/password and password recovery.
- Supabase-backed creator profiles, links, products, storage uploads, and analytics events.
- Public creator pages at `/$username`.
- Authenticated creator dashboard.
- Demo-only AI Studio, media kit, settings integrations, and admin portal.
- Luxury dark, glass, chrome, and iridescent CABANA design system.

The application does not yet have production posts, member profiles, follows, creator subscriptions, messages, notifications, tips, transactions, balances, payouts, reports, or audit logs.

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

These are frontend/demo contracts designed to map to future Supabase tables. They do not represent live tables yet.

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

## Validation State

All required checks passed:

```bash
PATH="$HOME/.bun/bin:$PATH" bun run lint
PATH="$HOME/.bun/bin:$PATH" bun run build
PATH="$HOME/.bun/bin:$PATH" bunx tsc --noEmit
```

Results:

- Lint: zero errors.
- Lint retains six existing Fast Refresh warnings in scaffolded shadcn UI files.
- Production client and SSR build: successful.
- TypeScript: successful.
- Vite reports an existing advisory that some shared chunks exceed 500 kB.

Bun was installed at:

```text
~/.bun/bin/bun
```

If `bun` is not in the new shell PATH, use:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

Dependencies are installed in `node_modules`.

## Important Repository Note

The first full lint run exposed 1,069 existing Prettier errors throughout the repository. The repository’s existing `bun run format` command was applied, so many existing source files received formatting-only changes.

Do not interpret every recently modified file as a behavioral change. The intentional functional changes are primarily:

- The new domain/demo files.
- The shared foundation component.
- The nine new route files.
- Dashboard navigation.
- Documentation.
- Generated route-tree updates.

The workspace does not currently contain Git metadata, so there is no local diff history or commit baseline.

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

Before adding production tables:

- The checked-in migrations must be converted into a complete rebuildable baseline.
- Current migrations are incremental and do not fully reproduce the live remote schema.
- The existing `subscriptions` table means CABANA platform SaaS subscriptions, not fan-to-creator subscriptions.
- Future fan subscriptions should use `creator_subscriptions`.
- Current public creator reads can expose `creator_profiles.user_id`.
- Current public storage URLs are unsuitable for premium/private media.

Do not create production tables until the baseline migration and RLS strategy are explicitly approved.

## Recommended Next Task: Phase 1B

Replace the placeholder content with demo-data-driven UI, without adding backend writes.

Recommended order:

1. Add pure helpers:
   - `src/lib/cabana-money.ts`
   - `src/lib/cabana-entitlements.ts`
2. Render demo posts in `/dashboard/posts`.
3. Render demo members/subscriptions in `/dashboard/subscribers`.
4. Render demo transactions and a derived demo balance in `/dashboard/earnings`.
5. Render the creator demo inbox in `/dashboard/messages`.
6. Render creator demo notifications in `/dashboard/notifications`.
7. Build member-facing demo versions for `/feed`, `/messages`, and `/notifications`.
8. Keep `/discover` a curated demo grid using only public-safe creator data.
9. Add unit tests for money calculations and entitlement rules.

Do not start with Supabase migrations or real-time messaging.

## Suggested Phase 1B Acceptance Criteria

- Existing screens remain visually and functionally unchanged.
- New screens use `CABANA_DEMO_DATA`.
- No private or real Supabase data is loaded by member placeholders.
- Demo financial totals are derived, not independently hardcoded.
- Locked-content state comes from a pure entitlement helper.
- No mock action implies a real charge or payout.
- Mobile layouts remain usable.
- Empty and demo-status states are explicit.
- New interactive controls have accessible labels.
- `bun run lint`, `bun run build`, and `bunx tsc --noEmit` pass.

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
src/integrations/supabase/types.ts
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
