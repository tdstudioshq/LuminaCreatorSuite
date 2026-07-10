# CABANA — Project State (Engineering Checkpoint)

> Canonical high-level engineering snapshot.
> Checkpoint: **July 9, 2026** — branch `main` @ `5963a18` ("chore(cleanup): remove retired marketing landing, orphaned assets & dead mock module"),
> the previously-uncommitted working set now **committed** as ~14 themed commits on top of `6c35f5b` (Phase 0 QA fixes + Batch 1 Trust & Honesty + Batch 2 Core UX + two DB migrations + hygiene/cleanup — see below). **Not yet pushed or deployed** at this checkpoint.
> Platform-evolution phases **through 11B (creator analytics) are complete**.
> Canonical Supabase backend: cloud project `rpzaeqoqcaxxavltgvpe` ("cabanadatabase"), reconciled July 7, 2026;
> deploy target **Vercel** (production `cabanagrp.com`).
> Demo clock / "today" in code: **June 25, 2026**.
> Audience: a brand-new engineer who needs to understand CABANA end-to-end in under 15 minutes.
>
> This document is a **point-in-time checkpoint**, not a substitute for the living source-of-truth docs:
> [`CABANA_ARCHITECTURE.md`](../CABANA_ARCHITECTURE.md),
> [`docs/CABANA_BUILD_ROADMAP.md`](./CABANA_BUILD_ROADMAP.md),
> [`docs/CLAUDE_SESSION_HANDOFF.md`](./CLAUDE_SESSION_HANDOFF.md),
> and [`CLAUDE.md`](../CLAUDE.md). When those disagree with this file, they win and this file is stale.
> The detailed phase write-ups and DB inventory below were captured at the **Phase 5 boundary**; Phases 6–11B
> are summarized under "Remaining Roadmap" and enumerated fully in `CLAUDE.md`.

---

# July 8, 2026 — UI/UX audit + Batch 1 (Trust & Honesty)

- A read-only production-readiness UI/UX audit (21 auditors + adversarial verification + coverage critic) produced
  303 raw → **249 confirmed** findings: 0 Critical, 9 High, ~116 Medium, ~130 Low; section scores 5–7.5
  (overall ≈6.5/10; weakest surfaces: links/store/media-kit/settings at 5). Top themes: fake-presented-as-real,
  failures rendering as fake zeros, silent list caps, two auth visual languages, reduced-motion ignored,
  deletes without confirm, shared "CABANA" tab titles. The full report was delivered in-session (not stored in repo).
- Approved plan: **Batch 1 Trust & Honesty (COMPLETE, committed) → 2 Core UX (COMPLETE, committed) → 3 Accessibility →
  4 Creator Workflow → 5 Design System → 6 Marketing & Polish**. Batches 2–6 are open work; each batch ends with
  the full gate + approval stop.
- **Batch 1 delivered** (17 files + 1 new component + 1 deleted asset), verified via an authenticated Playwright
  walkthrough on a local Docker stack: `MediaKit.tsx` hero bound to the real `useCabana()` profile with
  "Sample data — demo preview" labeling; `SettingsPanel.tsx` drops all fake connection states (Stripe rests as
  "After payments launch", other integrations/socials "Coming soon"/"Not linked", `@aurora` handles and the fake
  "SSL active" badge removed); `routes/admin.tsx` hub labeled as a demo shell around the 5 real tools
  (Reports · Audit · Finance · Ledger · Payouts) with all handler-less controls disabled; `Sidebar.tsx` /
  `ProfileEditor.tsx` "Preview public page" no longer falls back to the `aurora` demo handle; `routes/td.tsx`
  fake follow → real Instagram link; new **`src/components/cabana/QueryErrorState.tsx`** shared error card, wired
  into `BalanceCard`, `HistoryCard` + the four histories, `SubscribersDashboard`, `LinkManager`, `StoreManager`,
  `AnalyticsPage`, `DashHome` (convention: query failures must NEVER render fake business data like $0.00 or
  "No X yet"); `LinkManager` "Schedule for later" promise removed; orphaned `src/assets/aurora-hero.jpg` deleted.
- Also committed on top of `6c35f5b`: the QA Critical/High bug-fix pass (messaging + admin-ledger Outlets,
  admin finance `display_name`→`name` embed fix, login signup/forgot links, chart color tokens, follow-unlock
  invalidation, composer tier warnings, **strict UUID validation restored** (+ v4 seeds), notification/activity
  reads **recipient-scoped** to fix the admin-read leak) and migrations
  `20260529000000_post_media_service_grant.sql` + `20260530000000_high_qa_fixes.sql` (each with a behavioral
  test; **committed but not yet applied to the cloud project**).
- Gate at checkpoint: `bunx tsc --noEmit` clean · `bun run lint` 0 errors (6 expected shadcn react-refresh
  warnings) · `bun run test` **337/337** (16 files, 99.53% stmts / 95.8% branch coverage) · `bun run build`
  green (Vercel/Nitro output).

---

# Project Overview

CABANA is a premium creator OS — link-in-bio + storefront + media-kit + first-party analytics — being
evolved **additively** into a creator subscription platform (members, follows, fan subscriptions,
posts, messaging, tips, payouts). The product name in code and UI is **CABANA**; the repo folder is
`LuminaCreatorSuite`.

The guiding rule of the evolution: **preserve all existing creator functionality**. Each phase adds
backend tables/RLS and a thin, RLS-scoped server-action tier in strict dependency order, and never
moves real money or touches production Supabase without an explicit, gated approval.

## Current architecture

- **SSR web app on TanStack Start** (React 19 + Vite 7), deployed to **Vercel** (Nitro `vercel` preset →
  `.vercel/output`; production **cabanagrp.com**).
- **Supabase** provides auth, Postgres (with RLS), and storage.
- **Three Supabase trust boundaries**, chosen per call site:
  - `supabase` (anon/publishable key, RLS-enforced) — all browser React Query hooks.
  - `supabaseAdmin` (service-role key, **bypasses RLS**, server-only) — never imported into client code.
  - `requireSupabaseAuth` middleware — validates the caller's `Authorization: Bearer` token and yields
    a **per-request RLS-scoped client + `userId`** for protected server functions.
- **Two access tiers for data:**
  - **T1 — direct RLS reads/writes** from the browser anon client via hooks in `cabana-store.ts`
    (creator profile/links/products/analytics) and lightweight guard reads (`useAccountType`, `useHasRole`).
  - **T2 — protected server actions** (`createServerFn`) that run under the caller's RLS, used for the
    account-type model and the social graph. Handlers are thin; validation/behavior live in pure,
    repository-injected modules so they are unit-testable without a DB or browser.
- **Routing is file-based** (TanStack Router under `src/routes/`); `routeTree.gen.ts` is generated.
- **Route protection is client-side** (no server route guard yet): `dashboard.tsx` and `account.tsx`
  redirect based on session + account type. Server **actions** are independently protected by the auth
  middleware, so security does not depend on the client guard.

## Technology stack

| Layer                     | Choice                                                           | Version (at capture) |
| ------------------------- | ---------------------------------------------------------------- | -------------------- |
| UI runtime                | React / React DOM                                                | 19.2                 |
| Meta-framework (SSR)      | @tanstack/react-start                                            | 1.167                |
| Routing                   | @tanstack/react-router                                           | 1.168                |
| Server state              | @tanstack/react-query                                            | 5.83                 |
| Bundler / dev             | Vite                                                             | 7.3                  |
| Styling                   | Tailwind CSS 4 (CSS-config, no `tailwind.config`)                | 4.2                  |
| Animation                 | Framer Motion                                                    | 12.38                |
| Backend SDK               | @supabase/supabase-js                                            | 2.105                |
| Validation                | zod (server-action input shaping is hand-rolled in pure modules) | 3.24                 |
| Deploy target             | **Vercel** (Nitro `vercel` preset → `.vercel/output`)            | —                    |
| Language                  | TypeScript                                                       | 5.8                  |
| Tests                     | Vitest (v8 coverage)                                             | 4.1                  |
| Package manager / runtime | **Bun**                                                          | —                    |

