# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CABANA is a premium creator OS / link-in-bio / storefront app being evolved into a creator subscription platform. The product name in code and UI is **CABANA** (the repo folder is `LuminaCreatorSuite`). It runs on TanStack Start (SSR) + React 19 + Vite 7 + Tailwind CSS 4, deployed to Cloudflare Workers, with Supabase for auth, data, and storage.

The source-of-truth planning docs are `CABANA_ARCHITECTURE.md`, `docs/CABANA_BUILD_ROADMAP.md`, and `docs/CLAUDE_SESSION_HANDOFF.md`. Read the handoff before starting new work — it tracks phase state and the next recommended task. **End every session by producing an updated handoff** (files changed, routes/components built, whether Supabase schema/data was touched, demo vs. production behavior, and lint/build/tsc results).

## Commands

This project uses **Bun**. If `bun` is not on PATH, prefix with `export PATH="$HOME/.bun/bin:$PATH"`.

```bash
bun run dev            # Vite dev server
bun run build          # Production client + SSR build
bun run lint           # ESLint (Prettier runs as a lint rule — formatting issues are lint errors)
bun run format         # prettier --write . (fixes the formatting lint errors)
bunx tsc --noEmit      # Typecheck (tsconfig has noEmit; this is the only type check)

bun run test           # vitest run (one-shot)
bun run test:watch     # vitest watch mode
bun run test:coverage  # vitest with v8 coverage (thresholds enforced — see below)
bunx vitest run src/lib/cabana-money.test.ts   # run a single test file
bunx vitest run -t "rounds half up"            # run tests matching a name

bun run db:reset       # supabase db reset (rebuild local DB from migrations + seed)
bun run db:validate    # scripts/db-validate.sh — rebuilds a fresh Supabase from zero, runs smoke checks
```

**Tests** use **vitest** (`vitest.config.ts`, separate from `vite.config.ts`). They cover only the _pure_ business layer (no React/Supabase/browser): `cabana-money`, `cabana-entitlements`, `cabana-account`, `cabana-relationships`, `cabana-posts`, `cabana-engagement`, `cabana-subscriptions`, `cabana-messaging`, `cabana-notifications`, `cabana-moderation`. Coverage thresholds are **95%** lines/functions/branches/statements over exactly those files — keep new domain logic in a pure, repository-injected module (like `cabana-relationships.ts`) so it stays testable without a DB.

Before any handoff, the required gate is: `bun run lint`, `bun run build`, `bunx tsc --noEmit`, and `bun run test` all pass. ESLint retains some pre-existing react-refresh Fast Refresh warnings in shadcn UI files; those are expected. `bun run db:validate` requires Docker and exits non-zero with a clear message on hosts without it (e.g. this sandbox) — CI runs it on a Docker-enabled runner.

## Architecture

### Routing & SSR

- File-based **TanStack Router** under `src/routes/`. Flat dot-notation files map to nested paths (`dashboard.posts.tsx` → `/dashboard/posts`). `$username.tsx` is the public creator page at `/$username`.
- **`src/routeTree.gen.ts` is generated — never edit it manually.** It regenerates on dev/build.
- `src/router.tsx` builds the router and injects a React Query `QueryClient` into router context.
- SSR entry is `src/server.ts` (not the bundled TanStack default — `vite.config.ts` redirects `tanstackStart.server.entry` to it, and `wrangler.jsonc` points `main` there). It wraps the handler to catch both thrown errors and h3-swallowed catastrophic 500s, returning a branded error page.
- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which **already bundles** tanstackStart, viteReact, tailwindcss, tsConfigPaths, the Cloudflare plugin, the `@` alias, and VITE\_\* env injection. Do not re-add those plugins or the app breaks with duplicates.

### Supabase layer (`src/integrations/supabase/`)

Three distinct clients — pick by trust boundary:

