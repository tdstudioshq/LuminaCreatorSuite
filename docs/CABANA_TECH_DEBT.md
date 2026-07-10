# CABANA Technical Debt Register

> Current shortcuts, demo implementations, and the security/performance/refactor work needed to reach production. Each item carries severity and the phase/batch that should resolve it (see [`CABANA_BUILD_PHASES.md`](./CABANA_BUILD_PHASES.md); UI/UX batches are §11).
>
> Severity: 🔴 blocker for production · 🟠 important · 🟡 cleanup. Plan only.
>
> Last reconciled against the tree: **July 9, 2026** (working set now **committed** on `main` @ `5963a18` = QA bug-fix pass + Batch 1 trust pass + Batch 2 core-UX pass + July 9 cleanup; not yet pushed or deployed).

---

## 1. Migration Baseline (✅ resolved — follow-ups only)

**✅ Cloud reconciled July 7, 2026.** The canonical backend is now the **cloud project `rpzaeqoqcaxxavltgvpe` ("cabanadatabase")**, reconciled to the CABANA schema via `supabase/reconcile/` (pre-migration reset preserving the old scaffold `profiles` into `legacy_reel`, 16 migrations applied, admin/profile backfill, storage-policy fix; full backup under `supabase/reconcile/backups/`; detail in [`CLAUDE_SESSION_HANDOFF.md`](./CLAUDE_SESSION_HANDOFF.md)). Local from-zero rebuilds are green: `supabase db reset` rebuilds all 20 migrations + seed (verified July 9, 2026), and CI repeats the rebuild + smoke checks on a Docker runner.

Remaining (🟡):

- `supabase/config.toml` `project_id` still points at the old `dwnricswfskypqqfknnh` project (left intentionally so local db tooling is unaffected) — repoint or document before anyone runs `supabase link`/`db push` casually.
- `legacy_reel` schema (preserved pre-reconcile `profiles`) pending final Google sign-in confirmation, then `drop schema legacy_reel cascade;`.
- Migrations `20260529000000_post_media_service_grant.sql` and `20260530000000_high_qa_fixes.sql` are **committed** and applied locally but **not yet on the cloud project** (gated).

## 2. Repository / Process Debt

| Item                                         | Sev | Notes                                                                                                           | Phase   |
| -------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------- | ------- |
| ~~No Git metadata in workspace~~             | ✅  | Real repo on `main` with history, PRs, and CI provenance                                                        | done    |
| ~~No test runner~~                           | ✅  | Vitest: 337 tests across 16 pure-module files, 95% coverage gate (99.53% stmts / 95.8% branch); 17 SQL suites in `supabase/tests/` | done    |
| ~~No CI~~                                    | ✅  | `.github/workflows/ci.yml` runs lint/typecheck/test/build + a Docker `db-validate` job                          | P2A     |
| ~~Stale `/docs/data-model`~~                 | ✅  | `src/routes/docs.data-model.tsx` now carries a prominent "Historical — superseded" banner; kept as archive only | done    |
| Lovable-generated files marked "do not edit" | 🟡  | `client.ts`, `client.server.ts`, `auth-middleware.ts`, `types.ts` are generated; coordinate regeneration        | ongoing |
| Two maintained lockfiles (`bun.lock` + `pnpm-lock.yaml`) | 🟡  | **Intentional, not debt — document so nobody "consolidates" them.** `bun.lock` = local dev/CI installs; `pnpm-lock.yaml` = Vercel builds (`.npmrc` `node-linker=hoisted`). Update **both** when adding a dependency | ongoing |
| `@cloudflare/vite-plugin` + `wrangler.jsonc` kept but inert on the Vercel path | 🟡  | Deploy target is Vercel; the bundled CF plugin only reads `wrangler.jsonc` at build. Removal deferred — needs dual frozen-lockfile regen **and** a real Vercel preview-deploy test first | later   |
| `auth-client-middleware.ts` M-18 guard coupled to TanStack Start internals | 🟠  | The non-OK-`Response`→error coercion depends on Start's internal `ctx.result` shape (pinned `@tanstack/react-start ^1.167.50`) — **re-verify on any Start upgrade** | on upgrade |

## 3. Current Shortcuts (behavioral)