Vite config uses `@lovable.dev/vite-tanstack-config`, which **already bundles** tanstackStart, viteReact,
tailwindcss, tsConfigPaths, the Cloudflare plugin, the `@` alias, and `VITE_*` env injection — do not
re-add those plugins. The bundled Cloudflare plugin (and `wrangler.jsonc`, which it reads) is build-side
only; the actual deploy target is **Vercel** via `nitro: { preset: "vercel" }` in `vite.config.ts`.

## Repository layout

```text
LuminaCreatorSuite/
├── CLAUDE.md                         # Agent/dev guidance (commands + architecture)
├── CABANA_ARCHITECTURE.md            # Source-of-truth architecture
├── CABANA_DATABASE.md                # DB/baseline notes
├── docs/
│   ├── CABANA_BUILD_ROADMAP.md       # Phase plan + table/route contracts
│   ├── CLAUDE_SESSION_HANDOFF.md     # Per-session phase state + next task
│   └── CABANA_PROJECT_STATE.md       # ← this checkpoint
├── src/
│   ├── routes/                       # File-based TanStack routes (flat dot-notation)
│   ├── router.tsx  server.ts  start.ts   # Router + SSR entry + Start middleware
│   ├── routeTree.gen.ts              # GENERATED — never hand-edit
│   ├── integrations/supabase/
│   │   ├── client.ts                 # anon browser client (RLS)            [auto-gen]
│   │   ├── client.server.ts          # service-role admin client (server)   [auto-gen]
│   │   ├── auth-middleware.ts         # requireSupabaseAuth (server)         [auto-gen]
│   │   ├── auth-client-middleware.ts  # attachSupabaseToken (client)         [editable]
│   │   ├── auth-attacher.ts           # global functionMiddleware            [auto-gen]
│   │   └── types.ts                   # generated DB types                   [auto-gen]
│   ├── lib/
│   │   ├── cabana-store.ts           # T1 creator data hooks (profile/links/products)
│   │   ├── cabana-auth.ts            # signup/login/logout + session hooks
│   │   ├── cabana-roles.ts           # useHasRole (admin/moderator/user)
│   │   ├── cabana-account.ts         # PURE account-type + member-profile domain
│   │   ├── account-actions.ts        # T2 protected account server functions
│   │   ├── use-account.ts            # account React hooks
│   │   ├── cabana-relationships.ts   # PURE relationship domain (repo-injected)
│   │   ├── relationship-actions.ts   # T2 protected relationship server functions
│   │   ├── use-relationships.ts      # relationship React hooks (useFollow)
│   │   ├── cabana-money.ts           # PURE integer-cents money helpers (demo only)
│   │   ├── cabana-entitlements.ts    # PURE entitlement rules (demo only)
│   │   ├── cabana-types.ts           # future-platform domain contracts (demo)
│   │   └── *.test.ts                 # Vitest suites for the 16 pure modules (337 tests)
│   ├── components/
│   │   ├── ui/                       # shadcn/ui (new-york, ~46 primitives)
│   │   └── cabana/                   # app feature components (dashboard/, auth/, foundation/)
│   └── styles.css                    # luxury dark/glass/chrome design system + utilities
├── supabase/
│   ├── migrations/                   # ordered, rebuild-from-zero SQL
│   ├── tests/                        # smoke + behavioral SQL (psql, ON_ERROR_STOP)
│   ├── seed.sql  config.toml  README.md
│   └── _archive/pre_baseline_migrations/   # superseded incremental migrations
├── scripts/db-validate.sh            # rebuild-from-zero + smoke (needs Docker)
├── vitest.config.ts                  # standalone test config (pure modules only)
└── .github/workflows/ci.yml          # verify job + Docker db-validate job
```

---

# Completed Phases

> Phase progression to date: **1A → 1C → 2A → 2B → 2C → 3 → 3.2 → 4 → 5 → 6 → 7 → 8 (+8B/8C) → 9A →
> 9B → 10 → 11A → 11B — all complete** as of July 8, 2026. (There is no separately-tracked "1B" in the
> current docs; phase 1 work was captured as the 1A demo-foundation and 1C hardening passes.) Every
> phase is green on `lint` / `tsc` / `test` / `build` plus the SQL suites on a real Docker-backed
> Postgres and on CI. Detailed write-ups below stop at **Phase 5**; Phases 6–11B are summarized under
> "Remaining Roadmap" below and enumerated fully in [`CLAUDE.md`](../CLAUDE.md).

## Phase 1A — Demo foundation & pure helpers

- **Objectives:** Establish the subscription-platform's shared domain contracts, deterministic mock
  data, and route-complete (but non-functional) UI foundations — without any new tables or money.
- **Completed work:**
  - `src/lib/cabana-types.ts` — domain types for the future platform (MemberProfile, CreatorPost,
    CreatorSubscription, Tip, Transaction, Payout, etc.), designed to map to future Supabase tables.
  - `src/lib/cabana-demo-data.ts` — deterministic mock generators; fixed demo clock **June 25, 2026**;
    mock provider refs prefixed `mock_`. _(Removed in the July 9, 2026 cleanup once its last consumer,
    `DemoMessages`, was deleted — no longer in the tree.)_
  - `src/lib/cabana-money.ts` — pure integer-cents money helpers (demo-only money).
  - `src/lib/cabana-entitlements.ts` — pure entitlement rules.
  - `FoundationPage` shared "coming soon / demo foundation" screen; placeholder routes render through it.
- **Migrations:** none.
- **Server actions:** none.
- **React hooks:** none beyond existing creator hooks.
- **Routes:** placeholder routes — `/dashboard/posts`, `/dashboard/subscribers`, `/dashboard/messages`,
  `/dashboard/earnings`, `/dashboard/notifications`, `/feed`, `/discover`, `/messages`, `/notifications`.
- **Tests:** Vitest suites for the pure modules — `cabana-money.test.ts` (34), `cabana-entitlements.test.ts` (25).
- **Documentation:** roadmap §§5–12 (table/route/component/monetization/messaging/notifications plans).
- **Validation status:** ✅ lint/tsc/test/build green. No DB touched.

## Phase 1C — Current-app hardening

- **Objectives:** Harden the existing creator OS (validation, error handling, types) before any
  backend expansion — no new product surface.
- **Completed work:** validation helpers (`cabana-validation.ts`), `coming-soon.ts`, error capture /
  branded error page (`error-capture.ts`, `error-page.ts`), tightened existing creator data flows in
  `cabana-store.ts`, and analytics helper (`cabana-analytics.ts`).
- **Migrations / server actions / new hooks / new routes:** none (hardening only).
- **Tests:** covered indirectly by the existing pure-module suites; no new tables to test.
- **Documentation:** captured in the session handoff progression notes.
- **Validation status:** ✅ lint/tsc/test/build green.

## Phase 2A — Supabase baseline + CI

- **Objectives:** Make the database **rebuildable from zero** and wire continuous verification, so all
  later phases build on a reproducible schema. Infrastructure only — no product features.
- **Completed work:**
  - `supabase/migrations/20260511000000_baseline.sql` — a **squashed** baseline reconstructing the
    entire existing schema (the four original incremental migrations could not rebuild from zero on
    their own; they were moved to `supabase/_archive/pre_baseline_migrations/`).
  - `supabase/seed.sql` (the `aurora` demo creator so `/demo` and `/$username` render),
    `supabase/config.toml`, `supabase/tests/smoke.sql`, `supabase/README.md`.
  - `scripts/db-validate.sh` and `package.json` scripts `db:reset` / `db:validate`.
  - `.github/workflows/ci.yml` — a `verify` job (lint · tsc · test · build) and a Docker-based
    `db-validate` job (rebuild-from-zero + smoke).
- **Migrations:** `20260511000000_baseline.sql`.
- **Server actions / hooks / routes:** none.
- **Tests:** `supabase/tests/smoke.sql` (tables/enum/functions/trigger/RLS/buckets/seed assertions).
- **Documentation:** `CABANA_DATABASE.md` (§ baseline migration), `supabase/README.md`.
- **Validation status:** ✅ Verified on **real Docker** (`supabase db reset` from zero) and **green CI**
  (run `28170007528`). ⚠️ **Deferred:** remote schema reconciliation against the live project
  (`supabase db dump` diff + `migration repair`) — not run because no remote token/DB password is
  present and `migration repair` mutates remote history. Do not treat the baseline as byte-exact with
  production until that is done.