- **`client.ts`** → `supabase`: browser/anon client (publishable key), used by all React Query hooks. RLS-enforced. Lazily instantiated via a Proxy.
- **`client.server.ts`** → `supabaseAdmin`: **service-role key, bypasses RLS.** Server-only; never import into client code.
- **`auth-middleware.ts`** → `requireSupabaseAuth`: TanStack `createMiddleware` that validates the `Authorization: Bearer` token for server functions and yields a per-request RLS-scoped client + `userId`.

`client.ts`, `client.server.ts`, `auth-middleware.ts`, and `types.ts` are marked auto-generated (Lovable Cloud) — avoid hand-editing.

### Protected server-action tier (T2)

Real, RLS-scoped server functions live in `src/lib/account-actions.ts` (Phase 2B) and `src/lib/relationship-actions.ts` (Phase 2C). Each `createServerFn` composes two middlewares:

1. **`attachSupabaseToken`** (`auth-client-middleware.ts`, client side) reads the current session and attaches `Authorization: Bearer <token>` to the outgoing RPC.
2. **`requireSupabaseAuth`** (`auth-middleware.ts`, server side) validates it and yields a per-request `{ supabase, userId }` scoped to the caller's RLS.

So these handlers run under the caller's RLS, **never the service role**. Conventions:

- **Handlers stay thin.** Validation + behavior live in pure, repository-injected modules (`cabana-account.ts`, `cabana-relationships.ts`) that are unit-tested without a browser or DB. The action file just wires a `*Repository` (real Supabase queries / RPC calls) into those functions.
- **Do not put server-action files under any `**/server/**` path.** `createServerFn` compiles to a client-importable RPC bridge, and the `src/start.ts` import-protection plugin blocks `**/server/**` from client bundles. (`client.server.ts` / `supabaseAdmin` is the service-role exception and _is_ server-only.)
- A global client `functionMiddleware` (`attachSupabaseAuth` in `auth-attacher.ts`) must be registered in `src/start.ts` or the browser never attaches the bearer token. Note `auth-attacher.ts` is auto-generated; `auth-client-middleware.ts` is the hand-editable companion.
- Client consumers wrap these via React Query hooks in `use-account.ts` / `use-relationships.ts`.

### Data access (`src/lib/cabana-store.ts`)

The live data layer. Tables: `creator_profiles`, `links`, `products`, plus `user_roles` and `reserved_handles`. Pattern:

- **Public reads:** `useCreatorByHandle(handle)` — used by the public profile page.
- **Owner reads:** `useCabana()` — current user's profile/links/products.
- **Owner writes:** `useCabanaMutations()` — profile/link/product CRUD + storage uploads, each wrapped with toast error handling and React Query invalidation of `["my-creator"]` / `["creator-by-handle"]`.
- Storage buckets `avatars`, `banners`, `products` are folder-scoped by `user_id` (RLS: `auth.uid() = foldername(name)[1]`).

### Auth & roles

- `src/lib/cabana-auth.ts`: `cabanaAuth` (signup/login/logout/password reset) + `useAuthSession()` / `useCabanaUser()` hooks built on `supabase.auth.onAuthStateChange`.
- Route protection is **client-side**: `dashboard.tsx` redirects to `/login?redirect=...` when no session. There is no server route guard.
- `src/lib/cabana-roles.ts`: `useHasRole("admin"|"moderator"|"user")` reads `user_roles`, resolving from the cached session (no `getUser()` round-trip). Used to gate `/admin`.

### Components

- `src/components/ui/` — shadcn/ui (new-york style, ~46 primitives). Don't reinvent; compose these.
- `src/components/cabana/` — app feature components: `dashboard/` (DashHome, LinkManager, StoreManager, AnalyticsPage, AIStudio, MediaKit, ProfileEditor, SettingsPanel, Sidebar), `auth/AuthShell`, `foundation/FoundationPage`.
- `FoundationPage` is the shared "demo foundation / coming soon" presentation for not-yet-built subscription-platform screens. New placeholder routes (posts, subscribers, messages, earnings, notifications, feed, discover) render through it.

### Design system

