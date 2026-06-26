# CABANA — Project State (Engineering Checkpoint)

> Canonical high-level engineering snapshot.
> Branch at capture: `feat/phase-3-2-engagement` (through Phase 3.2).
> Demo clock / "today" in code: **June 25, 2026**.
> Audience: a brand-new engineer who needs to understand CABANA end-to-end in under 15 minutes.
>
> This document is a **point-in-time checkpoint**, not a substitute for the living source-of-truth docs:
> [`CABANA_ARCHITECTURE.md`](../CABANA_ARCHITECTURE.md),
> [`docs/CABANA_BUILD_ROADMAP.md`](./CABANA_BUILD_ROADMAP.md),
> [`docs/CLAUDE_SESSION_HANDOFF.md`](./CLAUDE_SESSION_HANDOFF.md),
> and [`CLAUDE.md`](../CLAUDE.md). When those disagree with this file, they win and this file is stale.

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

- **SSR web app on TanStack Start** (React 19 + Vite 7), deployed to **Cloudflare Workers**.
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
| Deploy target             | Cloudflare Workers (`@cloudflare/vite-plugin`)                   | 1.25                 |
| Language                  | TypeScript                                                       | 5.8                  |
| Tests                     | Vitest (v8 coverage)                                             | 4.1                  |
| Package manager / runtime | **Bun**                                                          | —                    |

Vite config uses `@lovable.dev/vite-tanstack-config`, which **already bundles** tanstackStart, viteReact,
tailwindcss, tsConfigPaths, the Cloudflare plugin, the `@` alias, and `VITE_*` env injection — do not
re-add those plugins.

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
│   │   ├── cabana-demo-data.ts       # deterministic mock generators (clock = 2026-06-25)
│   │   └── *.test.ts                 # Vitest suites for the 4 pure modules
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

> Phase progression to date: **1A → 1C → 2A → 2B → 2C**. (There is no separately-tracked "1B" in the
> current docs; phase 1 work was captured as the 1A demo-foundation and 1C hardening passes.) Every
> phase below is green on `lint` / `tsc` / `test` / `build`. Phases 2A–2C additionally pass the SQL
> suites on a real Docker-backed Postgres and on CI.

## Phase 1A — Demo foundation & pure helpers

- **Objectives:** Establish the subscription-platform's shared domain contracts, deterministic mock
  data, and route-complete (but non-functional) UI foundations — without any new tables or money.
- **Completed work:**
  - `src/lib/cabana-types.ts` — domain types for the future platform (MemberProfile, CreatorPost,
    CreatorSubscription, Tip, Transaction, Payout, etc.), designed to map to future Supabase tables.
  - `src/lib/cabana-demo-data.ts` — deterministic mock generators; fixed demo clock **June 25, 2026**;
    mock provider refs prefixed `mock_`.
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

---

# Current Database

Schema is rebuilt from zero by five ordered migrations:
`20260511000000_baseline.sql` → `20260512000000_member_accounts.sql` →
`20260513000000_social_relationships.sql` → `20260514000000_posts_feed.sql` →
`20260515000000_engagement.sql`.

## Tables (16)