## Phase 2B — Member accounts & protected server-action tier

- **Objectives:** Introduce the first real **member vs creator** account model and the first
  **RLS-scoped protected server-action tier**, purely additively (existing creator behavior unchanged).
- **Completed work:**
  - `public.account_type` enum (`'creator' | 'member'`); `profiles.account_type` column
    (NOT NULL, default `creator`).
  - `public.member_profiles` table (owner-only RLS, no public read).
  - Signup trigger `handle_new_user` branches on `raw_user_meta_data.account_type`: creators get the
    existing provisioning (creator profile + free plan + role); members get a member profile + role.
  - First protected server-action tier: `attachSupabaseToken` (client) + `requireSupabaseAuth` (server).
  - Pure domain module `cabana-account.ts`; thin actions in `account-actions.ts`; hooks in `use-account.ts`.
  - `/account` route — member account home (noindex), with a creator→`/dashboard` bounce.
- **Migrations:** `20260512000000_member_accounts.sql`.
- **Server actions:** `getAccountContext`, `getMemberProfile`, `updateMemberProfile`.
- **React hooks:** `useAccountType`, `useAccountContext`, `useMemberProfile`, `useUpdateMemberProfile`.
- **Routes:** `/account` (member); `/dashboard` and `/account` updated to gate by account type.
- **Tests:** `cabana-account.test.ts` (14); `supabase/tests/member_accounts.sql` (account-type trigger
  branching + member-profile RLS isolation).
- **Documentation:** session handoff (Phase 2B), `CABANA_DATABASE.md`.
- **Validation status:** ✅ lint/tsc/test/build + SQL suites green on Docker and CI.

## Phase 2C — Social relationship foundation

- **Objectives:** Add the **relationship graph only** — public identity, follows, blocks, and ID-free
  public profile views — with complete RLS and behavioral tests. No posts/feed/messaging/subscriptions/payments.
- **Completed work:**
  - `member_profiles.username` (public, collision-safe, validated, reserved-handle-checked); signup
    trigger extended to assign member usernames.
  - `public.follows` (account → creator) and `public.blocks` (account → account) with unique
    constraints, indexed reverse FKs, authenticated-only grants, and full owner/creator RLS.
  - `SECURITY DEFINER` RPCs `relationship_state`, `relationship_follow_creator`,
    `relationship_unfollow_creator` (granted to `authenticated` only; derive the actor from `auth.uid()`,
    expose no UUIDs, refuse self-follow and follow-while-blocked).
  - Helper `is_current_user_creator(uuid)` so RLS can check creator ownership without granting table
    SELECT on `creator_profiles` (which would leak `user_id`).
  - ID-free public views `public_creator_profiles` and `public_member_profiles` (username, display name,
    avatar/banner, bio, placeholder verified/post counts, follower/following counts — no UUIDs/email/plan/theme).
  - Pure domain module `cabana-relationships.ts` (repository-injected); thin actions in
    `relationship-actions.ts`; hooks in `use-relationships.ts`. The public creator-page follow toggle is
    now persistent.
- **Migrations:** `20260513000000_social_relationships.sql`.
- **Server actions:** `followCreator`, `unfollowCreator`, `blockUser`, `unblockUser`,
  `getRelationshipState`, `getFollowerCount`, `getFollowingCount`.
- **React hooks:** `useRelationship`, `useFollow`.
- **Routes:** none added; existing `/$username` creator page upgraded to persistent follow state.
- **Tests:** `cabana-relationships.test.ts` (10); `supabase/tests/social_relationships.sql` (uniqueness,
  RLS isolation, creator follower visibility, anonymous denial, safe-view columns/counts, RPC behavior).
- **Documentation:** session handoff (Phase 2C — current "Latest Status").
- **Validation status:** ✅ 83 unit tests pass at 100% configured coverage; migration applies from zero;
  smoke + member-account + social-relationship SQL suites pass on Docker and CI.

## Phase 3 — Posts & Feed Foundation

- **Objectives:** Add the **smallest real publishing slice** — creators compose text + image posts with
  `public`/`followers` visibility; members/guests read an entitlement-correct feed; media stays private
  behind authorization-gated signed URLs. No comments/likes/saves, no subscriptions/monetization.
- **Completed work:**
  - `posts` + `post_media` tables, `post_visibility`/`post_status`/`post_media_kind` enums, indexes, and
    owner/public/follower RLS. A **private** `post-media` storage bucket with owner-scoped object policies.
  - Helpers `is_following_creator(uuid)` and `can_view_post(uuid)`; ID-free RPCs `feed_creator_posts`
    (returns followers-only posts to non-followers as **locked stubs** with caption/media blanked) and
    `feed_home_posts`. `is_following_creator`/`is_current_user_creator` grants extended to `anon` because
    the posts SELECT policies are OR-evaluated for anonymous readers.
  - Pure module `cabana-posts.ts`; thin actions in `post-actions.ts`; hooks in `use-posts.ts`. New
    `optionalSupabaseAuth` middleware makes the creator feed guest-callable while resolving a signed-in
    viewer's `auth.uid()`. `getPostMediaUrls` is the only place the service role signs storage — gated by
    `can_view_post`.
  - UI under `src/components/cabana/posts/`; `/dashboard/posts` (real composer + manager, replaced
    `DemoPosts`), `/feed` (real home feed), `/$username` (public posts + locked teases).
- **Migrations:** `20260514000000_posts_feed.sql`.
- **Server actions:** `createPost`, `updatePost`, `publishPost`, `archivePost`, `deletePost`,
  `addPostMedia`, `deletePostMedia`, `getOwnPosts`, `getCreatorFeed`, `getHomeFeed`, `getPostMediaUrls`.
- **React hooks:** `useCreatorFeed`, `useHomeFeed`, `useOwnPosts`, `usePostMediaUrls`, `useCreatePost`,
  `useUpdatePost`, `usePublishPost`, `useArchivePost`, `useDeletePost`, `useUploadPostMedia`,
  `useDeletePostMedia`.
- **Routes:** `/dashboard/posts`, `/feed` rebuilt; `/$username` augmented with a Posts section.
- **Tests:** `cabana-posts.test.ts` (33); `supabase/tests/posts_feed.sql` (owner CRUD, anon public read,
  follower gating, locked stubs, no draft/subscriber leakage, `can_view_post` truth table, owner-only
  `post_media`, private bucket); `smoke.sql` extended; CI `db-validate` runs `posts_feed.sql`.
- **Documentation:** session handoff (Phase 3); this checkpoint.
- **Validation status:** ✅ migration applies from zero; `posts_feed.sql` passes; lint/tsc/test/build green.

## Phase 3.2 — Engagement Foundation

- **Objectives:** Add low-risk engagement primitives (comments, likes, saves) on top of the post system.
  No monetization, messaging, notifications, or real-time.
- **Completed work:**
  - `post_comments` (1–2000 chars, `comment_status` soft-delete), `post_likes`, `post_saves`
    (unique per user/post, private). Block-aware RLS gated by `can_view_post` + `is_engagement_blocked`;
    `is_current_user_post_owner` helper; ID-free RPCs `post_engagement_state`, `post_comments_list`,
    `post_card`.
  - Pure `cabana-engagement.ts` (+ tests); `engagement-actions.ts`; `use-engagement.ts`.
  - UI: `EngagementBar`, `CommentComposer`, `CommentList`, `PostDetail`; `/post/$postId` route;
    `PostCard` shows like/comment/save.
- **Migrations:** `20260515000000_engagement.sql`.
- **Server actions:** `addComment`, `editComment`, `deleteComment`, `hideComment`, `likePost`,
  `unlikePost`, `savePost`, `unsavePost`, `getPostEngagementState`, `getPostComments`, `getPost`.
- **React hooks:** `usePostEngagementState`, `usePostComments`, `usePost`, `usePostLike`, `usePostSave`,
  `useAddComment`, `useEditComment`, `useDeleteComment`, `useHideComment`.