| Shortcut                                                                                                         | Sev | Where                                                                                                                                              | Phase   |
| ---------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Route protection is **client-side only** (data itself is RLS-gated)                                              | 🟠  | `dashboard.tsx`, `AdminGate`/`StaffGate` — no server loaders; all admin data/actions are RLS/SECURITY DEFINER-gated server-side                    | later   |
| `?redirect=` consumed directly (open-redirect risk)                                                              | 🟠  | `LoginCard.tsx` navigates to the raw param                                                                                                         | later   |
| ~~Follow state is local `useState`, resets on refresh~~                                                          | ✅  | Real follows via `useFollow` (`use-relationships.ts`) on `$username.tsx`                                                                           | P2C     |
| ~~Saved `theme` stored but not applied to public page~~                                                          | ✅  | `$username.tsx` sets `data-cabana-theme`; accent tints in `styles.css`                                                                             | done    |
| ~~Sidebar shows hardcoded "Pro" plan~~                                                                           | ✅  | `Sidebar.tsx` reads `profile.plan` (defaults "Free")                                                                                               | done    |
| ~~Onboarding resilience gaps (auth guard, URL-backed steps, "You're live" headline, `goLive` failure handling)~~ | ✅  | Fixed in Batch 2 (`?step=` URL steps, sessionStorage drafts, partial-failure recovery). Field VALIDATION (URL/email/username availability) remains | Batch 4 |
| Non-atomic link reorder (N independent updates)                                                                  | 🟡  | `useCabanaMutations.setLinks` (`Promise.all` of per-row updates)                                                                                   | later   |
| ~~Debounced autosave can drop a <500 ms-old edit on unmount (no flush)~~                                         | ✅  | Fixed in Batch 2 — `use-debounced-callback.ts` flushes on unmount; invalid-URL discards toast. "Saved" indicator still missing                     | Batch 4 |
| No delete confirmations                                                                                          | 🟡  | `LinkManager`, `StoreManager`, posts (URL validation is done via `cabana-validation.ts`)                                                           | Batch 4 |
| ~~Loosened UUID validation / admin-finance `display_name` embed bug~~                                            | ✅  | This session: **strict UUID validation restored** (+ v4 seeds); admin-finance transaction embed fixed (`display_name`→`name`)                       | done    |
| Remaining dead marketing links/CTAs (dashboard/admin dead controls fixed in Batch 1)                             | 🟡  | The orphaned marketing suite (incl. `Footer`) was **deleted July 9**; audit the bespoke microsites for any stragglers                              | Batch 6 |
| `$username` shadows unknown top-level slugs (wrong 404)                                                          | 🟡  | route precedence                                                                                                                                   | later   |

## 4. Demo Implementations (must be replaced, not extended)

Most Phase 2–11 surfaces are now real (posts, feed, messages, engagement, subscriptions, ledger/earnings, notifications, discovery, dashboard home, creator analytics) — money remains **DEMO-ONLY** (`mock_*` refs, no processor) until real payments land. Still demo:

| Surface                                               | Demo nature                                                                                                                                                                             | Replace in            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| ~~`cabana-demo-data.ts` (`CABANA_DEMO_DATA`)~~        | ✅ **Deleted in the July 9 cleanup** — the module (and its last consumer `DemoMessages`) is gone from the tree; `/dashboard/messages` redirects to real `/messages`. (`DemoShell` is unrelated and still used by earnings/admin.) | done                 |
| Legacy `/admin` hub tabs                              | Labeled demo shell ("Demo preview — sample data" pill, dead controls disabled) around 5 real tools: `/admin/reports` · `audit` · `finance` · `ledger` · `payouts`                       | P8+ (per tool)        |
| Media kit                                             | Real profile binding (name/headline/avatar) since Batch 1; metrics are **labeled** sample data; PDF export is a "coming soon" toast                                                     | Long-term             |
| Settings integrations                                 | Honest states since Batch 1 (Stripe "After payments launch", others "Coming soon", socials "Not linked"); real integrations unbuilt                                                     | Long-term / M8        |
| `/td`, `/eldondolla`, `/thetejeda`, `/danielasanchez` | Bespoke static profiles bypassing the data model                                                                                                                                        | optional (microsites) |
| Pricing                                               | 4 plans, no checkout; landing teaser shows 3 (inconsistent)                                                                                                                             | M8                    |
| Mock money                                            | Integer-cents demo transactions/balances in the real Phase 6 ledger                                                                                                                     | keep demo until M8    |