| Table              | Purpose                                                                                     | Read access                                                                                             | Write access                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `profiles`         | Shared identity, 1:1 with `auth.users`; holds `account_type`.                               | Owner only                                                                                              | Owner update (insert via trigger)                                               |
| `creator_profiles` | Public creator presence; drives `/$username`. `user_id` nullable (ownerless `aurora` seed). | **Public** (note: exposes `user_id`)                                                                    | Owner insert/update                                                             |
| `links`            | Smart-link blocks on the public page.                                                       | Public                                                                                                  | Owner (via parent profile)                                                      |
| `products`         | Storefront products.                                                                        | Public                                                                                                  | Owner (via parent profile)                                                      |
| `analytics_events` | First-party page/link/product events.                                                       | Owner (creator) read                                                                                    | Anyone may insert for a real profile                                            |
| `subscriptions`    | **CABANA SaaS plan** per account (NOT fan-to-creator).                                      | Owner read                                                                                              | Trigger/service-side only                                                       |
| `user_roles`       | Authorization roles.                                                                        | Owner read; admins read all                                                                             | Admins manage                                                                   |
| `reserved_handles` | Handles that cannot be claimed.                                                             | Public read                                                                                             | — (seed/admin)                                                                  |
| `member_profiles`  | Private member identity + public `username`.                                                | Owner only                                                                                              | Owner insert/update (no delete)                                                 |
| `follows`          | account → creator follow edges.                                                             | Follower reads own; creator reads own followers                                                         | Follower insert/delete                                                          |
| `blocks`           | account → account blocks (private to blocker).                                              | Blocker only                                                                                            | Blocker insert/delete                                                           |
| `posts`            | Creator posts (`public`/`followers`/subscribers/purchase visibility, draft→published).      | Public reads published-public; followers read published-followers they follow; owner reads all          | Owner (creator) CRUD                                                            |
| `post_media`       | Image metadata for a post; objects live in the private `post-media` bucket.                 | **Owner only** (viewers get signed URLs via `getPostMediaUrls`)                                         | Owner CRUD                                                                      |
| `post_comments`    | Comments on posts (`visible`/`hidden`/`deleted`; soft-delete).                              | Visible comments on viewable posts (anon → public only); authors read own; owners read all on own posts | Author edit/soft-delete own; owner hide; insert requires viewability + no block |
| `post_likes`       | Likes (unique per user/post; private to actor).                                             | Owner only (counts via RPC)                                                                             | Insert/delete own; requires viewability + no block                              |
| `post_saves`       | Saves (unique per user/post; private to actor).                                             | Owner only                                                                                              | Insert/delete own; requires viewability + no block                              |

## Public views (2)