- **Routes:** `/post/$postId` (post detail); `PostCard` engagement bar across feed/creator/detail.
- **Tests:** `cabana-engagement.test.ts`; `supabase/tests/engagement.sql` (comment/like/save RLS,
  uniqueness, viewability gating, block enforcement, creator hide, author soft-delete, anon public-comment
  read, anon write denial). `smoke.sql` extended; `db-validate.sh` + CI run it.
- **Validation status:** ✅ unit tests pass (engagement module 100%); migration applies from zero; all
  five SQL suites pass through the DB container; lint/tsc/build green.

## Phase 4 — Creator Subscriptions & Mock Entitlements

- **Objectives:** Fan-to-creator subscriptions (DEMO-ONLY) and wiring the `subscribers` post tier to a real
  entitlement. No payment provider, charge, payout, or KYC. The existing `subscriptions` table is **not**
  renamed; `purchase` visibility stays deferred.
- **Completed work:**
  - `creator_subscription_tiers` (creator-defined, integer-cent prices) + `creator_subscriptions`
    (member↔creator, unique live pair, `mock_*` ref). `is_active_subscriber` helper; write RPCs
    `subscribe_to_creator` (copies tier price, no charge) / `cancel_creator_subscription`; read RPCs
    `creator_subscription_state` / `creator_subscribers_list`. `can_view_post`, `feed_creator_posts`, and
    `post_card` extended so subscriber posts unlock for subscribers and lock (stub) for others.
  - Pure `cabana-subscriptions.ts` (+ tests); `subscription-actions.ts`; `use-subscriptions.ts`.
    `cabana-posts` now permits `subscribers` visibility.
  - UI: `SubscriptionTierCard`, `CreatorSubscribePanel` (mock-checkout dialog, "Demo" banner, no card
    fields), `SubscribersDashboard`; real `/dashboard/subscribers`, subscribe panel on `/$username`,
    Subscribers option in the composer, Subscribe CTA in `LockedContentGate`.
- **Migrations:** `20260516000000_creator_subscriptions.sql`.
- **Server actions:** `upsertTier`, `setTierActive`, `getMyTiers`, `getCreatorTiers`, `subscribeToCreator`,
  `cancelSubscription`, `getSubscriptionState`, `getCreatorSubscribers`.
- **React hooks:** `useCreatorTiers`, `useMyTiers`, `useSubscriptionState`, `useCreatorSubscribers`,
  `useSubscribe`, `useUpsertTier`, `useSetTierActive`.
- **Routes:** `/dashboard/subscribers` (real); subscribe panel + tier cards on `/$username`.
- **Tests:** `cabana-subscriptions.test.ts`; `supabase/tests/creator_subscriptions.sql` (tier RLS, demo
  subscribe/cancel, unique live pair, subscriber entitlement + feed locking, self-subscribe rejection,
  direct-write denial, creator subscriber visibility, anon denial). `smoke.sql` + `posts_feed.sql` updated;
  `db-validate.sh` + CI run it.
- **Validation status:** ✅ unit tests pass (subscriptions module 100%); migration applies from zero; all
  **six** SQL suites pass through the DB container; lint/tsc/build green.

## Phase 5 — Messaging Foundation

- **Objectives:** Direct (1:1) conversations, messages, and read receipts with participant-scoped RLS and
  Supabase Realtime. No paid messages, attachments, or notifications.
- **Completed work:**
  - `conversations`, `conversation_participants`, `messages` (soft-delete), `message_read_receipts`;
    SECURITY DEFINER participant/block helpers (recursion-safe RLS); RPCs `create_direct_conversation` /
    `start_conversation_with_username` / `list_conversations` / `conversation_header` /
    `conversation_messages` / `mark_conversation_read` / `unread_message_count`; bump trigger for inbox
    ordering; `messages` + receipts added to the `supabase_realtime` publication.
  - Pure `cabana-messaging.ts` (+ tests, repository-injected); `messaging-actions.ts`; `use-messaging.ts`
    with Realtime subscriptions (live messages/receipts/inbox; auto-reconnect).
  - UI: `Inbox`, `ConversationView` (auto-scroll, mark-read, typing placeholder), `MessageBubble`,
    `MessageComposer`; real `/messages` + new `/messages/$conversationId`; `/$username` Message button.
- **Migrations:** `20260517000000_messaging.sql`.
- **Server actions:** `createConversation`, `startConversationWithUsername`, `getConversations`,
  `getConversation`, `getMessages`, `sendMessage`, `editMessage`, `deleteMessage`, `markConversationRead`,
  `getUnreadCount`.
- **React hooks:** `useConversations`, `useConversation`, `useMessages`, `useSendMessage`,
  `useUnreadMessages`, `useCreateConversation`, `useStartConversationWithUsername`, `useEditMessage`,
  `useDeleteMessage`, `useMarkConversationRead`.
- **Routes:** `/messages` (real inbox), `/messages/$conversationId` (thread).
- **Tests:** `cabana-messaging.test.ts`; `supabase/tests/messaging.sql` (conversation/message/receipt RLS,
  participant isolation, unread, receipts, edit/delete rules, block enforcement, self-conversation + anon
  denial). `smoke.sql` extended; `db-validate.sh` + CI run it.
- **Validation status:** ✅ unit tests pass (messaging module 100%); migration applies from zero; all
  **seven** SQL suites pass through the DB container; lint/tsc/build green.

---

# Current Database

Schema is rebuilt from zero by **20 ordered migrations** — `20260511000000_baseline.sql` through
`20260530000000_high_qa_fixes.sql` (the last two — `20260529` post-media service grant and `20260530`
high-QA fixes — are **committed but not yet applied to the cloud project**); the full
chain is enumerated in [`CLAUDE.md`](../CLAUDE.md). The inventory below is the **Phase 5 checkpoint**
(first seven migrations, 22 tables). Phases 6–11B since added the monetization ledger
(`transactions`/`creator_balances`/`payout_requests`/`payouts`/`tips`/`purchases`/`content_entitlements`),
notifications & activity (`notifications`/`activity_events`/`notification_preferences`/`notification_outbox`),
moderation & audit (`reports`/`audit_logs`), the notification-engine and creator-analytics RPCs, corrective
grant migrations, profile customization columns, the post-media service grant, and the high-QA fixes
(real `public_creator_profiles.post_count`, purchase/payout advisory locks) — see `CLAUDE.md` for those objects.

## Tables (22 — Phase 5 checkpoint)