Luxury dark / glass / chrome / iridescent aesthetic. Global styles and utility classes (`glass-strong`, `btn-luxury`, `btn-ghost`, `bg-iridescent`, `text-iridescent`, `shadow-luxury`, `animate-float`) live in `src/styles.css`. Tailwind v4 (CSS-config, no `tailwind.config`). Use these classes rather than introducing ad-hoc styling.

## Subscription-platform conventions (in-progress work)

Most of the platform-evolution feature set (posts, fan subscriptions, messages, tips, payouts) still exists only as **frontend demo contracts**, not live tables:

- `src/lib/cabana-types.ts` — domain types (MemberProfile, CreatorPost, CreatorSubscription, Tip, Transaction, Payout, etc.) designed to map to future Supabase tables.
- `src/lib/cabana-demo-data.ts` — deterministic mock generators. Fixed demo clock is **June 25, 2026**; mock provider refs use a `mock_` prefix.

**Now live (real tables + RLS, via migrations):**

- **Member accounts (Phase 2B):** an `account_type` enum (`'creator' | 'member'`) stamped on `public.profiles`, plus `member_profiles`. The `handle_new_user` trigger reads `raw_user_meta_data.account_type` (defaults to `creator`) and provisions a `creator_profiles` row only for creators. Logic in `cabana-account.ts` + `account-actions.ts`.
- **Social graph (Phase 2C):** `follows` and `blocks` tables with behavioral RLS, the `public_creator_profiles` / `public_member_profiles` views (safe public projections incl. `follower_count`), and `SECURITY DEFINER` RPCs `relationship_state`, `relationship_follow_creator`, `relationship_unfollow_creator` (granted to `authenticated` only). Logic in `cabana-relationships.ts` + `relationship-actions.ts`.
- **Posts & feed (Phase 3):** `posts` + `post_media` with public/followers visibility, a **private** `post-media` bucket (signed URLs via `getPostMediaUrls` after `can_view_post`), and ID-free `feed_creator_posts` (locked stubs for non-followers) / `feed_home_posts` RPCs. Logic in `cabana-posts.ts` + `post-actions.ts`; the guest-callable reads use `optionalSupabaseAuth`.
- **Engagement (Phase 3.2):** `post_comments` / `post_likes` / `post_saves` with block-aware RLS (`can_view_post` + `is_engagement_blocked`), soft-deletable comments, and `post_engagement_state` / `post_comments_list` / `post_card` RPCs. Logic in `cabana-engagement.ts` + `engagement-actions.ts`. Post detail at `/post/$postId`.
- **Creator subscriptions (Phase 4, DEMO-ONLY):** `creator_subscription_tiers` + `creator_subscriptions` (fan→creator; the existing `subscriptions` = SaaS plans is **not** renamed). `is_active_subscriber` gates `subscribers` posts in `can_view_post`/feed RPCs; SECURITY DEFINER write RPCs `subscribe_to_creator` (copies tier price, `mock_*` ref — **no real charge**) / `cancel_creator_subscription`. Logic in `cabana-subscriptions.ts` + `subscription-actions.ts`; UI under `components/cabana/subscriptions/`. `purchase` visibility still unsupported.
- **Messaging (Phase 5):** direct (1:1) `conversations` / `conversation_participants` / `messages` (soft-delete) / `message_read_receipts` with participant-scoped RLS via SECURITY DEFINER helpers (`is_conversation_participant`, `is_conversation_blocked`, …) and **Supabase Realtime** (`messages` + receipts in the `supabase_realtime` publication; delivery is RLS-filtered). RPCs: `create_direct_conversation` / `start_conversation_with_username`, `list_conversations`, `conversation_messages`, `mark_conversation_read`, `unread_message_count`. Logic in `cabana-messaging.ts` + `messaging-actions.ts` + `use-messaging.ts`; UI under `components/cabana/messaging/`; routes `/messages` + `/messages/$conversationId`. No paid messages/attachments/notifications.
- **Monetization ledger (Phase 6, DEMO-ONLY):** the internal financial ledger a future Stripe would settle into — **no processor, cards, webhooks, or real money.** Tables: `transactions` (append-only/immutable via a BEFORE UPDATE/DELETE trigger; CHECK that `creator_net = gross − fees`), `creator_balances` (cached projection, recomputed by `recalc_creator_balance`, never the source of truth), `payout_requests` + `payouts`, `tips`, `purchases`, `content_entitlements` (permanent access), plus `posts.price_cents`/`currency` to activate the `purchase` visibility tier. SECURITY DEFINER write RPCs `create_mock_purchase` / `create_mock_tip` / `request_payout` (all `mock_*` refs; fee model = 10% platform + 3% processor, mirrors `cabana-money`) and read RPC `creator_balance`; `has_content_entitlement` is wired into `can_view_post` / `feed_creator_posts` / `post_card` + a buyer posts-RLS policy. `is_current_user_admin()` wraps the (authenticated-revoked) `has_role` for admin read policies. Pure logic in `cabana-money.ts` (`evaluatePayoutEligibility`, `evaluatePurchase`, `entitlementFromPurchase`); server actions in `money-actions.ts`; hooks in `use-money.ts`; UI under `components/cabana/earnings/` (route `/dashboard/earnings`). Purchase unlock CTA in `LockedContentGate`; price authoring in `PostComposer`.
- **Notifications & activity (Phase 7, internal only):** the in-app event/outbox foundation — **no email/push provider** (no Resend/Firebase/Expo/web push). Tables: `notifications` (system-written; `dedupe_key` NOT NULL UNIQUE for idempotency; clients may only flip `read_at`), `activity_events` (canonical append-only log w/ `metadata` jsonb), `notification_preferences` (`in_app`/`email`/`push`; email & push are placeholders), `notification_outbox` (inert future delivery queue; **admin-only**, never user-readable). **Event generation is at the DB layer**: SECURITY DEFINER `emit_notification` (logs activity + idempotent notification + outbox rows per enabled channel; suppresses self/blocked) is called by AFTER INSERT triggers on `follows`/`post_likes`/`post_comments`/`post_saves`/`creator_subscriptions`/`tips`/`purchases`/`messages`/`payout_requests` — so events fire uniformly for both direct-insert and RPC write paths, atomically, with no edits to the Phase 2–6 action files. `notifications` is in the `supabase_realtime` publication (delivery RLS-filtered to the recipient). Pure logic in `cabana-notifications.ts` (`formatNotification`, `groupNotificationsByDay`, `countUnread`, `evaluatePreference`, `isOutboxEligible`, `notificationDedupeKey`, `activityLabel`, mappers); server actions in `notification-actions.ts`; hooks in `use-notifications.ts` (realtime); UI under `components/cabana/notifications/` (`/dashboard/notifications` + auth-gated `/notifications`); live unread badge in the dashboard sidebar.
- **Admin moderation & audit (Phase 8 slice 1, staff only):** the trust & operations foundation — a real moderation queue + an append-only audit trail. **No** admin finance views, payout approval, notification outbox/delivery, email/push, or member-facing report buttons in this slice (the report INSERT path exists and is RLS-correct so those wire in later without a schema change). Tables: `reports` (reporter creates/reads own; staff read + triage; polymorphic `subject_type`/`subject_id`, not FK-constrained) and `audit_logs` (append-only via a BEFORE UPDATE/DELETE `prevent_audit_mutation` trigger permitting only FK-null cascades; system/trigger-written — no client write grant). **Audit generation is at the DB layer**: an AFTER UPDATE trigger `on_report_change_audit` appends an immutable audit row on every report status/assignment change, atomically and uniformly across write paths (the Phase 7 pattern). `is_current_user_staff()` (admin OR moderator) wraps the authenticated-revoked `has_role` for the moderation RLS policies; `current_audit_actor_role()` stamps the actor role on audit rows. Reads/writes are plain RLS-scoped table access (no new RPCs): staff triage via a staff-only UPDATE policy (column-scoped to `status`/`assigned_admin_user_id`/`resolution`). Pure logic in `cabana-moderation.ts` (`validateReportInput`, `canTransitionReport`/`allowedTransitions` state machine, `mapReport`/`mapAuditLog`, queue `countReportsByStatus`/`sortReportsForQueue`, labels, `buildAuditEntry` mirroring the SQL trigger); server actions in `moderation-actions.ts` (`getReports`, `getReportDetail`, `getAuditLogs`, `createReport`, `assignReport`, `updateReportStatus`); hooks in `use-moderation.ts`; UI under `components/cabana/moderation/` behind a `StaffGate` at URL-backed subroutes `/admin/reports` + `/admin/audit` (the existing `admin.tsx` demo tabs are untouched except for nav cards in the Flagged tab). **Phase 8B (next slice): member-facing reporting.** The report creation path (`createReport` in `moderation-actions.ts`, the `validateReportInput` pure logic, and the `reports` INSERT RLS) is already implemented and correct — this slice adds the member-facing reporting UI on top of that existing backend (no schema change expected unless one is required, and only under the standard migration + RLS + behavioral-test gate).