**Demo discipline:** every mock surface needs a visible "Demo"/"Sample" label and `mock_` references (Batch 1 enforced this on the previously unlabeled surfaces); succeeded mock transactions are immutable like real ones.

## 5. Data-Model Debt

| Item                                                                                   | Sev | Phase                                                                                                                                  |
| -------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `subscriptions` name = CABANA SaaS plan                                                | 🟡  | Collision defused — fan subs live in `creator_subscriptions` (P4); rename → `platform_subscriptions` remains deferred/gated            |
| `creator_profiles.user_id` **nullable** (ownerless seeds)                              | 🟠  | constrain real accounts (baseline still comments this as intentional)                                                                  |
| Product `price` stored as **display string** (no math/checkout, no currency)           | 🟠  | → `price_cents` + currency before real storefront money (M8); posts already use `price_cents`                                          |
| ~~Link `scheduled` presented as scheduling~~                                           | ✅  | Batch 1 relabeled the field "Note shown on this link (optional)" — no false promise; true scheduled publish remains unbuilt (optional) |
| No publish/visibility model on links/products                                          | 🟡  | later                                                                                                                                  |
| Public profile fields not separated from owner-only fields **on the client read path** | 🟠  | `public_creator_profiles` / `public_member_profiles` views exist (P2C); `useCreatorByHandle` still reads the base table (see §6)       |
| ~~settings / entitlements / ledger tables missing~~                                    | ✅  | `notification_preferences` (P7), `content_entitlements` + full ledger (P6) — demo-only money                                           |

## 6. Security Improvements

| Item                                                                   | Sev                   | Detail                                                                                                                                              | Phase   |
| ---------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Public creator read uses `select("*")` → **leaks `user_id`**           | 🔴                    | `useCreatorByHandle` reads `creator_profiles` directly (baseline policy is `using (true)`, noted in-migration); switch to `public_creator_profiles` | next    |
| ~~Public storage URLs unsuitable for paid/private media~~              | ✅                    | Private `post-media` bucket + entitlement-gated signed URLs (P3/P6); `avatars`/`banners`/`products` are public by design                            | P3      |
| ~~Real admin data/actions ungated~~                                    | ✅                    | RLS via `is_current_user_admin`/`is_current_user_staff` + admin-gated SECURITY DEFINER RPCs; client route guard remains (see §3)                    | P8      |
| ~~Notification/activity admin-read leak~~                              | ✅                    | This session: notification & activity reads are **recipient-scoped** in `notification-actions.ts` / `dashboard-actions.ts`, so the admin "read all" policy no longer surfaces others' rows in the personal center; `notifications.sql` asserts it | done    |
| Service-role discipline depends on import hygiene                      | 🟠                    | `start.ts` import-protection plugin blocks `**/server/**` from client bundles; keep `client.server.ts` server-only                                  | ongoing |
| Anonymous analytics inserts spammable (RLS only checks profile exists) | 🟠                    | Rate-limit + tighten insert policy on `analytics_events`                                                                                            | later   |
| Upload validation mostly client-side; extensions trusted               | 🟠                    | Server-side MIME-signature/size/dimension checks; EXIF strip                                                                                        | later   |
| No CSP observed (HSTS/referrer/nosniff present)                        | 🟠                    | Add Content-Security-Policy + headers                                                                                                               | later   |
| No MFA (admins), CAPTCHA, email-verify branch (Google OAuth is live)   | 🟠                    | Auth hardening                                                                                                                                      | later   |
| `?redirect=` not allow-listed                                          | 🟠                    | Safe-redirect allow-list (see §3)                                                                                                                   | later   |
| No webhook signature verification / idempotency yet                    | 🔴 (when money lands) | `webhook_events` + signatures                                                                                                                       | M8      |
| Provider tokens / verification fields unencrypted (none yet)           | 🟠                    | Encrypt at rest when introduced                                                                                                                     | M8+     |

## 7. Performance Improvements