| Table                        | Purpose                                                                                     | Read access                                                                                             | Write access                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `profiles`                   | Shared identity, 1:1 with `auth.users`; holds `account_type`.                               | Owner only                                                                                              | Owner update (insert via trigger)                                                 |
| `creator_profiles`           | Public creator presence; drives `/$username`. `user_id` nullable (ownerless `aurora` seed). | **Public** (note: exposes `user_id`)                                                                    | Owner insert/update                                                               |
| `links`                      | Smart-link blocks on the public page.                                                       | Public                                                                                                  | Owner (via parent profile)                                                        |
| `products`                   | Storefront products.                                                                        | Public                                                                                                  | Owner (via parent profile)                                                        |
| `analytics_events`           | First-party page/link/product events.                                                       | Owner (creator) read                                                                                    | Anyone may insert for a real profile                                              |
| `subscriptions`              | **CABANA SaaS plan** per account (NOT fan-to-creator).                                      | Owner read                                                                                              | Trigger/service-side only                                                         |
| `user_roles`                 | Authorization roles.                                                                        | Owner read; admins read all                                                                             | Admins manage                                                                     |
| `reserved_handles`           | Handles that cannot be claimed.                                                             | Public read                                                                                             | — (seed/admin)                                                                    |
| `member_profiles`            | Private member identity + public `username`.                                                | Owner only                                                                                              | Owner insert/update (no delete)                                                   |
| `follows`                    | account → creator follow edges.                                                             | Follower reads own; creator reads own followers                                                         | Follower insert/delete                                                            |
| `blocks`                     | account → account blocks (private to blocker).                                              | Blocker only                                                                                            | Blocker insert/delete                                                             |
| `posts`                      | Creator posts (`public`/`followers`/subscribers/purchase visibility, draft→published).      | Public reads published-public; followers read published-followers they follow; owner reads all          | Owner (creator) CRUD                                                              |
| `post_media`                 | Image metadata for a post; objects live in the private `post-media` bucket.                 | **Owner only** (viewers get signed URLs via `getPostMediaUrls`)                                         | Owner CRUD                                                                        |
| `post_comments`              | Comments on posts (`visible`/`hidden`/`deleted`; soft-delete).                              | Visible comments on viewable posts (anon → public only); authors read own; owners read all on own posts | Author edit/soft-delete own; owner hide; insert requires viewability + no block   |
| `post_likes`                 | Likes (unique per user/post; private to actor).                                             | Owner only (counts via RPC)                                                                             | Insert/delete own; requires viewability + no block                                |
| `post_saves`                 | Saves (unique per user/post; private to actor).                                             | Owner only                                                                                              | Insert/delete own; requires viewability + no block                                |
| `creator_subscription_tiers` | Creator-defined demo subscription tiers (integer-cent price).                               | Public reads ACTIVE; owner reads all                                                                    | Owner CRUD                                                                        |
| `creator_subscriptions`      | Member→creator demo subscriptions (unique live pair; `mock_*` ref, no real money).          | Member reads own; creator reads subs to own profile; anon revoked                                       | **RPC-only** (`subscribe_to_creator`/`cancel_creator_subscription`)               |
| `conversations`              | Direct (1:1) conversation container.                                                        | Participants only (via `is_conversation_participant`)                                                   | RPC-only (`create_direct_conversation`)                                           |
| `conversation_participants`  | Membership rows (unique `conversation_id, user_id`).                                        | Participants only                                                                                       | RPC-only / cascade                                                                |
| `messages`                   | Messages (`text`/`system`; `deleted_at` soft-delete).                                       | Participants only                                                                                       | Sender insert (`text`, in-conversation, not blocked); sender edit/soft-delete own |
| `message_read_receipts`      | Per-message read markers (unique `message_id, reader_id`).                                  | Participants only                                                                                       | Reader insert own (via `mark_conversation_read`)                                  |

## Public views (2)