Migrations are ordered and rebuild from zero: `20260511000000_baseline.sql` (profiles, creator_profiles, links, products, analytics_events, subscriptions, user_roles, reserved_handles) → `20260512000000_member_accounts.sql` → `20260513000000_social_relationships.sql` → `20260514000000_posts_feed.sql` → `20260515000000_engagement.sql` → `20260516000000_creator_subscriptions.sql` → `20260517000000_messaging.sql` → `20260518000000_monetization_ledger.sql` → `20260519000000_notifications_activity.sql` → `20260520000000_admin_moderation.sql`. Behavioral tests live in `supabase/tests/` (`smoke.sql`, `member_accounts.sql`, `social_relationships.sql`, `posts_feed.sql`, `engagement.sql`, `creator_subscriptions.sql`, `messaging.sql`, `monetization_ledger.sql`, `notifications.sql`, `admin_moderation.sql`); `supabase/seed.sql` seeds local data (incl. an `aurora` demo `purchase` post and two demo `reports` from a demo member). The pure-layer coverage set (95% gate) is the list enumerated under **Tests** above — keep new domain logic in a repository-injected pure module so it joins that set.

Hard constraints when working here:

- Do **not** treat mock transactions as real money; label all monetization as demo-only. Use **integer cents** for mock money.
- Do **not** add Stripe/payments, real payouts, KYC, or adult-content functionality.
- Do **not** put private member/message data on public routes. `/discover` remains a public placeholder. `/messages`, `/feed`, `/post/$postId` are real and enforce visibility server-side (RLS + feed RPCs / `can_view_post`). `/notifications` is public but **auth-gated on the client**: guests see a foundation, signed-in members get RLS-scoped data (`/dashboard/notifications` is the gated creator/member center). Financial tables and notification tables (`notifications`, `activity_events`, `notification_preferences`, `notification_outbox`) grant **no anon access**; `notification_outbox` is **admin-only**. Notifications are system-written via SECURITY DEFINER triggers (`emit_notification`) — clients may only flip `read_at` (column-scoped grant).
- Treat the `transactions` ledger as **append-only**: never update historical money; record reversals as new `refund` rows. The immutability trigger permits only FK-null cascades (so accounts can be deleted while ledger rows are retained). Likewise `activity_events` is an append-only canonical log.
- Do **not** add new tables, write new migrations, or rename existing tables without an approved migration + RLS design + behavioral tests (the Phase 2B–8 tables landed under exactly that gate; the rest of Phase 8 and phases beyond it are gated and must not start automatically). `audit_logs` is **append-only** (system/trigger-written; no client write grant) — never edit/delete audit rows. Note: existing `subscriptions` = CABANA SaaS plans; fan-to-creator subscriptions must use `creator_subscriptions`.
- Keep domain logic Supabase-ready with RLS-ready ownership models; keep changes small and reviewable.

## Environment

`.env` provides `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (server) and `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` (client, Vite-injected). `SUPABASE_SERVICE_ROLE_KEY` is required for `supabaseAdmin` and must never reach the client. Supabase migrations live in `supabase/migrations/`.