| Item                                                            | Sev | Detail                                                                                                                                                                                                   | Phase   |
| --------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Index coverage on Phase 3–9 tables never audited systematically | 🟡  | Migrations index FKs/RLS filters at creation (e.g. outbox `(status, scheduled_for)`); one audit pass wanted                                                                                              | later   |
| ~~Silently capped lists~~ → load-more + cap disclosure landed   | 🟡  | Batch 2: feed 20→50 · comments 30→100 · messages 50→100 · notifications 50→200 · ledger 500→1000, each with an at-cap note. TRUE cursor `(created_at, id)` pagination beyond the RPC clamps still wanted | later   |
| ~~Feed N+1 media/engagement per-post reads~~                    | ✅  | This session (H-08): `FeedBatchScope` + `feed-batch-context.ts` batch the feed's media (signed URLs) and engagement reads into single server-side calls instead of one-per-card | done    |
| No partial indexes for unread/pending/active/undeleted          | 🟡  | unread notifications, pending payouts, open reports                                                                                                                                                      | later   |
| Build warns: shared chunks > 500 kB                             | 🟡  | Code-split heavy routes; lazy-load admin/marketing                                                                                                                                                       | later   |
| ~~No global `QueryClient` retry/stale defaults~~                | ✅  | Batch 2 — `retry: 1`, `staleTime: 30s` (`router.tsx`); hydration policy still unconsidered                                                                                                               | done    |
| Mutations lack optimistic updates / transactional rollback      | 🟡  | e.g. optimistic message send                                                                                                                                                                             | Batch 4 |
| Display fonts referenced but never loaded                       | 🟡  | Load/host the display faces or drop the references                                                                                                                                                       | Batch 5 |
| `pg_stat_statements` not enabled/monitored                      | 🟡  | Enable + monitor                                                                                                                                                                                         | later   |
| Don't hold DB locks across external API calls (future money)    | 🔴  | Keep payment txns short; external calls outside DB txn                                                                                                                                                   | M8      |

## 8. Refactoring Opportunities

| Opportunity                                                                                                    | Sev | Detail                                                                                                      | Phase     |
| -------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------- | --------- |
| ~117 raw `<button>`s not yet on the unified button system                                                      | 🟡  | Liquid-metal button system landed (commit `6c35f5b`); migrate the stragglers                                | Batch 5   |
| Remaining hand-rolled dialog/sheet a11y                                                                        | 🟡  | `ProductDrawer`, `GlobalNav` sheet (most surfaces now use shadcn/Radix dialogs)                             | Batch 3   |
| No shared form abstraction; RHF+Zod installed, unused outside `ui/form.tsx`                                    | 🟡  | Adopt RHF+Zod + shared schemas (client+server)                                                              | later     |
| `/td`/`/eldondolla`/`/thetejeda`/`/danielasanchez` duplicate `$username`                                       | 🟡  | Shared profile renderer with variants/templates                                                             | optional  |
| `cabana-store.ts` uses `any` casts on Supabase updates                                                         | 🟡  | Tighten with generated `TablesUpdate<>` types                                                               | later     |
| ~~Components organized by page, not business boundary~~                                                        | ✅  | `components/cabana/{posts,messaging,notifications,subscriptions,moderation,...}`                            | done      |
| ~~Server-action plumbing unused~~                                                                              | ✅  | T2 tier wired since P2B (`attachSupabaseToken` + `requireSupabaseAuth`; `attachSupabaseAuth` in `start.ts`) | P2B       |
| No shared `Money` formatter (`QueryErrorState` + `EmptyState` + `ScrollFadeRow` now shipped as shared cross-cutting components) | 🟡  | Extract a shared money formatter; convention: failures never render fake business data                      | Batch 4+  |
| ~~Marketing content is module-level constants in components~~                                                  | ✅  | Moot — the orphaned marketing suite was deleted July 9; no marketing components remain                       | done      |

## 9. Testing Debt (🟠)

Solid base exists: vitest (337 tests, **95% coverage gate** over the 16 pure business modules; 99.53% stmts / 95.8% branch), 17 SQL suites in `supabase/tests/`, and CI running the full gate + a from-zero Docker rebuild. Still missing: E2E (signup → publish → subscribe), integration tests of hooks/server actions against a real stack, payment/webhook/idempotency tests (when M8 lands), accessibility + responsive visual regression, and load tests (feeds/messages/notifications).

## 10. Deployment & Ops Debt (🟠)