| View                      | Exposes                                                                                                                                            | Notes                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public_creator_profiles` | username, display_name, avatar_url, banner_url, bio, verified (placeholder `false`), follower_count, following_count, post_count (placeholder `0`) | `security_barrier`, `security_invoker = false` (runs with owner privileges to aggregate private `follows`); granted to `anon` + `authenticated`. No UUIDs/email/plan/theme. |
| `public_member_profiles`  | username, display_name, avatar_url, banner_url (null), bio, verified (`false`), follower_count (`0`), following_count, post_count (`0`)            | Same safety model; the only public projection of otherwise-private member profiles.                                                                                         |

## Enums (6)

| Enum              | Values                                           |
| ----------------- | ------------------------------------------------ |
| `app_role`        | `admin`, `moderator`, `user`                     |
| `account_type`    | `creator`, `member`                              |
| `post_visibility` | `public`, `followers`, `subscribers`, `purchase` |
| `post_status`     | `draft`, `scheduled`, `published`, `archived`    |
| `post_media_kind` | `image`, `video`, `audio`                        |
| `comment_status`  | `visible`, `hidden`, `deleted`                   |

## Triggers

| Trigger                             | Table              | Fires                            | Function                                                            |
| ----------------------------------- | ------------------ | -------------------------------- | ------------------------------------------------------------------- |
| `on_auth_user_created`              | `auth.users`       | AFTER INSERT                     | `handle_new_user()` — provisions identity + branches creator/member |
| `touch_profiles_updated_at`         | `profiles`         | BEFORE UPDATE                    | `touch_updated_at()`                                                |
| `touch_creator_profiles_updated_at` | `creator_profiles` | BEFORE UPDATE                    | `touch_updated_at()`                                                |
| `touch_subscriptions_updated_at`    | `subscriptions`    | BEFORE UPDATE                    | `touch_updated_at()`                                                |
| `touch_member_profiles_updated_at`  | `member_profiles`  | BEFORE UPDATE                    | `touch_updated_at()`                                                |
| `validate_creator_handle_trigger`   | `creator_profiles` | BEFORE INSERT/UPDATE OF handle   | `validate_creator_handle()` — blocks empty/reserved handles         |
| `validate_member_username_trigger`  | `member_profiles`  | BEFORE INSERT/UPDATE OF username | `validate_member_username()` — lowercases, pattern + reserved check |
| `touch_posts_updated_at`            | `posts`            | BEFORE UPDATE                    | `touch_updated_at()`                                                |
| `touch_post_comments_updated_at`    | `post_comments`    | BEFORE UPDATE                    | `touch_updated_at()`                                                |

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
  and the public placeholder routes.
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
- `moderator` exists in the enum for future moderation but is not yet wired to surfaces.

## Signup flow

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
- Coverage is restricted to the five pure business modules — `cabana-money`, `cabana-entitlements`,
  `cabana-account`, `cabana-relationships`, `cabana-posts` — with **95%** thresholds on
  lines/functions/branches/statements (currently 100% statements/functions/lines, 99.5% branches;
  **116 tests**: money 34, entitlements 25, account 14, relationships 10, posts 33).
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

- `supabase/tests/smoke.sql` — asserts the full object inventory exists after a from-zero rebuild:
  all 11 tables, both enums, the `account_type`/`username` columns, the two safe public views, functions,
  signup trigger, RLS, the 3 buckets, the `aurora` seed, and reserved handles. Runs under
  `psql -v ON_ERROR_STOP=1` so any failed assertion exits non-zero.

## Behavioral SQL tests

- `supabase/tests/member_accounts.sql` — account-type trigger branching (creator vs member provisioning)
  and member-profile RLS isolation.
- `supabase/tests/social_relationships.sql` — follow/block uniqueness, RLS isolation, creator follower
  visibility, anonymous denial, safe-view columns/counts, and the protected RPC behavior (self-follow /
  blocked-follow refusals).

## CI pipeline

`.github/workflows/ci.yml` runs on push to `main` and on every PR (concurrency-cancel per ref):

- **`verify`** (Ubuntu + Bun): `bun install --frozen-lockfile` → `lint` → `tsc --noEmit` → `test` → `build`.
- **`db-validate`** (Ubuntu + Supabase CLI + Docker/psql): `supabase start` → `supabase db reset`
  (from zero) → `smoke.sql` → `member_accounts.sql` → `social_relationships.sql` → `supabase stop`.

The **handoff gate** for any session is: `bun run lint`, `bun run build`, `bunx tsc --noEmit`, and
`bun run test` all pass (plus the SQL suites on a Docker-enabled host/CI).

---

# Current Technical Debt

- **Remote schema reconciliation deferred.** The baseline is verified rebuildable-from-zero on Docker/CI
  but has **not** been diffed against the live project (`dwnricswfskypqqfknnh`). `supabase db dump` +
  diff and `supabase migration repair --status applied 20260511000000` still need to run (requires a
  Supabase token / DB password). Until then, do not assume the baseline is byte-exact with production.
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
- **`moderator` role unused.** Present in `app_role` but not yet wired to any surface.
- **No server tests for the T1 hooks / React components.** Only the five pure modules are unit-tested;
  hooks, actions, and UI are covered only indirectly (and by the SQL suites at the DB layer).
- **Placeholder public routes carry no real data.** `/feed`, `/discover`, `/messages`, `/notifications`
  are FoundationPage placeholders and must not receive private member/message data while public.

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

## Phase 4 — Creator subscriptions & entitlements (gated)

- Tables: `creator_subscriptions` (and future `content_entitlements`) — roadmap Group C.
- Rename `subscriptions` → `platform_subscriptions` first (gated) so `creator_subscriptions` can become
  the fan-to-creator record.
- Wire the pure `cabana-entitlements` rules to real subscription state; gate locked posts/media by
  entitlement. Still **demo monetization only** — no real charges.

## Phase 5 — Messaging & notifications (gated)

- Tables: `conversations`, `conversation_participants`, `messages`, `notifications` (roadmap Group D).
- Participant-membership RLS, cursor pagination on `(created_at, id)`, Supabase Realtime for inserts/read
  state, private storage + signed URLs for attachments, plus rate limits / blocking / reporting.
- Notifications generated by trusted event handlers with an outbox for future email/push.

## Phase 6 — Monetization ledger & trust/operations (gated)

- Tables: `transactions`, `tips`, `creator_balances`, `payouts` (Group E) and `reports`, `audit_logs`
  (Group F).
- Mock transactions behave like **immutable** financial records (integer minor units, `mock_` provider
  refs, succeeded amounts never edited in place); creator balance is derived, payouts never leave CABANA.
- URL-backed admin routes, read-only report/audit tables, then report triage and moderation actions.

## Production launch (gated, post-demo)

- Replace mock monetization with a real payment provider (Stripe), KYC, real payouts, and
  refund/dispute/chargeback handling — explicitly out of scope until product rules are stable.
- Complete the deferred **remote schema reconciliation** and migration-history repair.
- Move private media fully onto private buckets + signed URLs; add a server route guard; rate limiting,
  spam controls, audit logging, and an email/push outbox in production.
- Only after all of the above: enable real money movement and remove demo labels.

---

_End of checkpoint. Keep this file in sync at each phase boundary, or delete it in favor of the living
docs if it drifts._