| View                      | Exposes                                                                                                                                            | Notes                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public_creator_profiles` | username, display_name, avatar_url, banner_url, bio, verified (placeholder `false`), follower_count, following_count, post_count (placeholder `0`) | `security_barrier`, `security_invoker = false` (runs with owner privileges to aggregate private `follows`); granted to `anon` + `authenticated`. No UUIDs/email/plan/theme. |
| `public_member_profiles`  | username, display_name, avatar_url, banner_url (null), bio, verified (`false`), follower_count (`0`), following_count, post_count (`0`)            | Same safety model; the only public projection of otherwise-private member profiles.                                                                                         |

## Enums (8)

| Enum                          | Values                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `app_role`                    | `admin`, `moderator`, `user`                                                      |
| `account_type`                | `creator`, `member`                                                               |
| `post_visibility`             | `public`, `followers`, `subscribers`, `purchase`                                  |
| `post_status`                 | `draft`, `scheduled`, `published`, `archived`                                     |
| `post_media_kind`             | `image`, `video`, `audio`                                                         |
| `comment_status`              | `visible`, `hidden`, `deleted`                                                    |
| `creator_subscription_status` | `trialing`, `active`, `past_due`, `canceled`, `expired`                           |
| `message_type`                | `text`, `system`, `image`, `video`, `paid`, `tip` (only `text`/`system` writable) |

## Triggers

| Trigger                                       | Table                        | Fires                            | Function                                                                   |
| --------------------------------------------- | ---------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `on_auth_user_created`                        | `auth.users`                 | AFTER INSERT                     | `handle_new_user()` — provisions identity + branches creator/member        |
| `touch_profiles_updated_at`                   | `profiles`                   | BEFORE UPDATE                    | `touch_updated_at()`                                                       |
| `touch_creator_profiles_updated_at`           | `creator_profiles`           | BEFORE UPDATE                    | `touch_updated_at()`                                                       |
| `touch_subscriptions_updated_at`              | `subscriptions`              | BEFORE UPDATE                    | `touch_updated_at()`                                                       |
| `touch_member_profiles_updated_at`            | `member_profiles`            | BEFORE UPDATE                    | `touch_updated_at()`                                                       |
| `validate_creator_handle_trigger`             | `creator_profiles`           | BEFORE INSERT/UPDATE OF handle   | `validate_creator_handle()` — blocks empty/reserved handles                |
| `validate_member_username_trigger`            | `member_profiles`            | BEFORE INSERT/UPDATE OF username | `validate_member_username()` — lowercases, pattern + reserved check        |
| `touch_posts_updated_at`                      | `posts`                      | BEFORE UPDATE                    | `touch_updated_at()`                                                       |
| `touch_post_comments_updated_at`              | `post_comments`              | BEFORE UPDATE                    | `touch_updated_at()`                                                       |
| `touch_creator_subscription_tiers_updated_at` | `creator_subscription_tiers` | BEFORE UPDATE                    | `touch_updated_at()`                                                       |
| `touch_creator_subscriptions_updated_at`      | `creator_subscriptions`      | BEFORE UPDATE                    | `touch_updated_at()`                                                       |
| `touch_conversations_updated_at`              | `conversations`              | BEFORE UPDATE                    | `touch_updated_at()`                                                       |
| `bump_conversation_after_message`             | `messages`                   | AFTER INSERT                     | `bump_conversation_on_message()` — touches conversation for inbox ordering |

## Functions / RPCs

**Internal `SECURITY DEFINER` helpers** (execute revoked from public/anon/authenticated; invoked by RLS/triggers only):

- `handle_new_user()` — signup provisioning + creator/member branch.
- `has_role(uuid, app_role)` — role check used by RLS.
- `validate_creator_handle()` / `validate_member_username()` — handle/username guards.
- `touch_updated_at()` — generic `updated_at` stamp.
- `is_current_user_creator(uuid)` — boolean creator-ownership check usable by `anon`/`authenticated` and
  policies (reveals no identifiers; `anon` grant added in Phase 3 for OR-evaluated posts policies).
- `is_following_creator(uuid)` — boolean follow check for the current user (Phase 3); usable by
  `anon`/`authenticated` and policies, returns false for a null `auth.uid()`.
- `can_view_post(uuid)` — authoritative post-access check (Phase 3); owner sees any status, others see
  published public or followed-followers; subscribers/purchase denied to non-creators. Granted to
  `anon`/`authenticated`; backs the signed-URL action.

**Callable relationship RPCs** (`SECURITY DEFINER`, granted to `authenticated` only; actor derived from `auth.uid()`):

- `relationship_state(text username)` → `(username, following, blocked_by_me, follower_count, following_count, is_self)`.
- `relationship_follow_creator(text username)` → void (idempotent; rejects self-follow / blocked target).
- `relationship_unfollow_creator(text username)` → void.

**Callable feed RPCs** (`SECURITY DEFINER`, ID-free, actor derived from `auth.uid()`):

- `feed_creator_posts(text username, timestamptz cursor, int limit)` → safe post rows for a creator page;
  granted to `anon` + `authenticated`. Returns followers-only posts to non-followers as **locked stubs**
  (caption/media blanked, `locked = true`); never returns subscribers/purchase posts to non-creators.
- `feed_home_posts(timestamptz cursor, int limit)` → published posts from creators the **authenticated**
  viewer follows; granted to `authenticated` only.

**Engagement helpers + RPCs (Phase 3.2, `SECURITY DEFINER`):**

- `is_current_user_post_owner(uuid)` — boolean post-ownership check; `anon`/`authenticated`.
- `is_engagement_blocked(uuid)` — true if a block exists in either direction between the caller and the
  post's creator; used to deny comment/like/save. `authenticated` only.
- `post_engagement_state(uuid)` → `(like_count, comment_count, liked_by_me, saved_by_me, can_engage)`;
  `anon` + `authenticated`, gated by `can_view_post`.
- `post_comments_list(uuid, timestamptz cursor, int limit)` → visible comments with safe author identity
  (no UUIDs beyond the comment id); `anon` + `authenticated`.
- `post_card(uuid)` → a single locked-aware post row for the detail page; `anon` + `authenticated`.

**Subscription helper + RPCs (Phase 4, `SECURITY DEFINER`, DEMO-ONLY):**

- `is_active_subscriber(uuid)` — true if the caller holds a live (trialing/active, unexpired) subscription
  to the creator; `anon` + `authenticated`. Added to `can_view_post` / `feed_creator_posts` / `post_card`.
- `subscribe_to_creator(text username, uuid tier_id)` → void (demo: copies the tier price, stamps a
  `mock_*` reference, **no charge**; idempotent re-activation); `authenticated` only.
- `cancel_creator_subscription(text username)` → void; `authenticated` only.
- `creator_subscription_state(text username)` → `(username, subscribed, status, tier_name, price_cents,
currency, current_period_end, is_self)`; `anon` + `authenticated`.
- `creator_subscribers_list(timestamptz cursor, int limit)` → the calling creator's active subscribers with
  safe member identity; `authenticated` only.

**Messaging helpers + RPCs (Phase 5, `SECURITY DEFINER`, `authenticated` only):**

- `is_conversation_participant(uuid)` / `is_conversation_blocked(uuid)` / `is_message_in_my_conversation(uuid)`
  — participant + block checks used by RLS (break the `conversation_participants` policy recursion).
- `create_direct_conversation(uuid other_user_id)` / `start_conversation_with_username(text)` → uuid —
  find-or-create a 1:1 conversation; reject self and any block (either direction).
- `list_conversations()` → inbox rows (other-party safe identity, last-message preview, unread count).
- `conversation_header(uuid)` / `conversation_messages(uuid, timestamptz cursor, int limit)` — participant-
  gated; deleted messages blanked.
- `mark_conversation_read(uuid)` → void; `unread_message_count()` → bigint.

## Storage buckets (4)

| Bucket       | Public              | Object policy                                                                                                                                       |
| ------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `avatars`    | true (CDN-served)   | Owner-scoped by first path segment `auth.uid()/<file>` for list/insert/update/delete                                                                |
| `banners`    | true                | same owner-scoping                                                                                                                                  |
| `products`   | true                | same owner-scoping                                                                                                                                  |
| `post-media` | **false (PRIVATE)** | Owner-scoped writes (`<user_id>/<post_id>/<file>`); no public read. Viewers get expiring signed URLs from `getPostMediaUrls` after `can_view_post`. |

> The three legacy buckets serve files over the CDN regardless of object RLS — **unsuitable for private
> media**. Phase 3's `post-media` bucket is private: media is reachable only through the
> authorization-gated signed-URL server action.

---

# Authentication

CABANA auth is Supabase Auth. Identity lives in `auth.users`; app data hangs off `public.profiles`
(1:1) plus role and account-type metadata. There are four effective principals.

## Guest

- No session. Sees public surfaces only: marketing/landing, pricing, public creator pages `/$username`,
  `/discover` (real discovery + search, `noindex`), and public posts on `/feed` / `/post/$postId`
  (visibility enforced server-side).
- DB access: `anon` client under RLS — public reads only (`creator_profiles`, `links`, `products`, the
  two public views, `reserved_handles`); may insert `analytics_events` for a real profile. **No** access
  to `member_profiles`, `follows`, or `blocks` (grants revoked from `anon`).

## Member

- `profiles.account_type = 'member'`. Has a private `member_profiles` row with a public `username`.
- Lands on **`/account`** (member home, `noindex`). Bounced off `/dashboard`.
- Can manage their own member profile, follow creators, and block accounts — all through the protected
  server-action tier under their own RLS.
- Does **not** get a `creator_profiles` row or a platform `subscriptions` row.

## Creator

- `profiles.account_type = 'creator'` (the default). Has a `creator_profiles` row (public page), a free
  platform `subscriptions` row, and the `user` role.
- Lands on **`/dashboard`** (creator Studio: overview, profile/links/storefront/analytics/media-kit/AI/settings).
  Bounced off `/account`.
- Manages own profile/links/products/analytics via T1 direct-RLS hooks; can read own follower list.

## Admin

- Any account additionally holding the `admin` role in `user_roles`.
- Gates `/admin` via `useHasRole("admin")`. Can read all roles and manage roles (RLS via `has_role`).
- `moderator` is wired into staff moderation (Phase 8): `is_current_user_staff()` (admin OR moderator)
  gates the report queue and audit trail behind `StaffGate` at `/admin/reports` + `/admin/audit`.

## Signup flow

Sign-in supports email/password and **Google OAuth** (`cabanaAuth.loginWithGoogle` → `/auth/callback`);
the sign-in card serves at both `/` and `/login`. New creators land in the profile-first **4-step
onboarding** at `/onboarding` (Identity · Links · Look · Preview) — the old seven-step wizard is gone.

1. Client calls `cabanaAuth` signup (`src/lib/cabana-auth.ts`), optionally passing
   `raw_user_meta_data.account_type = 'member'` (and a display `name`).
2. Supabase inserts into `auth.users`, firing `on_auth_user_created` → `handle_new_user()` (SECURITY DEFINER).
3. The trigger always inserts a `profiles` row (with resolved `account_type`) and a default `user` role, then branches.
4. Session hooks (`useAuthSession`, `useCabanaUser`) track state via `supabase.auth.onAuthStateChange`.
5. The route guard reads `useAccountType()` and redirects to `/dashboard` (creator) or `/account` (member);
   `accountHomePath()` in `cabana-account.ts` encodes that mapping.

## Account branching

`handle_new_user()` resolves the account type from metadata — **only the exact string `"member"`** opts
into a member account; anything else (including absent metadata) defaults to `creator`, preserving all
prior behavior. The TypeScript mirror is `resolveAccountType()` in `cabana-account.ts`, so client and DB
never disagree.

- **Creator branch:** generate a collision-safe handle (reserved-handle aware) → insert `creator_profiles`
  → insert a free/active `subscriptions` row.
- **Member branch:** generate a collision-safe `member_*` username → insert `member_profiles`.
- Both branches: insert `profiles` + the default `user` role.

## Protected server actions

The T2 tier (`account-actions.ts`, `relationship-actions.ts`) is the only place authenticated mutations
run server-side. Each `createServerFn` composes `[attachSupabaseToken, requireSupabaseAuth]`, so the
handler receives `{ supabase, userId }` scoped to the caller's RLS — **never** the service role.
Handlers stay thin and delegate validation/shaping to the pure modules (`cabana-account.ts`,
`cabana-relationships.ts`). These files must **not** live under any `**/server/**` path: `createServerFn`
compiles to a client-importable RPC bridge, and the `start.ts` import-protection plugin blocks
`**/server/**` from client bundles.

## `attachSupabaseToken`

Client-side TanStack **function middleware** (`auth-client-middleware.ts`). Before a server-function RPC
leaves the browser, it reads the current Supabase session and attaches
`Authorization: Bearer <access_token>` (or nothing if signed out). A generated global companion,
`attachSupabaseAuth` (`auth-attacher.ts`), is registered as a global `functionMiddleware` in `start.ts`
so the header is attached app-wide; the per-action middleware makes the dependency explicit.

## `requireSupabaseAuth`

Server-side TanStack middleware (`auth-middleware.ts`, auto-generated). Validates the incoming
`Authorization: Bearer` token, rejects unauthenticated calls, and yields a **per-request, RLS-scoped**
Supabase client plus the authenticated `userId` into `context`. This is what guarantees every protected
action executes under the caller's row-level permissions.

---

# Social Graph

## follows

- `public.follows(follower_id → profiles, following_creator_id → creator_profiles, created_at)`,
  unique `(follower_id, following_creator_id)`, with a reverse index on `following_creator_id` for counts.
- Written exclusively through the `relationship_follow_creator` / `relationship_unfollow_creator` RPCs
  (idempotent upsert / delete), which refuse self-follow and follow-while-blocked.

## blocks

- `public.blocks(blocker_id → profiles, blocked_user_id → profiles, reason, created_at)`,
  unique `(blocker_id, blocked_user_id)`, `check (blocker_id <> blocked_user_id)`, reason ≤ 280 chars.
- **Private to the blocker** — the blocked account cannot infer who blocked them.
- Written directly through the RLS-scoped client in `relationship-actions.ts` (block upsert with
  `ignoreDuplicates`, unblock delete).

## Relationship helpers

- **Pure domain** (`cabana-relationships.ts`): input normalizers (`normalizeRelationshipUsername`,
  `normalizeRelationshipUserId`, `normalizeBlockReason`) and behavior functions
  (`followCreatorForUser`, `unfollowCreatorForUser`, `blockUserForUser`, `unblockUserForUser`,
  `getRelationshipStateForUser`, follower/following count getters). All accept a `RelationshipRepository`,
  so behavior is unit-tested without a DB.
- **Server actions** (`relationship-actions.ts`): build a `RelationshipRepository` over the caller's RLS
  client (RPC calls + direct table/view reads), validate input, and delegate to the pure functions.
- **Hooks** (`use-relationships.ts`): `useRelationship(username)` reads `relationship_state`;
  `useFollow(username)` exposes `following`, `blockedByMe`, `followerCount`, `pending`, and a `toggle()`
  that optimistically caches the returned state.

## RLS model

- **`follows`:** a user may `select`/`insert`/`delete` only rows where they are the follower
  (`auth.uid() = follower_id`); a creator may additionally `select` rows targeting their own creator
  profile (`is_current_user_creator(following_creator_id)`) to see their follower list. Insert also
  requires the target not be the caller's own creator profile.
- **`blocks`:** only the blocker may `select`/`insert`/`delete` their rows.
- **Grants:** `authenticated` gets DML on both tables; `anon` is fully revoked.
- **Identity safety:** RLS never queries `creator_profiles` directly (that would expose `user_id`);
  it uses the boolean `is_current_user_creator` helper. All cross-account discovery goes through the two
  ID-free public views or the `relationship_state` RPC, never raw tables.

---

# Testing

## Vitest

- Config: `vitest.config.ts` (standalone — **not** the Lovable `vite.config.ts`; the modules under test
  are pure, needing only the `@` alias and `node` environment).
- Coverage is restricted to the **sixteen** pure business modules — `cabana-money`, `cabana-entitlements`,
  `cabana-account`, `cabana-relationships`, `cabana-posts`, `cabana-engagement`, `cabana-subscriptions`,
  `cabana-messaging`, `cabana-notifications`, `cabana-moderation`, `cabana-finance`, `cabana-payouts`,
  `cabana-notification-engine`, `cabana-discovery`, `cabana-dashboard`, `cabana-creator-analytics` —
  with **95%** thresholds on lines/functions/branches/statements (**337 tests across 16 files**,
  99.53% stmts / 95.8% branch as of July 9, 2026).
- Run: `bun run test` (one-shot), `bun run test:watch`, `bun run test:coverage`; a single file with
  `bunx vitest run src/lib/<file>.test.ts`, or by name with `bunx vitest run -t "<name>"`.
- **Rule of thumb:** keep new domain logic in a pure, repository-injected module so it stays unit-testable
  without a browser or DB.

## db:validate

- `bun run db:validate` (`scripts/db-validate.sh`) rebuilds a **fresh** Supabase from zero
  (`supabase db reset` = baseline migration + seed) and runs the SQL smoke checks.
- Requires Docker (the local Supabase stack runs in containers). On hosts without Docker it exits
  non-zero with an actionable message — it never reports a pass it did not perform.

## Smoke tests

- `supabase/tests/smoke.sql` — asserts the full object inventory exists after a from-zero rebuild
  (tables, enums, columns, safe views, functions, triggers, RLS, buckets, the `aurora` seed, reserved
  handles), extended at every phase. Runs under `psql -v ON_ERROR_STOP=1` so any failed assertion
  exits non-zero.

## Behavioral SQL tests

One suite per phase in `supabase/tests/` (**17 files** as of July 9, 2026): `smoke`, `member_accounts`,
`social_relationships`, `posts_feed`, `engagement`, `creator_subscriptions`, `messaging`,
`monetization_ledger`, `notifications` (now also asserting admin recipient-scoping / no leak),
`admin_moderation`, `admin_payouts`, `notification_engine`, `creator_analytics`, `user_roles_policy`,
`profile_customization`, `post_media_service_grant`, and `high_qa_fixes` (the last two committed but
not yet applied to cloud, alongside their migrations).

## CI pipeline

`.github/workflows/ci.yml` runs on push to `main` and on every PR (concurrency-cancel per ref):

- **`verify`** (Ubuntu + Bun): `bun install --frozen-lockfile` → `lint` → `tsc --noEmit` → `test` → `build`.
- **`db-validate`** (Ubuntu + Supabase CLI + Docker/psql): `supabase start` → `supabase db reset`
  (from zero, all 19 migrations + seed) → the full `supabase/tests/` suite → `supabase stop`.

The **handoff gate** for any session is: `bun run lint`, `bun run build`, `bunx tsc --noEmit`, and
`bun run test` all pass (plus the SQL suites on a Docker-enabled host/CI).

---

# Current Technical Debt

- ~~Remote schema reconciliation deferred~~ — **RESOLVED July 7, 2026.** The canonical backend is now the
  cloud project `rpzaeqoqcaxxavltgvpe` ("cabanadatabase"), reconciled to the CABANA migration chain.
  Validate new migrations on the local Docker stack first, per the standing convention.
- **UI/UX audit Batches 3–6 open.** Findings from the July 8, 2026 audit remaining after Batches 1–2:
  Accessibility (reduced motion, aria, focus, touch targets), Creator Workflow (post edit, delete confirms,
  upload progress), Design System (raw-button migration), Marketing & Polish (per-route titles, terms/privacy,
  image weight). Batch 1 (Trust & Honesty) and Batch 2 (Core UX) are done and committed.
- **`creator_profiles` public SELECT exposes `user_id`.** The Phase 2C safe views fix this for new
  discovery surfaces, but the legacy public read path (links/products/analytics bundle in
  `cabana-store.ts`) still depends on the direct creator-profile read. Migrate that bundle to the view
  before removing the old public table path.
- **Route protection is client-side only.** `/dashboard` and `/account` guard via redirects; there is no
  server route guard. Server _actions_ are independently protected, so data is safe, but
  unauthenticated/role-wrong users can briefly render a guarded route shell.
- **Public storage buckets are CDN-public.** `avatars`/`banners`/`products` are unsuitable for
  private/premium media; private buckets + signed URLs are required before locked posts/messages.
- **`subscriptions` naming collision.** The existing `subscriptions` table is **platform SaaS billing**,
  not fan subscriptions. It should be renamed `platform_subscriptions` (gated) before
  `creator_subscriptions` becomes production data.
- **No server tests for the T1 hooks / React components.** Only the sixteen pure modules are unit-tested;
  hooks, actions, and UI are covered only indirectly (and by the SQL suites at the DB layer).
- **Labeled demo surfaces remain.** Media Kit, Settings integrations, and the legacy `/admin` hub tabs are
  still sample-data surfaces — now honestly labeled as such (Batch 1) rather than fake-presented-as-real.
  (`/feed`, `/discover`, `/messages`, `/notifications` are no longer placeholders — all real, with
  server-enforced visibility; `/notifications` is auth-gated client-side.)

---

# Remaining Roadmap

> Phase numbering below follows the handoff's "next task" framing and maps the roadmap's dependency
> groups (A–F) onto phases. Each phase is **gated on explicit approval** and must ship with an approved
> migration, an RLS design, and behavioral SQL tests — the same bar Phases 2B/2C met. Do not start any
> of these automatically.

## Phase 3 — Posts & Feed Foundation ✅ DONE

Delivered: `posts` + `post_media`, public/follower visibility, private `post-media` bucket + signed URLs,
feed RPCs with locked teases, composer + feed UI. See the completed-phases section above.

## Phase 3.2 — Engagement ✅ DONE

Delivered: `post_comments` / `post_likes` / `post_saves` with block-aware RLS, soft-deletable comments,
`post_engagement_state` / `post_comments_list` / `post_card` RPCs, `/post/$postId` detail, and like/
comment/save on `PostCard`. See the completed-phases section above. Remaining follow-up: wire engagement
counts into the feed safe-views/`post_count` placeholders (still `0`).

## Phase 4 — Creator subscriptions & entitlements ✅ DONE (demo)

Delivered: `creator_subscription_tiers` + `creator_subscriptions`, `is_active_subscriber`, mock
subscribe/cancel RPCs, and `subscribers` post unlocking across `can_view_post`/feed/detail. Demo-only.
See the completed-phases section above. **Deferred:** the `subscriptions`→`platform_subscriptions` rename.
(`content_entitlements` and the `purchase` per-post unlock were since delivered by the Phase 6 ledger.)

## Phase 5 — Messaging ✅ DONE (foundation)

Delivered: `conversations` / `conversation_participants` / `messages` / `message_read_receipts` with
participant-scoped RLS, the messaging RPCs, and Supabase Realtime. See the completed-phases section above.
**Since delivered:** `notifications` + outbox (Phases 7/9A/9B, internal only) and message reporting
(Phase 8B). **Still deferred:** private attachments (image/video) + signed URLs, paid messages/tips,
and rate-limiting.

## Phase 6 — Monetization ledger ✅ DONE (foundation, demo-only)

Delivered: migration `20260518000000_monetization_ledger.sql` — `transactions` (append-only/immutable,
`net = gross − fees` CHECK), `creator_balances` (cached projection via `recalc_creator_balance`),
`payout_requests`, `payouts`, `tips`, `purchases`, `content_entitlements`; `posts.price_cents`/`currency`
activating the `purchase` tier. SECURITY DEFINER RPCs `create_mock_purchase` / `create_mock_tip` /
`request_payout` / `creator_balance` (+ `has_content_entitlement`, `is_current_user_admin`); `purchase`
wired into `can_view_post` / feed / `post_card`. `cabana-money.ts` (payout eligibility, purchase
validation, entitlement generation), `money-actions.ts`, `use-money.ts`, and the `/dashboard/earnings`
dashboard (`components/cabana/earnings/`). Fee model 10% + 3%, integer cents, `mock_*` refs. Creators read
own financial rows; buyers read own purchases/entitlements; admins read all; anon revoked; writes via RPCs.
Behavioral suite `monetization_ledger.sql`. **No payment processor, cards, webhooks, KYC, or real payouts.**

**Since delivered:** `reports` / `audit_logs` + URL-backed admin moderation subroutes (Phase 8/8B),
admin finance subroutes + payout approval (Phase 8C). **Still gated:** refunds/disputes UI, paid messages.

## Phase 7 — Notifications & activity ✅ DONE (foundation, internal only)

Delivered: migration `20260519000000_notifications_activity.sql` — `notifications` (system-written;
`dedupe_key` unique → idempotent), `activity_events` (append-only canonical log), `notification_preferences`
(in-app on; email/push placeholders), `notification_outbox` (inert future delivery queue, admin-only). Event
generation at the DB layer: SECURITY DEFINER `emit_notification` invoked by AFTER INSERT triggers on
`follows` / `post_likes` / `post_comments` / `post_saves` / `creator_subscriptions` / `tips` / `purchases` /
`messages` / `payout_requests` (atomic, idempotent, no edits to existing actions). `notifications` published
to Supabase Realtime (RLS-filtered to recipient). `cabana-notifications.ts` (pure), `notification-actions.ts`,
`use-notifications.ts`, and the notifications UI (`/dashboard/notifications` + auth-gated `/notifications`,
live sidebar badge). Users read/manage only their own rows; outbox admin-only; anon revoked. Behavioral
suite `notifications.sql`. **No email/push provider — internal foundation only.**

**Since delivered:** the outbox processor (Phase 9A, simulated transport), the notification center UI
(Phase 9B), `reports` / `audit_logs` + admin moderation/finance subroutes (Phases 8–8C). **Still gated:**
a real email/push provider (Phase 9C), digests/batching, deep-link routing.

## Phases 8 → 11B ✅ DONE (delivered after this checkpoint's detailed sections)

All under the standard migration + RLS + behavioral-test gate; full detail in [`CLAUDE.md`](../CLAUDE.md):

- **Phase 8 / 8B — Admin moderation & audit + member reporting.** `reports` + append-only `audit_logs`
  (migration `20260520000000`), `is_current_user_staff()`, `StaffGate` at `/admin/reports` + `/admin/audit`;
  member-facing `ReportButton`/`ReportDialog` (`components/cabana/reporting/`) on posts, comments, creator
  profiles, and DMs (+ `20260521000000_report_reasons.sql`). Pure logic in `cabana-moderation.ts`.
- **Phase 8C — Admin finance & payout workflow (admin-only).** Read-only finance over the Phase 6 ledger
  (`cabana-finance.ts`, `AdminGate`, `/admin/finance`, `/admin/ledger`, `/admin/ledger/$transactionId` with
  CSV export) plus the payout state machine (`cabana-payouts.ts`, `admin_review_payout` RPC, `/admin/payouts`,
  migration `20260522000000`). `approve` authorizes; `mark_paid` settles — intentionally distinct.
- **Phase 9A — Notification engine (backend only).** `process_notification_outbox` RPC (migration
  `20260523000000`) activates the Phase 7 outbox with simulated delivery (retry/backoff/dead-letter);
  pure logic in `cabana-notification-engine.ts`. No email/push providers (that is Phase 9C, still gated).
- **Phase 9B — Notification center UI.** No schema change; `components/cabana/notifications/` over the
  existing realtime hooks at `/dashboard/notifications` + auth-gated `/notifications`.
- **Phase 10 — Discovery & search.** `/discover` is a real public (`noindex`) discovery + global-search
  surface: pure `cabana-discovery.ts`, guest-callable `optionalSupabaseAuth` actions, `DiscoveryPage`.
- **Phase 11A — Creator dashboard home.** Pure aggregation (`cabana-dashboard.ts`) now at the `/dashboard`
  index (`components/cabana/dashboard/overview/`); `/dashboard/home` redirects there and the legacy link-in-bio
  `DashHome` moved to `/dashboard/link-in-bio`; subscriber roster at `/dashboard/subscribers`. No new SQL.
- **Phase 11B — Creator analytics.** `creator_content_analytics` RPC (migration `20260524000000`),
  pure `cabana-creator-analytics.ts`, UI at `/dashboard/performance` (the legacy link-in-bio
  `/dashboard/analytics` stays distinct).
- **Corrective/additive migrations:** `20260525000000_baseline_grants`, `20260526000000_user_roles_admin_policy`,
  `20260527000000_profiles_select_grant`, `20260528000000_profile_customization`,
  `20260529000000_post_media_service_grant`, and `20260530000000_high_qa_fixes` (H5 real
  `public_creator_profiles.post_count`, H8/H9 purchase/payout advisory locks) — the last two committed but
  **not yet applied to cloud**.
- **Unphased July 2026 work:** Google OAuth sign-in + `/auth/callback`, profile-first 4-step onboarding,
  unified liquid-metal button system, Vercel deployment (prod `cabanagrp.com`), backend reconciled to the
  cloud `cabanadatabase` project, the July 8 UI/UX audit + Batch 1 (Trust) & Batch 2 (Core UX) passes, and the
  July 9 cleanup (retired marketing landing/orphaned assets/dead `cabana-demo-data` module) — see the top of this file.

## Production launch (gated, post-demo)

- Replace mock monetization with a real payment provider (Stripe), KYC, real payouts, and
  refund/dispute/chargeback handling — explicitly out of scope until product rules are stable.
- ~~Complete the deferred remote schema reconciliation~~ — done July 7, 2026 (cloud `cabanadatabase`).
- Move private media fully onto private buckets + signed URLs; add a server route guard; rate limiting,
  spam controls, audit logging, and an email/push outbox in production.
- Only after all of the above: enable real money movement and remove demo labels.

---

_End of checkpoint. Keep this file in sync at each phase boundary, or delete it in favor of the living
docs if it drifts._