Git history ✅ · CI gates ✅ · deploy target is **Vercel** (Nitro `vercel` preset → `.vercel/output`; prod `cabanagrp.com`) — not Cloudflare (`wrangler.jsonc` remains only because the bundled CF plugin reads it). Still needed: documented staging/prod envs · preview-deploy policy · secrets rotation/ownership · DB backups + PITR + DR runbook · monitoring/error-tracking/uptime/alerting · payment reconciliation + RLS-failure + webhook-failure + queue-lag alerts (with M8).

## 11. UI/UX Polish Program (July 8, 2026 audit)

A read-only production-readiness audit (21 auditors + adversarial verification) confirmed **249 findings**: 0 Critical / 9 High / ~116 Medium / ~130 Low, overall ≈**6.5/10** (weakest: links/store/media-kit/settings at 5). The approved plan is six batches, each gated on approval; the full report was delivered in-session and is not stored in the repo.

- **✅ Batch 1 — Trust & Honesty (RESOLVED July 8, 2026; committed July 9, 2026).** Every fake-presented-as-real surface now labeled or bound to real data: MediaKit hero on the real profile with "sample" markers; SettingsPanel honest integration states (no fake Stripe/SSL/`@aurora`); `/admin` hub labeled demo with dead controls disabled and links to the 5 real tools; `aurora` fallbacks removed from preview links; `/td` fake follow → real link. New shared `QueryErrorState` + error/loading states wired into earnings, subscribers, links, store, and analytics so query failures never render fake zeros; LinkManager's false "Schedule for later" promise removed; orphaned `aurora-hero.jpg` deleted. Verified with the full gate + an authenticated Playwright walkthrough.
- **✅ Batch 2 — Core UX (RESOLVED July 8, 2026; committed July 9, 2026).** Two-homes IA fixed (`/dashboard` = creator business home; `DashHome` → "My Page" at `/dashboard/link-in-bio`; grouped sidebar; Messages → real `/messages` + unread badge; `DemoMessages` deleted); debounced autosave now flushes on unmount; load-more + at-cap disclosure on feed/comments/messages/notifications/ledger; `QueryErrorState` retries wired across messaging/comments/post-detail/admin; `QueryClient` `retry: 1`/`staleTime: 30s`; onboarding resilience (auth guard, `?step=` URL steps, sessionStorage drafts, `goLive` partial-failure recovery without duplicate creates, honest Preview copy, avatar rejection toasts). Verified with the full gate + an 11-check authenticated Playwright suite on volume-seeded data.
- **🟠 Batch 3 — Accessibility (open):** reduced-motion support, aria labels/pressed/current fixes, skip link, focus management, dialog a11y, touch targets, iOS input zoom, alt text on post media.
- **🟡 Batch 4 — Creator workflow (open):** post edit, delete confirmations, upload progress, messaging UX (day grouping, optimistic send, double-send guard), notification read/settings behavior, price validation, live-preview fidelity, "Saved" indicator, raw-error humanizing.
- **🟡 Batch 5 — Design system (open):** raw-button migration (~117), segmented-control/status-chip/shadow/radius unification, display fonts never loaded.
- **🟡 Batch 6 — Marketing & polish (open):** landing value prop / landing-page rebuild (the orphaned marketing suite was **deleted July 9**), image optimization, per-route `<title>`s, terms/privacy pages, SSR 500 page branding, sonner wrapper, icons/manifest, 404 CTA → `/discover`.

---

## Top 7 to Burn Down First (impact × risk)

1. 🔴 Switch the public creator read to **`public_creator_profiles`** (stop leaking `user_id`) — the view already exists.
2. 🟠 **Batch 3 Accessibility** — the largest confirmed-finding cluster after trust (Batch 2 ✅ done).
3. 🟠 Server-side route guards + `?redirect=` allow-list (data is RLS-safe; the client-only guard is the remaining gap).
4. 🟡 Backend hygiene: repoint/document `supabase/config.toml` `project_id`, drop `legacy_reel` after sign-in confirmation, apply `20260529000000_post_media_service_grant.sql` + `20260530000000_high_qa_fixes.sql` to cloud.
5. 🟠 Product `price` → `price_cents` + currency before any real storefront money (M8).
6. 🟠 Ops readiness for M8: monitoring/error-tracking/alerting, backups + PITR, staging env docs.
