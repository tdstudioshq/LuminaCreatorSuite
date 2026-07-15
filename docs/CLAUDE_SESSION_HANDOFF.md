# CABANA — Claude Agent Session Handoff

> Prepared June 25, 2026 · Last updated July 15, 2026
>
> Workspace: `/Users/tdstudiosny/LuminaCreatorSuite`

## Mission

Continue evolving CABANA from its current creator OS/link-in-bio/storefront application into a premium creator subscription platform.

Do not rebuild or redesign the application. Preserve the existing CABANA visual system, authentication, creator dashboard, public profiles, links, storefront, analytics, and Supabase integration.

Use these documents as the source of truth:

1. [`CABANA_ARCHITECTURE.md`](../CABANA_ARCHITECTURE.md)
2. [`docs/CABANA_BUILD_ROADMAP.md`](./CABANA_BUILD_ROADMAP.md)
3. This handoff

## Session update — July 15, 2026 (Stream PR #24 recovered and completed as a full vertical slice — UNMERGED, awaiting approval)

**The Cloudflare Stream workstream is now feature-complete on `stream/5a3-composer-ui`.** PR #24 stays **OPEN and DRAFT**; nothing merged, nothing deployed, no production SQL, no migration added. `origin/main` is untouched at `fa903dc`.

- **Branch integration:** merged `origin/main` into the branch (**no force-push, no history rewrite** — feature PRs are squash-merged here, so branch-internal history collapses anyway and a rebase would buy nothing). Exactly ONE conflict: `vitest.config.ts`, resolved as a **UNION**. This was the session's biggest silent hazard — the branch predates the six admin modules `15cb8ad` added, so taking the branch side would have **un-gated six coverage-gated modules with no check failing**. Result: 26 entries.
- **Four verified server defects fixed** (all found by tracing, all confirmed by reading source):
  1. `publishPost` had **zero** stream awareness — `assertPublishableMedia` was written but never called; the only gate was the composer's UI gate, which a reload defeats (session resets to `idle`).
  2. `getPostMediaUrls(+Batch)` were **bucket-blind** — signed `cloudflare-stream` rows against the Supabase bucket, discarded the error, and the row silently vanished while the post still counted it.
  3. **Attach race** stranded `processing_status` at "processing" **forever** (webhook landed before the media row existed → matched 0 rows; video went terminal → status-refresh short-circuits → nothing ever repaired it).
  4. `deletePost` **orphaned the Cloudflare asset permanently** and no-op'd its storage remove (a stream path matches the owner prefix by construction → wrong bucket).
- **Publish readiness:** `resolveMediaProcessingStatus` judges a Stream row by `stream_videos.status`, **never** `post_media.processing_status` (best-effort, can lag). **Known, accepted gap:** raw-PostgREST bypass remains (table-wide UPDATE grant + ownership-only policy) — owner-self-harm only, and playback fails closed so it self-heals. Tyler chose **server gate now, migration deferred**.
- **Playback (5B):** `useStreamPlayback` + `StreamVideoPlayer` (poster-first, click-to-mount iframe — no hls.js, no new dep) + `PostMediaGallery` fork. `PostCard` being the single shared renderer means feed / `$username` / discovery / post detail all got it at once.
- **Detach (5A.4):** `detachStreamVideoFromPost` + controller `removeAttached` — pays the `detachRequired` debt that was previously **unpayable** (it permanently blocked the machine's reset).
- **Orphan sweep:** `stream-reconcile-actions.ts` + `/admin/stream`. `selectOrphanCandidates` had been written, tested, and gated for three checkpoints **with zero callers**, while three call sites named it as their backstop. Grace `readyUnattachedMs` **24h → 7 days** (Tyler's call — a day strands a Friday upload composed on Monday).
- **Gates:** lint 0 errors (6 known shadcn warnings) · tsc clean · **1155 tests / 43 files** · coverage 98.8–99.8% (95% gate) · build green · **`db:validate` from zero PASSED** (all suites incl. creator-page 2A.1–2A.4) · **client bundle verified free of every Cloudflare/service-role marker**.

**⚠️ The one thing NOT verified — do not skip this before merge:** **no real video has ever flowed through this system.** There is only ONE Cloudflare Stream account and it backs the LIVE production webhook, so a real upload→encode→playback→delete lifecycle cannot be exercised without touching production infrastructure. A read-only API probe confirmed credentials/reachability; the create/delete lifecycle test was **refused, not faked**. Prerequisite: a non-production Stream account, or explicit approval to create+delete one throwaway asset in the production account. CLAUDE.md's invariant still stands: **no production deploy until a real video is verified end-to-end.**

## Session update — July 15, 2026 (Phase 2A SHIPPED — production release: cloud migrations + merge + deploy)

**Admin creator-page management is LIVE in production.** PR #25 was completed end-to-end this session (recovery → gate → cloud apply → merge → deploy → verify), Tyler-approved at each gate. Everything below is on `main`.

- **PR #25 merged (squash — the established feature-PR strategy):** title `feat(admin): complete creator-page management and editor`; **final merge commit `15cb8ad`** on `main`. Branch `admin/creator-pages` retained (repo `delete_branch_on_merge=false`).
- **Production deployment:** the merge to `main` triggered **exactly one** production Vercel deploy (`dpl_4npa2EW7SJy1t9586HW5RVT6NS4s`, target `production`, state `READY`, commit `15cb8ad`) — cabanagrp.com serves it; branch deploys were previews only; no unrelated deploy.
- **Cloud schema now `20260540`.** Migrations `20260537` (visibility) → `20260538` (admin RPCs + audit) → `20260539` (audit visibility + role mgmt) → `20260540` (ownership/lifecycle integrity) were applied to cloud `rpzaeqoqcaxxavltgvpe` via the **Management API SQL endpoint** (exact committed bytes, `begin;…commit;`, in order; reconcile-era ledger untouched — no `db push`), verified object-by-object; the `smoke.sql` grant assertion was aligned to `20260540` (`f2220fe`).
- **Regenerated `types.ts`** from cloud (purely additive: `creator_page_status` enum + 5 columns + 13 functions; no unrelated generated churn) and **removed the types-lag cast shims** (`a4e6a1f`).
- **Shipped surface:** admin creator **directory** (`/admin/creators`), **new/detail editor** (`/admin/creators/new`, `/admin/creators/$creatorProfileId` — identity/appearance/links/lifecycle/ownership/preview/audit), and the shared **public creator-page renderer** (`components/cabana/creator-page/`, `$username` gates on `pageStatus==='published'`).
- **RBAC + audit hardening (live):** admin write is 8 SECURITY DEFINER RPCs (internal `is_current_user_admin()`, one audit row each); **moderator audit visibility restricted** to operational report rows (finance/ownership/role/creator-page audit is admin-only); **direct `user_roles` DML revoked** (role changes only via `admin_grant/remove_user_role`).
- **Integrity (live):** **one creator page per non-null owner** (partial unique index); **lifecycle + ownership protected** — owner column-UPDATE excludes `page_status` and `user_id` (no self-publish/transfer) and `links.profile_id` (no reparenting, plus an immutable-parent trigger).
- **Production verification (non-destructive, no residue):** `smoke:prod` 8✓/0✗/1skip/1flaky (incl. STREAM-WEBHOOK 401 — **Stream no regression**); live-state re-assertions + a **rolled-back** anon probe confirmed draft/archived hidden, published visible, links ordered/hidden-omitted; 0 residue (no permanent test pages/accounts created).

**Remaining / NOT done (durable):**

- **Invite/claim flow** — admin-created pages are ownerless (`user_id` null) drafts; there is a directory `claimed` status filter but **no invite/claim implementation**. Next slice.
- **Staff MFA / session-security** hardening for the admin tier — not started.
- **Stream PR #24** (`stream/5a3-composer-ui`, composer UI) remains **separate and unmerged** — untouched by this release.
- Money stays **demo-only**; **no real payments/KYC/adult-upload** readiness is implied by any of this.

## Session update — July 14, 2026 (Admin creator pages: live directory + Phase 2A.1 visibility + 2A.2 admin RPCs)

Branch-isolated, gated work on **`admin/creator-pages`** (HEAD `7e72825`, 0/0 with origin). **PR #25 is open, draft, unmerged.** CI green on every commit. Working tree clean except untracked `.claude/`. **No production SQL applied; no production deployment; migrations `20260537`/`20260538` exist only on this branch.**

### 1. Admin directory — Phase 1 (`e37fe02`)

- Live, **read-only** `/admin/creators` directory backed by real `creator_profiles` data.
- Replaced the fabricated "Users" surface (invented creators/emails behind disabled menus) with the real directory + honest "no backend yet" copy.
- Established the server-side `assertAdmin` defense-in-depth convention (route `AdminGate` = UX only; handler reads the caller's own `user_roles` row under RLS; RLS is the final authority). No schema change, no write path.

### 2. Documentation (`9638e32`, `1e3a172`)

- `9638e32` — added the admin creator-page implementation plan (`docs/CABANA_ADMIN_CREATOR_PAGES_PLAN.md`).
- `1e3a172` — refreshed `CLAUDE.md`: added `cabana-admin-creators` to the coverage-gate list, replaced a dead Stream-composer example with real coverage-gated function names, and documented the `assertAdmin` admin-action convention.

### 3. Phase 2A.1 — creator-page visibility (`fe4b537`)

- Migration `20260537000000_creator_page_visibility.sql` (visibility/schema only — no RPCs, no audit, no UI).
- `page_status` enum (`draft` | `published` | `archived`), **default `published`** so every existing row and self-signup creator stays visible (no regression); appearance fields `font_family` / `background_style` (CHECK-constrained); link `kind` + `is_visible`.
- **Draft/archived pages are hidden from anon at the base-table RLS** (role-split SELECT policies) **and** filtered out of the `public_creator_profiles` view — the public page reads the base table directly, so the boundary lives in both places.
- **Link visibility inheritance**: a link is anon-visible only if `is_visible` AND its parent page is published.
- `links.url` gained an **HTTP/HTTPS scheme-prefix guard** (`links_url_http_scheme`, NOT VALID) — a scheme check only, not full URL validation; accepts the `https://` authoring placeholder.
- Load-bearing RLS gotcha discovered and resolved: an RLS `USING` clause needs the role's column-SELECT on referenced columns (→ anon got a column-scoped `page_status` grant), and a cross-table policy subquery needs _table_-level SELECT (→ the baseline `"Owners manage own links"` policy was rescoped to `authenticated`, which anon never satisfied anyway). No SECURITY DEFINER helper was needed.
- Behavioral SQL: `supabase/tests/creator_page_visibility.sql` (26 assertions) — green from zero; wired into `db-validate.sh` + `ci.yml`.

### 4. Phase 2A.2 — admin creator-page management (`7e72825`)

- Migration `20260538000000_admin_creator_page_management.sql` — purely additive: **eight admin SECURITY DEFINER RPCs** (create / update / set-status / transfer page; upsert / set-visibility / reorder / delete link) + an internal `write_creator_audit` helper. No visibility-policy change, no invite/claim, no service-role dependency.
- Every RPC: `search_path=''`, rejects unauthenticated, internal `is_current_user_admin()` gate, trusted-row targets, `FOR UPDATE` locks, generic non-leaking errors, `revoke from public/anon` + `grant to authenticated`.
- **Complete one-per-operation audit coverage** across all nine creator-page/link mutation events (target types `creator_profile` / `creator_link`); no audit on failure; no email/token/secret in payloads; owner Auth UUIDs recorded only on transfer (honest `profiles.id === auth.users.id`).
- Pure `src/lib/cabana-creator-pages.ts` (in the 95% coverage gate) mirrors the rules (status machine, allow-lists, reorder validation, error mapping); SQL stays authoritative.
- Thin server-action wrappers `src/lib/admin-creator-page-actions.ts` (`attachSupabaseToken` + `requireSupabaseAuth` + `assertAdmin`, caller-RLS only, no service role) with injected-dependency tests.
- At completion: **893/893** unit tests (28 files), coverage thresholds pass, CI + from-zero database baseline green. Behavioral SQL `supabase/tests/admin_creator_page_management.sql` (7 blocks) wired into `db-validate.sh` + `ci.yml`.

### 5. Production / cloud state — ACTION REQUIRED before the UI phase

- **`20260537` and `20260538` are NOT applied to Supabase production.** They exist only on `admin/creator-pages`.
- Apply **only with explicit approval**, via the **Management API pattern** — **never `supabase db push`** (the cloud `schema_migrations` ledger uses reconcile-era versions).
- Apply **in order: `20260537` then `20260538`.**
- After applying, **regenerate `types.ts`** and remove the temporary RPC cast shim in `admin-creator-page-actions.ts` (the new RPCs are absent from the cloud-generated types until then).

### 6. Open risks

- **Moderator-readable audit rows** currently include payout data (`payout.*` amounts) and, now, creator-page **transfer owner UUIDs** — `audit_logs` is staff-readable (admin OR moderator). The reserved corrective migration **`20260539000000_audit_log_visibility.sql` is not created yet.**
- **One-creator-page-per-user is RPC-enforced, not DB-constraint enforced** (no unique index on `creator_profiles.user_id`); a non-RPC write path could bypass it.
- **PR #25 must stay draft/unmerged** until the migrations and a UI release plan are coordinated.
- **Pushes to `main` auto-deploy production** — keep this work on the branch; branch pushes create Vercel **preview** deployments only (confirmed this session).

### 7. Next recommended work (in order)

1. **Phase 2A.3 — audit-log visibility hardening** (`20260539`): restrict finance/ownership audit rows to admins.
2. Admin creator-page **editor UI** over the 2A.2 RPCs + the `/admin/creators` directory.
3. **Controlled cloud migration apply** (`20260537` → `20260538`, Management API, approval).
4. **Regenerate `types.ts`** and drop the RPC cast shim.
5. **End-to-end admin-created draft → publish test** against the deployed app.
6. Invite/claim remains later work.

### Cross-stream isolation note

- The Cloudflare Stream composer work lives on **`stream/5a3-composer-ui` (PR #24, open, draft, unmerged)** and is entirely separate. **Do not mix Stream work into `admin/creator-pages`** (and vice-versa); keep the two branches and PRs isolated.

## Session update — July 13, 2026 (Stream Checkpoints 3 finalized + 4 shipped: webhook + lifecycle sync)

Cloudflare Stream program state (Tyler-directed, checkpoint-gated):

- **Checkpoint 3 (server actions) finalized and closed.** The feature commit `0328e06` (six
  `createServerFn` actions in `stream-actions.ts`; the "five actions" in the earlier report was the
  `getStreamPlayback(+Batch)` shorthand — the true count is **six**) was verified end-to-end: types.ts diff
  scoped to `stream_videos`/`post_media.stream_video_id`/enum/FK only; client bundle free of all secret
  markers (the whole Stream tree is tree-shaken out of BOTH bundles until a consumer imports it); CI green.
  `884e191` (docs) reconciled CLAUDE.md's coverage-set list with `vitest.config.ts` (adds `cabana-redirect`,
  `cabana-stream`).
- **Checkpoint 4 (webhook + lifecycle sync) shipped as `6352542`** — pushed, CI green (Verify + prod-deps
  Node 22.20.0 + Docker DB baseline incl. `stream_videos.sql`). `POST /api/webhooks/stream`
  (`src/routes/api.webhooks.stream.ts`, the repo's **first server route** — `server.handlers` convention,
  POST-only, no component, handler dynamically imports the server module; client bundle verified
  marker-free) → `src/lib/stream-webhook.server.ts` (the ONLY reader of `CLOUDFLARE_STREAM_WEBHOOK_SECRET`;
  HMAC-SHA256 over `<literal time>.<raw body>` via the pure `verifyStreamWebhook`, constant-time, 300 s
  window; strict parsing rejects live-input states → 400; unsigned/invalid → 401 BEFORE any DB access;
  unknown UID → 200 no-op; DB failure → 500 for idempotent Cloudflare redelivery). Lifecycle applies by
  REUSING `executeStatusRefreshFlow` with the webhook body as the snapshot — one shared compare-and-set,
  terminal ready/error never regress, `post_media` syncs `processing_status`/`width`/`height` only. 40 new
  tests (21 files / **651** tests total, was 611); live-verified against a dev server with an openssl-signed
  request. `smoke:prod` gained a `STREAM-WEBHOOK` check (401 expected; SKIPs while undeployed/unconfigured).
  **NO migration was needed** (20260536 grants already cover every webhook write).
- **Deliberately NOT done (approval-gated next steps):** Cloudflare webhook registration
  (`PUT .../stream/webhook`) + putting the secret on Vercel; React hooks; composer/player UI; tus-js-client;
  any real video; any deploy. The webhook route is **dormant in production** until registration; owner
  polling (`getStreamVideoStatus`) drives the lifecycle. Also noted in `CABANA_TECH_DEBT.md`: no scheduled
  orphan sweeper yet (pure `selectOrphanCandidates` exists) and idempotency is CAS-based (no
  `webhook_events` dedupe table — fine while events are state-refresh-only).
- One local side effect during the session: `bun run format` prettier-normalized five untouched docs; that
  churn was committed as `e94ce56` then **dropped via `git reset --hard` at Tyler's direction** (never
  pushed) so Checkpoint 4 is exactly one commit. Those docs will re-format on anyone's next full
  `bun run format` — harmless, cosmetic.

**State at session end:** `HEAD == origin/main == 6352542` (0 ahead/0 behind), tree clean (untracked
`.claude/` only), CI green. Gates: lint 0 errors (6 expected shadcn warnings) · tsc clean · test **651/651**
(21 files) · coverage thresholds pass · build green · from-zero `db:validate` green through `20260536`.
Cloud DB current through **`20260536`** (applied July 12; no cloud SQL this session). Next recommended:
Checkpoint 5 per Tyler's direction (likely hooks/UI/tus or webhook registration — **wait for explicit
scope approval before starting**).

## Session update — July 11, 2026 PM (Release B: three DB security fixes committed, pushed, CI-green, and applied to cloud)

Continuing the backlog program (master plan in `~/.claude/plans/expressive-napping-pike.md`). After Release A
(`2c649e2`, below), three isolated **Release B** database security/integrity fixes were each built with a
local reproduction, an additive/corrective migration, a behavioral SQL test (registered in
`scripts/db-validate.sh` + `.github/workflows/ci.yml`), the full gate + from-zero `db:validate`, then
committed, pushed (CI green), and **applied to cloud** (`rpzaeqoqcaxxavltgvpe`) via the Management-API SQL
method — once, transaction-wrapped, exact committed bytes; ledger untouched; each followed by post-apply
verification + `bun run smoke:prod` (green). Cloud is now current through **`20260535`**.

- **`fdae839` — cross-post media injection (`20260533000000_post_media_ownership_check.sql`).** The
  `post_media` write policy's WITH CHECK validated only `owner_user_id`, so any creator could attach media to
  another creator's post (or republish a victim's private path) via raw PostgREST. Fix: USING unchanged
  (owner-only), WITH CHECK additionally requires the caller to own the target post (`is_current_user_creator`
  on `posts.creator_profile_id`) and `storage_path`'s first segment = caller uid. Also corrected the
  misleading `post-actions.ts:279` comment. Cloud pre-scan: 0 injected rows.
- **`9f6d864` — recalc_creator_balance cross-user write (`20260534000000_recalc_creator_balance_internal_only.sql`).**
  The function was granted EXECUTE to `authenticated` but is only invoked via `PERFORM` inside SECURITY
  DEFINER RPCs; any user could recompute/pollute any creator's `creator_balances` for arbitrary currencies.
  Fix: revoke EXECUTE from `public`/`anon`/`authenticated` (internal-only; owner/`service_role` retain it);
  `search_path` already `''`. Moved the `admin_payouts.sql` recalc call out of its authenticated role block.
  Cloud pre-scan: 4 benign zero-value USD rows (empty ledger), no exploit signature.
- **`5bbbc98` — analytics_events ingestion hardening (`20260535000000_analytics_events_hardening.sql`).**
  Unconstrained anon inserts allowed arbitrary `event_type`, unbounded `metadata`/`target_id`, and explicit
  `id`/`created_at` (backdating); owner reads had no index. Fix (NOT VALID CHECKs so a cloud apply can't
  fail on historical rows): event_type allow-list (`page_view`|`link_click`|`product_click`, from
  `CabanaEventType`); metadata must be a JSON object ≤ 4 KB and `target_id` ≤ 256; `(profile_id, created_at desc)`
  index; INSERT grant narrowed from table-wide to the four intended columns so `id`/`created_at` stay defaults.
  RLS policies unchanged; `smoke.sql` grant assertion updated to column-scoped. Cloud pre-scan: 6 legit
  `page_view` rows, 0 junk.

**State at session end:** `HEAD == origin/main == 5bbbc98` (0 ahead/0 behind), working tree clean (only the
untracked local `.claude/`), CI green, cloud current through `20260535`, `smoke:prod` green. Gates:
`lint` 0 errors (6 expected shadcn warnings) · `tsc` clean · `test` **353/353** (17 pure modules) · `build`
green · `db:validate` from-zero all **22** SQL suites. **Two Release-B security findings from the plan remain
open (not started):** none outstanding from the ones scoped this session; the broader 20-item backlog
(Releases C–G) is unstarted. Next recommended: resume the master plan (e.g. item 5 links/products counter
grants, item 8 creator-profile uniqueness) — each as its own isolated, gated slice.

## Session update — July 11, 2026 (Backlog program kickoff + Release A landed — supersedes the two July-10 PM entries below)

**State reconciliation (Phase-0 verified read-only this session).** The two July-10 PM entries below
are **SUPERSEDED** on commit/push/cloud-apply/deploy status — they described an in-progress working set
that has since shipped:

- HEAD is `8b482b4` and **`main == origin/main`** (pushed; the "9 commits ahead / push blocked" note
  below is resolved). CI is green on `8b482b4`.
- Migrations **`20260531` (audience insights) and `20260532` (creator_profiles anon column grant) are
  BOTH applied to cloud** (`rpzaeqoqcaxxavltgvpe`) — verified live this session: anon
  `GET /rest/v1/creator_profiles?select=user_id` → **42501 permission denied**, `select=handle` → 200,
  `rpc/creator_audience_insights` anon → 42501 (exists, denied). **Cloud is current through `20260532`;
  nothing is ahead of cloud.** Do NOT re-apply `20260531`/`20260532`.
- Production Vercel deploy is **READY and built from exactly `8b482b4`**. 🔎 Phase-0 discovery: that
  deploy came via the **GitHub integration (auto-deploy on push to `main`)**, alongside the documented
  prebuilt-CLI flow — **two deploy paths are live**, neither gated by CI-green or `smoke:prod`. This
  dual-path fact is otherwise undocumented (tracked under backlog items 1/14/16).

**Program.** Tyler approved a controlled 20-item audit-backlog program (master plan in
`~/.claude/plans/expressive-napping-pike.md`; classification via a 41-agent read-only workflow). Two
security findings emerged sharper than the backlog framing and are queued for Release B (DB hardening):
🔴 **cross-post media injection** (`post_media` INSERT grant + owner-only WITH-CHECK lets any user attach
media to any creator's post, invisibly) and 🟠 **`recalc_creator_balance`** authenticated grant (cross-user
junk balance-row writes). Neither is fixed yet — Release B, gated on approval + Management-API apply.

**Release A landed this session (docs + CI + one tiny app fix; no cloud SQL, not yet committed):**

- **Item 15 (docs reconcile):** this closing entry + tech-debt header/counts (22 migrations, 19 SQL
  suites) + purge of the dangerous `supabase migration repair` guidance in `CABANA_DATABASE.md` and
  `supabase/README.md` + `CABANA_DATABASE.md` header/`on_hold` fixes.
- **Item 4 (dead auth middleware):** deleted the never-registered `src/integrations/supabase/auth-attacher.ts`
  (0 imports) and corrected the false "`attachSupabaseAuth` registered in `start.ts`" claims in CLAUDE.md,
  `CABANA_ARCHITECTURE.md`, `CABANA_PROJECT_STATE.md`, and tech-debt — the live mechanism is per-function
  `attachSupabaseToken` composition. (Lockfile Start-version alignment deferred to Release C.)
- **Item 3a (redirect allow-list):** new pure, unit-tested `src/lib/cabana-redirect.ts` (`sanitizeRedirect`,
  in the 95% coverage set) wired into `LoginCard`; `reset-password.tsx` now shows an invalid/expired-link
  state instead of failing at submit. The Google OAuth leg still drops the deep link (documented; carry-
  through deferred to Release C).
- **Item 14 (CI/toolchain pins):** `ci.yml` bun `1.3.14` / supabase-CLI `2.107.0` / pnpm `9.15.0` /
  node `22.20.0` (no more `latest`); `package.json` gains `packageManager: pnpm@9.15.0` + `engines.node: 22.x`;
  new `.nvmrc`. Both frozen installs (bun + pnpm) verified locally. ⚠️ `engines.node`/`packageManager`
  influence the **Vercel build image** — the next auto-deploy will build on node 22 (already the CI-tested
  major); verify the live function runtime per item 14 before pinning `vercel.functions.runtime`.
- **Items 19 + 20 (decision docs):** Product Boundary Decision Record scaffold in `CABANA_PRODUCT_SPEC.md`
  - new `docs/CABANA_M8_READINESS.md`, each listing the open decisions awaiting Tyler's ruling.

**Gates (Release A):** `bun run lint`, `bunx tsc --noEmit`, `bun run test` all green on the working tree
(`bun run build` per CI). Next: commit Release A, then Release B (cross-post-injection fix first) on approval.

## Session update — July 10, 2026 PM (🔴 anon `user_id` REST leak closed at the DB layer — migration `20260532`, UNCOMMITTED, cloud NOT applied)

> **⚠️ SUPERSEDED (see the July 11 entry above):** `20260532` is now committed (`8b482b4`), pushed, and
> applied to cloud (live-verified). The "UNCOMMITTED / cloud NOT applied" status below is historical.

A full trust-nothing audit (23-agent fan-out + all gates re-run) confirmed a real Critical: although
the July-10 app fix removed `user_id` from `useCreatorByHandle`'s wire, the base table's **anon grant
was still table-wide**, so `GET /rest/v1/creator_profiles?select=user_id` returned auth UUIDs for
every creator — **verified live against cloud** (HTTP 200 + masked UUIDs). This session implements
ONLY that fix (no other audit findings touched):

- **Migration (additive, no policy/data change):** `supabase/migrations/20260532000000_creator_profiles_anon_column_grant.sql`
  — `revoke select on public.creator_profiles from anon`, then re-`grant select` to anon on the **13
  public columns only** (`user_id` omitted). The `Public can view creator profiles` policy is
  UNCHANGED; `authenticated` keeps full-table SELECT (owner reads of `user_id` via
  `useCabana`/`getMyProfileId` still work). Preflight confirmed repo == cloud columns (14 each,
  identical) and that **no anon app path selects `user_id`** (the only anon read is the scoped
  `useCreatorByHandle`). Rollback: `revoke select … from anon; grant select on … to anon;`.
- **Behavioral test:** `supabase/tests/creator_profiles_anon_grant.sql` — column-privilege catalog
  asserts (13 public cols granted, `user_id` denied, `authenticated` full), anon behavioral read
  (public cols succeed, row still visible via the unchanged policy, `user_id` raises 42501),
  authenticated owner reads own `user_id`. Registered in `scripts/db-validate.sh` AND
  `.github/workflows/ci.yml` (now 19 SQL suites).
- **Gates (all green this session):** `bunx tsc --noEmit` clean · `bun run lint` 0 errors / 6 expected
  shadcn warnings · `bun run test` **347/347** · `bun run build` green · `bun run db:validate`
  from-zero green incl. the new suite (3/3 sub-checks). **Local REST proof** against the reset stack:
  anon public-col query → 200 + rows; anon `user_id` / `select=*` → **42501 permission denied**;
  authenticated JWT `user_id` → 200 (column returned). Grant introspection: anon SELECT columns = the
  13 public ones, `user_id` not among them (anon retains only harmless `REFERENCES`).
- **Not done (out of scope, by request):** no other High/Medium/Low audit findings; no code changes
  (preflight proved none needed); **cloud NOT applied** (needs Management-API apply + approval, then
  `smoke:prod`); not committed/pushed/deployed. `CABANA_TECH_DEBT.md` §6, `CABANA_DATABASE.md`, and
  CLAUDE.md's migration chain + test list updated to match.
- **Note:** cloud is already current through `20260531` (audience insights applied + verified July 10);
  `20260532` is the only migration now ahead of cloud.

## Session update — July 10, 2026 PM (Full audit GREEN + Phase 11C Option B drafted + 🔴 user_id leak fixed — all UNCOMMITTED)

> **⚠️ SUPERSEDED (see the July 11 entry above):** the "9 commits ahead / push blocked" and "nothing
> committed / not deployed" claims below are resolved — the whole working set shipped as `95539c5` +
> `8b482b4`, `main == origin/main`, and production is deployed from `8b482b4`.

Tyler approved Phase 11C **Option B** (tab within `/dashboard/performance`; **named** top supporters,
creator-only; engagement aggregates stay anonymous). A full fresh-audit pass verified docs vs. tree
(10/10 claimed fixes real; docs stale where they disagree, code right), then this work landed —
**nothing committed, no cloud Supabase touched, NOT deployed**:

- **Migration draft (awaiting Tyler's review):** `supabase/migrations/20260531000000_audience_insights.sql`
  — ONE creator-scoped SECURITY DEFINER read RPC `creator_audience_insights(_supporter_limit, _window_days)`
  returning jsonb (11B pattern; no table/column/enum/RLS/trigger change; authenticated-only). Section 1:
  engaged-follower + recency counts (7/30/90d, COUNT-ONLY — likes/saves identities never returned).
  Section 2: top supporters named via the `creator_subscribers_list` identity shape (member/creator
  profile fallback; null-payer spend aggregates to one unnamed "Former member" row), spend summed from
  the caller's own succeeded `transactions` (`creator_net_cents`; types tip/post_unlock/creator_subscription
  — fees never re-derived). Column/enum names verified against the real migrations.
- **Behavioral test:** `supabase/tests/audience_insights.sql` (counts, ranking + per-source cents at the
  10%+3% fee model, payload-key privacy check, creator isolation, member + anon denial), registered in
  `scripts/db-validate.sh`. **Not yet run** — no Docker on this host; CI's from-zero rebuild covers it.
- **🔴 Tech-debt #1 fixed:** `useCreatorByHandle` no longer `select("*")`s `creator_profiles` —
  explicit column list omitting `user_id` (`src/lib/cabana-store.ts`; `CreatorRow.user_id` removed,
  unused). NOTE: the register's suggested "swap to `public_creator_profiles`" does NOT work — the view
  is ID-free and lacks `id`/theme/customization columns the public page needs; column-list is the fix.
- **Push blocked:** `main` is **9 commits ahead of `origin/main`** (whole 9B series; prod was deployed
  prebuilt from local). An agent push attempt was permission-denied — Tyler should `git push origin main`.
- **Gates (post-change):** lint 0 errors (6 pre-existing shadcn warnings), `tsc` clean, build green
  (`.vercel/output`), **347/347 tests**. `db:validate` needs Docker (not on this host).
- **Doc staleness found by the audit (not yet reconciled):** `CABANA_TECH_DEBT.md` header still says
  `5963a18`/"not pushed"; its Top-7 still lists the July-10-closed cloud-apply + legacy_reel items.
  `CABANA_PROJECT_STATE.md` checkpointed at `5963a18`. Reconcile in a docs pass.
- **Next:** Tyler reviews the 11C migration + this session's diff → commit → local-Docker `db:validate`
  → then the 11C pure module (`cabana-audience.ts`) + actions + hook + performance tab (gated).

## Session update — July 10, 2026 (Phase 9B COMPLETE — User Notification Center; frontend + pure layer only, NO schema change)

Approved start of Phase 9B. Finished the user-facing notification experience over the Phase 7 read
surface + Phase 9A engine. **No migration written, no cloud Supabase touched, NOT deployed** —
deploy is a separate approved step (then `bun run smoke:prod`).

- **No-schema-change confirmation:** verified `notification_preferences` is per-channel
  (one row per user: `in_app_enabled`/`email_enabled`/`push_enabled`) — the spec's "per notification
  type" granularity would require a migration and is **deferred** (not required for this scope; the
  existing table fully supports channel preferences). Everything else (notifications, dedupe keys,
  recipient RLS, the column-scoped `read_at` grant) already existed from Phase 7.
- **Pure layer** (`cabana-notifications.ts`, in the 95% gate): `NOTIFICATION_TYPES` +
  `isNotificationType`, `buildNotificationsListQuery` (moves the H-08 limit clamp — 1..200, default
  50 — into the tested pure layer; validates the new `unreadOnly`/`type` filters, throws on unknown
  type instead of widening the read), and `buildMarkAllReadCommand` (mark-all-read as an explicit
  recipient-scoped command). **+10 unit tests**, including the required test asserting the
  mark-all-read write path is scoped to exactly the caller's recipient id + only-unread rows.
- **Actions** (`notification-actions.ts`): `getNotifications` gains optional server-side
  `unreadOnly`/`type` filters (validated by the pure builder; still explicitly
  `.eq("recipient_id", userId)` — the July recipient-scoping security fix is preserved on every
  personal read/write). `markAllNotificationsRead` stays **one UPDATE** and now applies the pure
  command verbatim. The local `clampLimit` helper was subsumed by the pure builder.
- **Hooks** (`use-notifications.ts`): `useNotifications(limit, {unreadOnly, type})` with extended
  query keys (prefix-matching invalidation still hits them); new `useInAppNotificationsEnabled()`
  wires the pure `evaluatePreference`. The per-instance realtime channel-topic pattern (July fix)
  is untouched.
- **Center UI** (`NotificationsCenter.tsx`): All/Unread segmented filter + type Select (server-side
  filtering), day-grouped list (existing `groupNotificationsByDay`), header unread count now from
  the same query as the badges, load-more within the 200 clamp (+ cap disclosure), click-through
  resolves via `resolveNotificationTarget` **and marks the notification read** (closes the audit's
  "open≠read" item), `QueryErrorState`/`EmptyState` everywhere (filter-aware empty copy), and an
  in-app-paused state with a "Turn back on" action when `in_app` is disabled.
- **Preferences UI** (`NotificationSettings.tsx`): in_app toggle is fully functional (suppresses
  center + badges via the shared hook and pauses generation at the DB trigger layer); email/push
  toggles persist to the existing row but are **honestly labeled** "saved now — takes effect when
  delivery launches" (9C). Not hidden, no fake delivery. Now also rendered for members on
  `/notifications` (`MemberNotificationsPage`).
- **Badge consistency:** `NotificationBadge` (dashboard Sidebar + SocialNav rail + mobile tabs) is
  now preference-gated by the same hook as the center, so badges never advertise notifications the
  center refuses to display. `ActivityFeed`/`NotificationSettings` hand-rolled error states swapped
  for the shared `QueryErrorState`.
- **Docs synced:** `CLAUDE.md` (9B bullet rewritten to the finished state), `CABANA_ROUTE_MAP.md`,
  `CABANA_COMPONENT_MAP.md` (Batch 4 register: open≠read resolved), `CABANA_PROJECT_STATE.md`.
- **Gate:** `bun run lint` **0 errors / 6 expected shadcn warnings** · `bunx tsc --noEmit` clean ·
  `bun run test` **347/347 (16 files)** · coverage **99.54% stmts / 95.88% branch / 100% funcs /
  100% lines** (≥95%) · `bun run build` green (`.vercel/output`). `db:validate` not required (no
  SQL change). A 23-agent adversarial review (5 dimensions × 3-refuter verification) ran over the
  diff pre-commit: 6 raw findings → **3 confirmed (all the same root defect, fixed)** — the header
  unread count had moved to the decoupled `useUnreadNotificationCount` query with a `?? 0`
  fallback, so a failed/lagging count query could render a fake "You're all caught up" and disable
  Mark-all-read over visibly-unread rows; fixed by falling back to `countUnread(items)` (server
  total when available, never contradicting the rendered list) — and 3 refuted (placeholderData
  filter-flash claims, 0/3 upheld).
- **Deferred to 9C+:** email/push providers + real delivery (replace the 9A `_result` simulation),
  digests/batching, per-type preference granularity (needs a migration), admin outbox UI.
- **DEPLOYED July 10 (approved):** prebuilt production deploy
  (`lumina-creator-suite-g6sjox3i0`, aliased to cabanagrp.com + www). `bun run smoke:prod`
  (run `smoke_1783698125934`): **7 PASS · 0 FAIL · 1 SKIP · 1 FLAKY (exit 0)** — REALTIME-MESSAGING
  passed on retry (by-design FLAKY semantics), ADMIN-FINANCE still SKIPs (cloud ledger has no
  transactions), CLEANUP-RESIDUE clean. No cloud schema/data touched. Remaining manual step: a
  signed-in visual pass over the notification center (`/dashboard/notifications`, `/notifications`,
  badges, preference toggle) — smoke cannot verify UI rendering.
- **Manual pass DONE (July 10):** Tyler verified the deployed notification center — 9B fully closed.
- **Phase 11C scoping (July 10, awaiting Tyler's pick):** three options proposed. **A** — no
  migration: follower growth (creator-readable `follows.created_at`), audience composition/funnel
  (follows × creator_subscriptions × own transactions), subscriber cohorts, link-in-bio reach
  (`analytics_events`); pure `cabana-audience.ts` + actions + hook + UI. **B (recommended)** — A plus
  ONE creator-scoped SECURITY DEFINER read RPC (11B pattern; migration `20260531`) for what RLS
  hides: engaged-follower rate + activity recency (count-only, no liker/saver identities) and top
  supporters (names only where already creator-visible). **C** — full demographics/geo/device
  collection: new capture tables + server-side geo + retention/privacy decisions; large, deferred
  recommendation. Open sub-decisions for B: `/dashboard/audience` route vs. tab in
  `/dashboard/performance`; top-supporters named vs. anonymized.
- **Next:** Tyler picks the 11C option (gated — no SQL drafted yet), or 9C providers / tech debt.

## Session update — July 10, 2026 (Production smoke-test harness + approved cloud apply of 20260529/30 — GREEN; legacy_reel closed)

Built the post-deploy production smoke test (`bun run smoke:prod`), ran it against production, and —
**with Tyler's explicit approval — applied migrations `20260529` + `20260530` to the cloud DB** (the
only cloud change; nothing else touched). Committed + pushed as `cb5b6d2` (CI green: db-baseline,
verify, prod-deps jobs).

- **legacy_reel closed (July 10):** Tyler confirmed the production Google sign-in round-trip
  (landed on the backfilled `tylerdiorio` admin account; `/admin/finance` renders behind the
  AdminGate) and approved `drop schema legacy_reel cascade`. The read-only preflight found the
  schema **already absent from cloud** (`pg_namespace`: no `legacy_reel`; zero tables/objects) —
  nothing was dropped this session; it was evidently removed sometime after the July 7–8 notes.
  The reconcile-era backups of its contents remain locally under `supabase/reconcile/backups/`
  (`data_profiles_20260707T082223Z.json` + full schema DDL). The last gated reconcile follow-up is
  now closed.

- **First production run (`smoke_1783659742376`): 7 PASS · 1 FAIL · 1 SKIP.** The FAIL was a
  GENUINE PRODUCTION FINDING, not a script bug: `public_creator_profiles.post_count` stayed 0
  after publishing a probe post (delta 0) — migration `20260530` (H5: real published-post count
  instead of hardcoded 0) was not applied to the cloud DB, consistent with commit `1042cbd`.
- **Cloud apply (approved by Tyler):** validated on local Docker first (`bun run db:validate`
  from-zero: all 20 migrations + seed + behavioral tests incl. `post_media_service_grant.sql` and
  `high_qa_fixes.sql` — green). Read-only cloud preflight confirmed H5/H8/H9 absent and
  `20260527`/`20260528` present (`20260529`'s grant already existed on hosted via platform default
  ACLs, as its own comment predicts — the apply was an idempotent re-grant). Applied exactly the
  two migration files, transaction-wrapped, via the Supabase Management API SQL endpoint
  (`/v1/projects/rpzaeqoqcaxxavltgvpe/database/query`, CLI keychain token). Post-verified on cloud:
  view has real counts with grants intact; both functions now take `pg_advisory_xact_lock`.
  ⚠️ The cloud `supabase_migrations.schema_migrations` ledger uses reconcile-era date-stamped
  versions (22 rows, `202607031700xx`/`202607040900xx`) — NOT the repo's `202605xx` numbering. It
  was deliberately left untouched; any future `supabase db push` must account for this mismatched
  history before trusting it.
- **Re-run after apply (`smoke_1783660560715`): 7 PASS · 0 FAIL · 1 SKIP · 1 FLAKY (exit 0).**
  DB-STATE now passes (post*count tracked a published probe post, 0 → 1). REALTIME-MESSAGING was
  FLAKY (first attempt timed out, retry passed — by-design semantics, not a failure).
  ADMIN-FINANCE SKIPs legitimately (cloud ledger has zero transactions; demo ledger rows exist
  only in local seed). CLEANUP-RESIDUE verified nothing `smoke*\*` was left behind. Everything else
  passed: headers/freshness, avatar RLS, public + locked post-media paths, notification scoping
  (incl. the staff-leak fix), dual realtime subscriptions.

- **Files added/changed:** `scripts/smoke-prod.ts` (the harness; ~1,400 lines, manifest of every
  RPC/table/bucket it touches with file:line source citations at the top), `.env.smoke.example`
  (credential template, pre-filled cloud URL + publishable key), `.gitignore` (`!.env.smoke.example`
  negation; `.env.smoke` itself stays ignored), `package.json` (`smoke:prod` script), `CLAUDE.md`
  (new "Post-deploy verification" section: coverage, gaps, run-after-every-deploy).
- **What it does:** 9 checks as real users only (anon + two password sessions, publishable key;
  aborts on a service-role key): DEPLOY-FRESHNESS (5 security headers + `/dashboard/link-in-bio`
  serving the app shell vs a multi-segment 404 control — single-segment paths match `/$username`,
  so the control MUST be multi-segment), AVATAR-STORAGE (owner upload/download + anon rejection),
  POST-MEDIA-PUBLIC (`can_view_post` + feed + owner-signed URL fetch), POST-MEDIA-LOCKED (locked stub,
  zero post-media references — scan is bucket-specific because `avatar_url` is legitimately a public
  storage URL on every row), NOTIFICATION-SCOPING (targeted dedupe-key existence — the follow emit is
  ON CONFLICT DO NOTHING so re-runs assert existence; prefs/block states SKIP), REALTIME-MESSAGING
  (two simultaneous per-instance-topic subscriptions, retry-once→FLAKY), DB-STATE (anon-denied
  creator*content_analytics + post_count DELTA across a published probe post — plain "is a number"
  can't detect the pre-H5 hardcoded 0), ADMIN-FINANCE (creator-name joins, null-only), and a final
  CLEANUP-RESIDUE scan. All created data is `smoke*<ts>`-prefixed, cleaned in `finally`blocks + a
startup sweep scoped to A's own creator profile.`signOut({ scope: "local" })` everywhere — the
  default global scope would revoke ALL of the real admin's sessions on every run.
- **Verification so far:** lint 0 errors · `bunx tsc --noEmit` clean · 337/337 vitest · build green ·
  fail-fast no-credentials path proven live (exit 2 with instructions) · a 44-agent adversarial
  review of the script vs source/migrations found 16 confirmed defects (all fixed; the two biggest:
  global-scope signOut, single-segment 404 control) · deploy-freshness logic dry-run against live
  production (headers present; control 404s; `/dashboard/link-in-bio` 200s — prod is serving this
  cycle's build).
- **Recommended next task:** commit this session's smoke-test files (they are uncommitted on
  `main`), and run `bun run smoke:prod` after every future production deploy per the CLAUDE.md
  "Post-deploy verification" section. ADMIN-FINANCE stays SKIP until the cloud ledger has
  transactions.

## Session update — July 9, 2026 (Ground-truth audit → Phase 0 fixes → themed commits → hygiene → docs)

Acted on the July 9 ground-truth audit: pre-commit correctness fixes, then split the entire
~123-file working set into small themed commits, a repo-hygiene pass, and this docs sync.
**Still frontend/docs + additive SQL only — no cloud Supabase schema or data touched; NOT deployed.**
The whole set is now COMMITTED on `main` (it was previously uncommitted at `6c35f5b`).

- **Phase 0 — pre-commit correctness fixes:**
  - **UUID validation un-loosened.** `admin-finance-actions.ts` / `admin-payout-actions.ts` had relaxed
    the RFC-4122 variant nibble to `[0-9a-f]` to accept non-v4 seed ids. Restored the strict `[89ab]`
    variant and instead made the seed data v4-compliant (`seed.sql` / `smoke.sql`:
    `-4000-{c,d,e,f}000-` → valid `8/9/a/b` variants, collision-checked). Validation no longer bends
    to mock data.
  - **Batched media auth proven.** `getPostMediaUrlsBatch` already authorized each post via
    `can_view_post` before any service-role signing; extracted that ordering into the pure
    `resolveBatchPostMedia` (`cabana-posts.ts`) with a defense-in-depth "drop over-returned rows"
    guard, and added unit tests proving an unauthorized post id in a batch yields no signed URL while
    authorized ids still resolve.
  - **M-18 version-pinned.** Documented that `auth-client-middleware.ts`'s non-OK-`Response`→throw
    coercion depends on TanStack Start's internal `ctx.result` shape (pinned `@tanstack/react-start
^1.167.50`), so a future upgrade re-verifies it.
  - **Notification leak test.** Added a behavioral test (`notifications.sql`) proving an admin reads
    every user's notifications unfiltered (the "Admins read all" policy) but only their own through
    the recipient-scoped query the actions now run.
- **Phase 1 — themed commits (12 code/db).** Split into, in order: `fix(security)` recipient scoping ·
  `fix(admin)` creator embeds + UUID/seeds · `feat(api)` H-08 batching · `fix(auth)` M-18 + funnel ·
  `feat(deploy)` security headers + env template · `fix(realtime)` channel topics · `feat(ux)`
  error-state honesty · `feat(ui)` trust/demo labeling · `refactor(nav)` · `feat(onboarding)` ·
  `feat(ui)` buttons/motion · `feat(db)` migrations 20260529 + 20260530.
  ⚠️ `git add -p` is unavailable in this environment (interactive), so cross-theme files were assigned
  to their dominant theme with secondary changes noted in each commit body (not hunk-split).
- **Phase 2 — hygiene.**
  - **Lockfiles:** kept BOTH. `bun.lock` is load-bearing (CI's main job runs `bun install
--frozen-lockfile`; local dev installs/runs via bun), `pnpm-lock.yaml` is for Vercel's hoisted
    prod build + the `verify-prod-deps` CI job. NOT drift — deleting `bun.lock` would red CI.
  - **Cloudflare config:** kept `wrangler.jsonc` + `@cloudflare/vite-plugin`. Verified the Vercel
    build passes WITHOUT `wrangler.jsonc` and the framework config doesn't statically import the
    plugin, but the plugin is locked in BOTH frozen lockfiles — removing it needs a dual-lockfile
    regen for zero build benefit, and the deploy coupling has a documented 404 failure mode.
    Deferred to a dedicated change gated on a real Vercel preview deploy.
  - **Dead files removed (verified zero-reference; tsc+build green after):** retired marketing landing
    set (Hero, BrandShowcase, Features, FinalCTA, Footer, Analytics, LogoMarquee) + their art;
    `cabana-demo-data.ts` (its only consumer DemoMessages.tsx was deleted this cycle); orphaned images
    (`src/assets/creator-*`/`product-*`, `public/oliviac.jpg`, `public/dani/danibackground.jpg`, the
    whole `public/images/socials/` set).
  - **Naming convention (flagged, not renamed):** `cabana-store.ts` / `cabana-auth.ts` /
    `cabana-roles.ts` embed hooks rather than following the pure/`*-actions`/`use-*` trio;
    `cabana-analytics.ts` (link-in-bio tracker) sits confusingly close to `cabana-creator-analytics.ts`.
- **Phase 3 — docs sync (this commit):** handoff (this block), CLAUDE.md (dropped the deleted
  `cabana-demo-data` reference), and CABANA_PROJECT_STATE / ROUTE_MAP / COMPONENT_MAP / DATABASE /
  TECH_DEBT refreshed to reality.
- **Migrations (committed, NOT applied to cloud — gated):** `20260529000000_post_media_service_grant.sql`
  and `20260530000000_high_qa_fixes.sql` + their behavioral tests, wired into CI/db-validate.
  Validated only by reading + CI's from-zero Docker rebuild — **not run locally (no Docker in this
  sandbox).**
- **Gate (full, this session):** `bunx tsc --noEmit` clean · `bun run lint` **0 errors / 6 expected
  shadcn warnings** · `bun run test` **337/337 (16 files)** · coverage **99.53% stmts / 95.8% branch /
  100% funcs / 100% lines** (≥95%) · `bun run build` green (`.vercel/output`).
- **Still pending approval (do NOT execute without sign-off):** (1) apply
  `supabase/reconcile/03_fix_storage_policies.sql` to cloud (avatar upload broken until then);
  (2) apply migrations `20260529` + `20260530` to cloud + a `supabase migration repair` for cloud
  history; (3) production redeploy (`vercel deploy --prebuilt`); (4) drop the `legacy_reel` schema.
- **Next:** push `main` to origin, confirm CI green (incl. the Docker db-validate job on the two new
  migrations), then work the approval checklist item by item.

## Session update — July 8, 2026 (High-severity QA fixes + `/init` doc audit)

Frontend/docs + additive SQL only; **no cloud Supabase schema or data touched** (cloud
`rpzaeqoqcaxxavltgvpe` untouched). All work remains **uncommitted** on `main` (tip `6c35f5b`),
stacked on the Batch 1 + Batch 2 working set below.

- **High-severity QA fixes (behavioral audit follow-up) — three corrective, additive-only SQL fixes,
  no new tables/columns/enums/RLS/policies:** migration `20260530000000_high_qa_fixes.sql` +
  behavioral test `supabase/tests/high_qa_fixes.sql`.
  - **H5** — `public_creator_profiles.post_count` was hardcoded `0`, so every discovery/search card
    showed a fabricated "0 posts". Replaced with a real count of the creator's **published** posts
    (count-only; the view stays a public projection — no gated content exposed, same shape as the
    existing `follower_count` subquery).
  - **H8** — `create_mock_purchase` guarded idempotency with a bare `select exists` on
    `content_entitlements`, so two concurrent unlocks both passed and each wrote a transaction +
    purchase (double-charge/double-credit; only the entitlement deduped). Added a transaction-scoped
    advisory lock on `(buyer, post)` to serialize the critical section; the existing entitlement
    guard then makes the second call a clean no-op.
  - **H9** — `request_payout` did recalc → read available → check → insert with no serialization, so
    two concurrent requests over-reserved and drove `available_cents` negative. Added a
    transaction-scoped per-creator advisory lock so requests serialize and the second re-reads the
    reduced balance. (Advisory locks release at transaction end — each PostgREST RPC is its own
    transaction — so no unlock/deadlock surface; each function takes a single lock.)
- **Also in the uncommitted set:** `20260529000000_post_media_service_grant.sql` +
  `supabase/tests/post_media_service_grant.sql` (corrective: `grant select on public.post_media to
service_role` — hosted Supabase grants it via platform ACLs but from-zero rebuilds don't, so
  `getPostMediaUrls` failed with `42501` and post images never rendered).
- **`/init` documentation audit:** re-audited `CLAUDE.md` against the tree and corrected three stale
  spots introduced by the Batch 2 IA change + QA fixes: (1) the Phase 11A routing statement now
  reads "the creator business home is the `/dashboard` index; `/dashboard/home` redirects to it;
  legacy `DashHome` moved to `/dashboard/link-in-bio`" and documents the `WelcomeLive` /
  `cabana:justOnboarded` banner (the old text still claimed `DashHome` lived at `/dashboard`);
  (2) migration `20260530000000_high_qa_fixes.sql` appended to the ordered chain with its H5/H8/H9
  summary; (3) `high_qa_fixes.sql` added to the behavioral-tests list. Prettier-clean.
- **⚠️ SQL NOT validated locally this session** — no Docker in this sandbox, so `bun run db:validate`
  did not run. The two new migrations + tests are additive/corrective and rely on **CI's from-zero
  rebuild** for validation. Neither migration has been applied to cloud (gated — do NOT `db push`
  without explicit approval).
- **Gate (this session):** `bunx tsc --noEmit` clean · `bun run lint` **0 errors / 6 expected shadcn
  react-refresh warnings** · `bun run test` **332/332 (16 files)** · `bun run build` green
  (`.vercel/output` emitted, ~5s). Handoff-gate satisfied for the TS layer.
- **Current program state:** July 2026 UI/UX audit polish program — **Batch 1 (Trust & Honesty) DONE,
  Batch 2 (Core UX) DONE, High-severity QA fixes DONE** (all uncommitted). **Next: a fresh read-only
  QA playtest, then the audit chain (UI/UX audit → fix → QA → design-consistency → fix → QA →
  production-readiness), then commit/push/deploy — all gated.** Batch 3 (Accessibility) remains the
  next planned polish batch but is gated on approval. **No new features** until the app is hardened.

## Session update — July 8, 2026 (UI/UX audit → Batch 1 Trust & Honesty + doc sync)

Frontend + docs only; **no Supabase schema or data touched** (cloud untouched; the local Docker
stack was rebuilt from zero for browser verification, then stopped). All work left
**uncommitted** for review alongside the July 7–8 QA bug-fix working set.

- **Read-only UI/UX production-readiness audit** (multi-agent: 21 auditors + adversarial
  verification + coverage critic): 303 raw findings → **249 confirmed** (+6 critic) / 49
  duplicates / 5 refuted. **0 Critical, 9 High, ~116 Medium, ~130 Low**; section scores 5–7.5,
  overall ≈6.5/10 (weakest: links/store/media-kit/settings). Top themes: fake-presented-as-real,
  failures rendering as fake zeros, silent list caps, two auth visual languages, reduced-motion
  ignored, unconfirmed deletes, shared "CABANA" tab titles. The prior QA pass's Critical/High
  fixes were independently re-verified as present in the working tree.
- **Approved batch plan** (Tyler): **1 Trust & Honesty (DONE) → 2 Core UX (DONE) →
  3 Accessibility → 4 Creator Workflow → 5 Design System → 6 Marketing & Polish.** Each batch:
  implement → full gate → stop for approval. **Next: Batch 3 (Accessibility — gated, do not
  start without approval):** MotionConfig reducedMotion, aria labels/pressed on icon-only and
  segmented controls, aria-current fuzzy-match fix, skip link, route-change focus management,
  dialog a11y (ProductDrawer/GlobalNav sheet), touch targets, 14px-input iOS zoom, post-media
  alt text.
- **Batch 2 — Core UX (COMPLETE, verified):** ~30 files across six work streams; browser-tested
  on the local Docker stack (11 scripted Playwright checks incl. volume-seeded load-more flows —
  all pass, zero console errors).
  - **IA:** `/dashboard` is now the real creator business home (WelcomeLive banner extracted to
    `dashboard/WelcomeLive.tsx` and moved there; `/dashboard/home` → redirect). The link-in-bio
    overview (`DashHome`) lives at new **`/dashboard/link-in-bio`** retitled "My Page" (greeting
    hero removed). Sidebar restructured into grouped sections (Creator studio / Link-in-bio /
    Account); **Messages now points at real `/messages`** with a live unread badge
    (`useUnreadMessages`); `/dashboard/messages` → redirect; `DemoMessages.tsx` deleted.
    "Analytics" (→ `/dashboard/performance`) and "Link Analytics" (→ `/dashboard/analytics`,
    h1 "Link analytics") labels un-crossed; QuickActions labels match the sidebar verbatim.
  - **Autosave:** `use-debounced-callback.ts` now FLUSHES pending edits on unmount (was cancel)
    — closing an editor within the 500 ms window saves instead of silently dropping; LinkManager
    UrlField toasts when an invalid URL would be silently discarded at close.
  - **Caps → load-more + disclosure** (RPC server clamps: feed 50, comments/messages 100):
    home feed + creator-profile feed 20→50 ("Load more posts", cap note at 50, filtered header
    count fixed to "{visible} of {total}"); comments 30→100; conversation history 50→100
    ("Load earlier messages", auto-scroll now keys on newest-message id so prepending doesn't
    yank); notifications 50→200; admin ledger 500→1000 with an explicit "window" disclosure on
    totals/CSV (+CSV title). Deeper cursor pagination documented as follow-up, not built.
  - **Retry + defaults:** `QueryClient` now `retry: 1, staleTime: 30s` (kills ~15 s failure
    spinners); `QueryErrorState` retries wired into ConversationListPane, ConversationView,
    CommentList, LedgerExplorer, FinanceOverview, PayoutQueue, ReportQueue, AuditLogTable;
    `usePost` `retry: false` + PostDetail error state gains Retry with honest copy.
  - **Onboarding resilience:** client auth guard (guest → `/login?redirect=/onboarding`);
    URL-backed step (`?step=`, browser Back walks steps, refresh resumes via persisted
    max-step); link drafts + look choices mirrored to sessionStorage (cleared on success);
    `goLive` collects mutation results — partial failure keeps the user on Preview with an
    inline error and no false celebration (created drafts tracked so retry can't duplicate
    links); Preview retitled "Here's your page"; avatar picker toasts rejections and reverts
    the preview on failed upload.
- **Batch 1 — Trust & Honesty (COMPLETE, verified):** 17 files + 1 new component; `+~360/−~115`.
  - `MediaKit.tsx`: hero bound to the real `useCabana()` profile (branded-initial fallback —
    never a stock stranger photo); amber "Sample data — demo preview" pill + "· sample" section
    markers + honest deck caption (sample metric arrays remain, now labeled).
  - `SettingsPanel.tsx`: fake connection states removed — Stripe rests as "After payments
    launch", others "Coming soon", socials "Not linked"; `@aurora` handles + "SSL active • CDN
    enabled" badge deleted; domain input derives from the real handle; honest subtitle +
    "custom domains coming soon" caption.
  - `routes/admin.tsx`: hub-wide amber demo pill on every tab; all 8 tab subtitles demo-labeled;
    fake TopBar search/bell removed; every handler-less control disabled with
    `title="Demo preview — not functional"`; sidebar "99.99% uptime" → "Sample status — not
    monitoring"; 5-card real-tools grid (Reports · Audit · Finance · Ledger · Payouts) promoted
    onto Overview; `/admin/payouts` card added to the Payouts tab.
  - Aurora fallbacks removed from both "Preview public page" affordances (`Sidebar.tsx`,
    `ProfileEditor.tsx` — disabled "Set your handle first" state instead; `rel` added);
    `/td` fake Follow replaced with a real "Follow on Instagram" link; orphaned
    `src/assets/aurora-hero.jpg` deleted.
  - **NEW `src/components/cabana/QueryErrorState.tsx`** + error/loading honesty across
    `BalanceCard` (skeletons while loading, error+Retry, no $0.00 masking),
    `HistoryCard`/Transaction/Tip/Purchase/PayoutHistory, `SubscribersDashboard`, `LinkManager`,
    `StoreManager`, legacy `AnalyticsPage`, and `DashHome` (events stats + traffic chart).
    Convention recorded in `CLAUDE.md`: failed queries must never render fake business data.
  - `LinkManager` copy: "Schedule for later" promise removed; field relabeled
    "Note shown on this link (optional)".
- **Final verification pass** (Tyler-requested): all seven trust areas re-audited; 7 residual
  issues found and fixed (Settings resting-state pills were inverted; 4 admin subtitles still
  cited fake numbers as live; `DashHome` zeros-on-error; per-section sample labels; copy).
  Repo-wide sweeps: `?? []`/`?? 0` patterns classified (none render fake business data on error);
  aurora references classified (seed/tests/demo fixtures/orphaned Hero.tsx/signup placeholder —
  all intentional). **Authenticated Playwright walkthrough** on the local Docker stack
  (`supabase db reset` from all 19 migrations + seed; throwaway admin-creator; Media Kit,
  Settings, Earnings, DashHome, Admin Overview + Users driven with zero console errors;
  screenshots in the session scratchpad). Teardown: `.env.local` restored byte-identical,
  test user deleted, stack stopped.
- **Doc sync (this session):** `CLAUDE.md` (QueryErrorState + demo-labeling conventions;
  Vercel/backend topology was already updated July 8), this handoff, `CABANA_TECH_DEBT.md`
  (false "no test runner"/"no git" rows resolved; UI/UX polish program register added),
  `CABANA_ROUTE_MAP.md` + `CABANA_COMPONENT_MAP.md` refreshed against the real tree,
  `CABANA_PROJECT_STATE.md` checkpoint re-stamped (main @ `6c35f5b` + uncommitted working set).
  Note: `docs/TECH_DEBT.md` / `docs/M8_RECOMMENDATIONS.md` do not exist in this repo — the
  register is `CABANA_TECH_DEBT.md`.
- **Gate:** `bunx tsc --noEmit` clean · `bun run lint` 0 errors (6 expected shadcn warnings) ·
  `bun run test` **332/332** · `bun run build` green (Vercel output). `db:validate` not required
  (no SQL changes); the local from-zero rebuild ran green incidentally during browser setup.

## Session update — July 7, 2026 (home/login card redesign + lint fix)

UI/tooling-only session; **no Supabase schema or data touched**, no phase work.

- **Home + login card redesigned to mirror the `~/cabanamgmt` home hero** (per Tyler's request):
  `src/components/cabana/auth/LoginCard.tsx` rewritten — full-screen black-marble backdrop
  (`public/td-studios-black-marble.jpg`), glass card (`rounded-[32px]`, `bg-black/30`,
  `backdrop-blur-lg`), holographic logo (`public/cabana-logo.png`, hi-res copy from cabanamgmt),
  Username (email) + Password (eye toggle) fields, gradient divider, **Admin/VIP Access Code field
  (visual only — no redeem backend here; value is ignored)**, chrome "ENTER" pill button, and a
  "Request Access" link → `/signup`. Sign-in still goes through `cabanaAuth.login` with the
  `?redirect=` param preserved; sonner toasts on error/success. The Cabana script + "Management
  Group" wordmark were added then removed at Tyler's request. `AuthShell` untouched (still used by
  signup/forgot-password). Routes `/` and `/login` share `LoginCard` as before.
- **Lint unblocked:** `bun run lint` was failing with ~36k errors because ESLint/Prettier were
  scanning the generated `.vercel` + `.tanstack` build output (new since the Vercel/Nitro deploy
  preset). Added `.vercel`, `.tanstack`, `.nitro`, `.wrangler` to `eslint.config.js` ignores and
  `.prettierignore`, then auto-fixed 17 real Prettier errors in `src`.
- **Google OAuth login:** `cabanaAuth.loginWithGoogle()` (`cabana-auth.ts`) calls
  `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo:
`${origin}/auth/callback` } })`. `LoginCard` now shows a "Continue with Google" button (with
  loading + inline error states) above the email/password+VIP form, which sits under an
  "Admin access" separator. New route `src/routes/auth.callback.tsx` (`noindex`) waits for the
  session (detectSessionInUrl consumes the redirect tokens; 10s timeout → visible error + back
  link), then routes: member → `/account`, user created <5 min ago (no persisted
  onboarding-completion flag exists, so recency = first OAuth sign-in) → `/onboarding`, else →
  `/dashboard`. Email/password + signup flows untouched. **Ops prerequisite:** enable the Google
  provider in Supabase Auth settings and allowlist `<site-origin>/auth/callback` as a redirect
  URL — until then the button surfaces "provider is not enabled" in its error state.
- **Canonical backend repoint + production deploy:** root-caused the "Unsupported provider:
  provider is not enabled" OAuth error — the app pointed at local Docker Supabase (and the old
  prod bundle had `127.0.0.1:54321` baked in), while Google was enabled on a different project.
  Per Tyler: **canonical backend is now `rpzaeqoqcaxxavltgvpe` ("cabanadatabase")**. `.env`
  repointed (local-stack values kept commented); Vercel env vars set via CLI for
  production/preview/development (publishable values only — `SUPABASE_SERVICE_ROLE_KEY`
  intentionally NOT uploaded; add manually if an admin path needs it); rebuilt + deployed
  prebuilt to production. Click-tested with a real browser on BOTH `localhost:8080` and
  `https://cabanagrp.com/login`: button → cloud `/auth/v1/authorize` → 302 → Google sign-in page
  with the correct `redirect_to` carried through. The Google-account leg needs a human login to
  complete. **⚠️ Schema gap:** cabanadatabase carries the cabanamgmt schema — `profiles` has no
  `account_type`, and none of this repo's migrations exist there. Auth works; the CABANA data
  layer against that DB does not. Schema reconciliation is a gated decision (do NOT `db push`
  without explicit approval). `supabase/config.toml` project_id still references the old
  `dwnricswfskypqqfknnh` — left untouched so local db workflows are unaffected.
- **Cloud schema reconciliation APPLIED (rpzaeqoqcaxxavltgvpe):** the empty Reel/compliance
  scaffold that was on cabanadatabase has been replaced with CABANA. Audited (read-only), planned,
  dry-run on local Docker (incl. a guard-abort test), then applied to cloud via the Management API
  (backup → `01_pre_migrations_reset` → 16 migrations → `02_post_migrations_backfill`; all in
  `supabase/reconcile/`, with a full backup in `supabase/reconcile/backups/`). Cloud now: 35 CABANA
  tables, 20 enums, 62 functions, 86 policies, all RLS-enabled; admin user backfilled
  (account_type=creator, roles {admin,user}, handle `tylerdiorio`); Google OAuth verified live
  end-to-end. `src/integrations/supabase/types.ts` regenerated (added current RPC signatures).
  **`legacy_reel.profiles` (preserved scaffold admin row) intentionally kept** pending a final real
  Google sign-in; drop with `drop schema legacy_reel cascade;` once confirmed. NOTE:
  `supabase/config.toml` project_id still says the old `dwnricswfskypqqfknnh` (local db tooling
  only; untouched).
- **Post-reconciliation live-testing fixes (July 7, uncommitted; gate green, NOT yet deployed):**
  Tyler signed in with Google against the reconciled cloud DB and hit three issues:
  1. **Avatar upload failed** — `app_private.current_profile_id()` (a leftover scaffold storage
     policy on the `avatars` bucket) reads `public.profiles.auth_user_id`, a column CABANA doesn't
     have, so planning the storage INSERT errored. Root cause: `01` originally KEPT scaffold storage
     policies; the local dry-run masked it by dropping all storage policies at clean-slate. Fix:
     `01_pre_migrations_reset.sql` corrected to drop all scaffold storage policies; corrective
     `supabase/reconcile/03_fix_storage_policies.sql` drops every non-CABANA storage.objects policy
     on the already-migrated cloud. **Blocked pending Tyler's approval (destructive cloud change).**
  2. **Realtime crash** (`cannot add postgres_changes callbacks … after subscribe()`) — the
     notifications + messaging realtime hooks shared a channel topic across multiple hook instances
     (list + badge). Fixed in `use-notifications.ts` / `use-messaging.ts` with a per-instance unique
     channel topic (`useRef` + module counter).
  3. **Onboarding** — removed the "04 — Define" step and the entire "Generate with AI" flow
     (Define/Generate steps + AISetup/Generating/Field components); STEPS is now Welcome · Identity ·
     Theme · Connect · Preview (Preview retagged "04 — Preview"). `onboarding.tsx`.
     Fixes 2 & 3 need a **production redeploy** (built, `.vercel/output` ready) — also blocked pending
     Tyler's authorization. Fix 1 is a cloud-SQL change (no redeploy).
- **Profile-first onboarding + customization fields (July 7, uncommitted):** rewrote
  `/onboarding` into a profile-first builder — Identity (avatar · display name · username ·
  headline · bio) → Links (real manual inputs for Instagram/TikTok/YouTube/X/Website/Store/Email/
  Phone + custom; no fake "Connect") → Look (theme preset · accent color · button style) →
  Preview (real, from entered data; empty-state when no links; no fake VIP/Drop buttons) → dashboard
  "Your CABANA is live" continuation banner. Light copy throughout; mobile-first (safe-area sticky
  footer, 16px inputs). Removed the old empire/decorative welcome + category picker + AI generation.
- **Two migrations applied to cloud + local (approved):**
  `20260527000000_profiles_select_grant.sql` (fixes the pre-existing dashboard "Securing your
  studio…" hang — authenticated `profiles` own-read was 403 for lack of a grant) and
  `20260528000000_profile_customization.sql` (`creator_profiles.headline`/`accent_color`/
  `button_style`, defaulted so older profiles keep working). Wired through `cabana-store`
  (types/mapper/`setProfile`), onboarding, `$username` public page, `DashHome`, and `ProfileEditor`
  (edit later). Types regenerated; behavioral test `supabase/tests/profile_customization.sql` added
  - wired into `db-validate.sh`. New link icons `mail`/`phone`/`x` + a batch `createLinks` mutation.
- **Verified end-to-end on local** (mobile viewport, DB-confirmed): identity/headline/theme/accent/
  button/links all persist (e.g. `headline='Photographer & Visual Artist'`, `accent_color='#f9a8d4'`,
  `button_style='pill'`, `theme='rose'`); preview + public page render headline (accent-colored),
  accent, pill buttons; grant fix confirmed (authenticated own-read 200, anon 401). No cloud test
  data — used throwaway local users (deleted) and restored `.env`. `legacy_reel` NOT dropped.
- **Deployed to production** (`cabanagrp.com`, prebuilt, cloud-pointed bundle). Post-deploy verified:
  login chunk + "Continue with Google" served; Google sign-in 302 → accounts.google.com (live
  browser); deployed onboarding chunk contains the new flow ("Create your CABANA" / "Add your first
  links" / "Pick a look" / "Accent color" / "Button style" / "Headline"); public-page chunk carries
  `accentColor`/`headline`. Dashboard grant fix is DB-side (applied to cloud, functionally verified
  on local) — final signed-in confirmation is Tyler's.
- **Gate:** lint 0 errors (6 expected shadcn react-refresh warnings) · `tsc --noEmit` clean ·
  332/332 tests pass · `bun run build` succeeds. Changes left uncommitted alongside Tyler's staged
  `thetejeda` work.

## Latest Status — Phase 11B COMPLETE (Creator Analytics)

Built on Phase 11A. Extends the creator dashboard with revenue / subscriber / content / engagement
analytics over **existing data**. One small additive migration was genuinely necessary (see below);
revenue and subscriber analytics needed no schema change.

- **Migration** `20260524000000_creator_analytics.sql` (additive — ONE function, no table/column/
  enum/RLS/trigger change): the SECURITY DEFINER, creator-scoped `creator_content_analytics(_limit)`
  RPC returns the CALLER'S OWN posts with like / comment / save totals. It exists because `post_likes`
  and `post_saves` are private under RLS (only the actor reads their own row), so a creator cannot
  aggregate likes/saves on their own posts through the base tables — and the spec requires "most
  saved posts" / saves KPIs. It exposes only aggregate counts (never who liked/saved), privacy-
  consistent with `post_engagement_state`. Granted to `authenticated`; `anon`/`public` revoked.
  Mirrored in generated `types.ts`; smoke asserts the function; behavioral test
  `supabase/tests/creator_analytics.sql` (own-posts + correct counts, visible-comments-only,
  creator↔creator isolation, anon denial) wired into `db-validate.sh` + CI.
- **Pure module** `src/lib/cabana-creator-analytics.ts` (in the 95% gate; **named with the `creator-`
  prefix because `cabana-analytics.ts` already exists — it is the link-in-bio event tracker**):
  UTC-deterministic `revenueDailySeries`/`revenueMonthlySeries`/`revenueTotalCents`/`seriesTrend`,
  `subscriberStats`/`subscriberGrowthSeries`, `rankPosts`/`engagementTotals`/`engagementRatePerPost`/
  `buildEngagementKpis`, range helpers, and the `buildCreatorAnalytics` assembler. Reuses the ledger
  settled-net rule (succeeded adds net, refund subtracts) without re-deriving fees/balances
  (`cabana-money`/`cabana-finance`/`cabana-dashboard` still own those).
- **Server action** `analytics-actions.ts`: one thin RLS-scoped GET `getCreatorAnalytics` (caller's
  RLS, never service role) gathering transactions + the creator's `creator_subscriptions` rows +
  `creator_content_analytics` posts. **Hook** `use-analytics.ts`: `useCreatorAnalytics` fetches the
  bundle ONCE; the page applies the date range through the pure pipeline (no re-fetch on range change).
- **UI** `src/components/cabana/dashboard/analytics/` (recharts — already a dependency):
  `AnalyticsDashboard` (loading / empty / error), `DateRangeFilter` (7d/30d/90d/all), `RevenueAnalytics`
  (daily area + 12-month bars + trend), `SubscriberAnalytics` (growth line + active/new/canceled),
  `ContentAnalytics` (top liked/commented/saved), `EngagementSummary` (likes/comments/saves/rate KPIs).
- **Route + nav:** new **`/dashboard/performance`** ("Performance", `LineChart` icon, after Earnings).
  **Additive** — the legacy link-in-bio `/dashboard/analytics` (page-view/click analytics) is untouched
  per the no-replace-routes constraint, hence the distinct name. The Phase 11A QuickActions "Analytics"
  card now points here (the prior "Coming soon" placeholder).

**Out of scope (deferred):** audience insights / demographics / geography / devices / exports /
reports / goals / milestones (11C/11D), notification providers (9C).

**Verification:** lint clean (pre-existing shadcn warnings only), `tsc` clean, build green (emits the
`dashboard.performance` chunk), **332 unit tests pass** at 99.52% stmts / 95.75% branch / 100% funcs /
100% lines (≥95% gate; both analytics modules at 100%). `bun run db:validate` needs Docker (not in this
sandbox) — CI's from-zero rebuild runs the new `creator_analytics.sql` + smoke assertions.

**Next:** Phase 11C — Audience insights (gated; do not start without approval).

---

## Previous Status — Phase 11A COMPLETE (Creator Dashboard Foundation)

Built on everything through Phase 10B. **Frontend + read-only aggregation only — NO schema change,
no new migration, no DB write path.** A production-quality creator business dashboard that reuses the
existing finance (Phase 6/8C), subscription (Phase 4), and notification (Phase 7/9) infrastructure;
nothing is re-derived.

- **Pure module** `src/lib/cabana-dashboard.ts` (added to the 95% coverage gate): repository-injected
  aggregation that turns RLS-scoped creator data into the dashboard view model — `monthlyRevenueCents`,
  `summarizePendingPayouts`, `buildRecentEarnings`, `summarizeSubscribers` (active/total/new + growth),
  `buildRecentActivity`, `buildKpiCards`, and the `buildCreatorDashboard` assembler. Reuses
  `cabana-money` (balance is derived there, surfaced by `creator_balance`; we only read its fields),
  `cabana-finance` (`transactionTypeLabel`), and `cabana-notifications` (`mapNotification` /
  `resolveNotificationTarget`). KPIs: total + monthly revenue, available balance, pending payouts,
  active/total/new subscribers. Money stays integer cents; everything labeled **Demo Mode**.
- **Server action** `src/lib/dashboard-actions.ts`: one thin RLS-scoped GET `getCreatorDashboard`
  (`attachSupabaseToken` + `requireSupabaseAuth`, caller's RLS, never service role). Gathers the
  creator's own balance (RPC `creator_balance`), `transactions`, `payouts`, `creator_subscriptions`
  rows + `creator_subscribers_list` identities, and recent `notifications`, all in parallel; returns
  empty/zeroed collections for accounts with no creator profile or no activity (renders empty state,
  never errors). **Hook** `src/lib/use-dashboard.ts`: `useCreatorDashboard` maps the bundle through
  the pure aggregator at fetch time.
- **UI** `src/components/cabana/dashboard/overview/`: `CreatorDashboard` (page with loading / empty /
  error states), `KpiCards` (+skeleton), `RevenueSummary`, `SubscriberSummary`, `RecentActivity`,
  `QuickActions` (create post / subscriptions / payouts / analytics-placeholder / settings). Uses the
  existing glass/iridescent/`btn-ghost` design system and `date-fns` relative times.
- **Route + nav:** new **`/dashboard/home`** (`src/routes/dashboard.home.tsx`, noindex), added as the
  first sidebar item ("Home", `Gauge` icon) in `Sidebar.tsx`. **Additive on purpose** — the existing
  `/dashboard` "Overview" (link-in-bio `DashHome` analytics) is untouched to respect the
  "do not remove/replace existing routes" constraint. Recommend promoting `/dashboard/home` to the
  `/dashboard` index in a follow-up once reviewed.

**Out of scope (deferred, per Phase 11 plan):** analytics charts (11B), audience insights (11C),
business tools (11D), notification providers (9C), messaging/discovery/AI work.

**Verification:** `bun run lint` clean (only pre-existing shadcn react-refresh warnings), `bunx tsc
--noEmit` clean, `bun run build` green (emits the `dashboard.home` chunk), **308 unit tests pass** at
99.66% stmts / 95.96% branch / 100% funcs / 100% lines (≥95% gate; `cabana-dashboard` at 100%). No
schema touched, so `bun run db:validate` is not required this phase.

**Next:** Phase 11B — Analytics charts (gated; do not start without approval).

---

## Previous Status — Phase 9A COMPLETE (Notification Delivery Engine)

Built on Phase 8C. Local Docker only; remote/push/deploy untouched. **Backend only — NO UI and NO
email/push/SMS providers** (providers are Phase 9C). Activates the previously-inert Phase 7
`notification_outbox` with a worker-safe processor, retry/backoff scheduling, dead-lettering, and
queue monitoring — reuse-first, with the smallest possible schema change.

- **Reuse, no table change:** the outbox already had `attempts`, `last_error`, `scheduled_for`,
  `processed_at`, the `(status, scheduled_for)` index, and the `outbox_status` enum
  (`pending`/`sent`/`failed`/`skipped`/`canceled`). A retry stays `pending` (`attempts++`, future
  `scheduled_for`); a dead-letter is terminal `failed`. No table/column/enum/RLS change.
- **Migration** `20260523000000_notification_engine.sql` (additive — ONE function): the SECURITY
  DEFINER, admin-gated `process_notification_outbox(_batch_size, _max_attempts, _result)`. It claims
  due `pending` rows with `FOR UPDATE SKIP LOCKED` (concurrency-safe, idempotent — only `pending`
  rows are touched, so no double-delivery), applies the outcome, recomputes nothing else, and returns
  a jsonb `{processed, delivered, retried, dead_lettered}`. A function is required because the atomic
  claim can't be expressed via the client query builder.
- **No-provider seam:** with no transport yet, `_result` SIMULATES the delivery outcome so the
  retry/dead-letter machinery is real and testable — `delivered` → `sent`; `transient_failure` →
  retry with exponential backoff (60s·2^(n−1), capped 1h) until `_max_attempts`, then dead-letter;
  `permanent_failure` → immediate dead-letter. Default `delivered` drains/activates the queue. Phase
  9C replaces the simulation with real per-channel provider calls.
- **Pure** `cabana-notification-engine.ts` (in the 95% gate): `resolveOutboxOutcome` (mirrored
  verbatim by the RPC), `computeBackoffSeconds`/`nextRetryAt`, `isDue`/`selectDueBatch`,
  `summarizeOutbox`, mappers, labels. **Server actions** `notification-engine-actions.ts`:
  `processOutbox` (RPC bridge) + `getOutboxStats` (admin-RLS queue snapshot). No UI/hooks this phase.
- **Tests:** `cabana-notification-engine` unit tests (261 total, ≥95%); behavioral
  `supabase/tests/notification_engine.sql` (deliver, idempotency, transient retry + backoff
  scheduling, dead-letter at cap, permanent dead-letter, batch limit, invalid-arg + non-admin + anon
  denial); `smoke.sql` asserts the new function; `db-validate.sh` + CI run the suite.

**Verification:** lint clean (pre-existing shadcn warnings only), `tsc` clean, build green, **261
unit tests pass** at ≥95%. `bun run db:validate` needs Docker (not in this sandbox) — CI runs the
from-zero rebuild + all SQL suites (incl. `notification_engine.sql`).

**Next:** Phase 9B — User Notification Center (in-app list, read/unread, badge counts, preferences UI)
over the Phase 7 read surface; then Phase 9C — Provider Integrations (email/push abstractions + real
delivery, replacing the `_result` simulation). Gated; do not start without approval.

---

## Previous Status — Phase 8C COMPLETE (Admin Finance & Operations)

Built on Phase 8B over the Phase 6 ledger. Local Docker only; remote/push/deploy untouched.
Admin-only finance back office, delivered as two reviewable slices.

- **8C.1 (read-only, no schema change):** finance overview (platform revenue, creator earnings,
  payout-status rollups), a filterable/searchable ledger explorer with CSV export, and a
  transaction detail page. Reuses the existing Phase 6 admin RLS (`is_current_user_admin`) on
  `transactions`/`payouts`/`creator_balances` — server actions just drop the creator filter.
  Pure `cabana-finance.ts` (aggregation/CSV/labels, in the 95% gate), plus
  `admin-finance-actions.ts` and `use-admin-finance.ts`; UI under
  `components/cabana/admin-finance/` behind an admin-only `AdminGate`; routes `/admin/finance`,
  `/admin/ledger`, `/admin/ledger/$transactionId`.
- **8C.2 (payout workflow):** the admin payout queue at `/admin/payouts`. Additive migration
  `20260522000000_admin_payouts.sql`: one enum value `payout_request_status.on_hold`, an AFTER
  UPDATE trigger `on_payout_request_change_audit` writing to the **existing** `audit_logs`
  (target_type `payout_request` — no second audit system), and the SECURITY DEFINER admin-gated,
  transition-validated `admin_review_payout(_payout_request_id, _action, _note)` RPC. Pure state
  machine `cabana-payouts.ts` (in the 95% gate) is mirrored verbatim by the RPC.
- **Payout actions:** `approve` (→approved), `reject` (→rejected), `hold` (→on_hold),
  `release` (→requested), `mark_paid` (→paid). **`approve` and `mark_paid` are intentionally
  distinct steps: `approve` AUTHORIZES (the linked disbursement stays `processing`/reserved);
  `mark_paid` SETTLES (disbursement → `paid`, books paid-out). Future work must not collapse the
  two into a single action.** A hold keeps the payout reserved, so no `payout_status` or
  `recalc_creator_balance` change was needed. Every decision recomputes the balance + writes audit.
- **Tests:** `cabana-finance` + `cabana-payouts` unit tests (248 total, ≥95%); behavioral
  `supabase/tests/admin_payouts.sql` (state machine, invalid-transition rejection, disbursement
  follow, balance reserve→paid-out / release-on-reject, audit rows, non-admin + anon denial);
  `smoke.sql` asserts the new enum value / RPC / trigger; `db-validate.sh` + CI run the suite; seed
  gains two demo payout requests.

**Verification:** lint clean (pre-existing shadcn warnings only), `tsc` clean, build green, **248
unit tests pass** at ≥95%. `bun run db:validate` requires Docker (not in this sandbox) — CI runs the
from-zero rebuild + all SQL suites (incl. `admin_payouts.sql`).

**Next:** Phase 9 — Notification System (outbox processor + retry/delivery logging + provider
abstractions over the inert Phase 7 `notification_outbox`). Gated; do not start without approval.

---

## Previous Status — Phase 8B COMPLETE (Member Reporting UI)

Built on Phase 8 (Slice 1). Local Docker only; remote/push/deploy untouched. Member-facing
reporting wired across the app **on top of the existing moderation backend** — the `reports`
table, its INSERT RLS, `validateReportInput`, the `createReport` server action, and the staff
queue/audit trail are all unchanged and reused. No new business logic; no table/RLS/policy/trigger
change. The only schema change is an **additive, backward-compatible enum extension**.

- **Migration** `20260521000000_report_reasons.sql`: appends `hate` + `sexual_content` to the
  `report_reason` enum via `ALTER TYPE … ADD VALUE IF NOT EXISTS` (idempotent; rebuilds from zero).
  `sexual_content` is a **safety report category**, not adult-content functionality. Mirrored in the
  generated types, `cabana-moderation.ts` (`REPORT_REASONS` now 8, selector-ordered; `REASON_LABELS`
  adds Hate/Sexual Content and relabels `scam` → "Scam/Fraud"), and unit tests. Validation is
  membership-only, so DB enum order (appended) and TS selector order differ harmlessly.
- **Reusable UI** `src/components/cabana/reporting/`: `ReportButton` (drop-in trigger; hidden for
  signed-out viewers since reporting needs an authenticated reporter, and for the viewer's own
  content), `ReportDialog` (polymorphic over subject type; idle/submitting/success/error states via
  `useCreateReport`), `ReportReasonSelect` (radio list from `REPORT_REASONS`). No duplicated rules.
- **Surfaces wired** (subject type → id): posts (`post` → `postId`, on `PostCard`/`PostDetail`, hidden
  when locked or own), comments (`comment` → comment id, non-own only in `CommentList`), creator
  profiles (`creator` → creator_profile id on `/$username`, hidden when self), direct messages
  (`message` → message id, non-own/non-deleted in `MessageBubble`).
- **Tests**: `cabana-moderation.test.ts` extended (new reasons accepted, labels, full reason-set
  coverage). `supabase/tests/smoke.sql` asserts the two new enum values exist; `admin_moderation.sql`
  asserts a member can file `hate`/`sexual_content` reports under INSERT RLS.

**Local verification:** lint clean (only the pre-existing shadcn react-refresh warnings), `tsc`
clean, production build green, **221 unit tests pass** at 100% lines / 98.55% branch (≥95% gate).
`bun run db:validate` requires Docker (not available in this sandbox) — CI runs the from-zero rebuild

- all SQL suites (incl. the new enum assertions) on a Docker-enabled runner.

**Next:** member-profile reporting (the reusable `ReportButton` already supports `subjectType="user"`;
deferred only because no current surface exposes another member's profile id — the DM header and the
`public_member_profiles` projection are intentionally ID-free); Phase 8C+ remaining slices (admin
finance subroutes, notification outbox processor + real email/push provider, full `admin.tsx`
migration). Remote schema reconciliation + the `subscriptions`→`platform_subscriptions` rename remain
deferred. Do not start without approval.

---

## Previous Status — Phase 8 (Slice 1) COMPLETE (Admin Moderation & Audit Foundation)

Built on Phase 7. Local Docker only; remote/push/deploy untouched. **Staff (admin/moderator)
only.** This is the trust & operations foundation: a real, RLS-enforced moderation queue and an
append-only audit trail. **NOT in scope this slice:** admin finance views, payout approval,
notification outbox/delivery, email/push providers, and member-facing "Report" buttons across the
app (the report INSERT path exists and is RLS-correct so those wire in later with no schema change).

- **Migration** `20260520000000_admin_moderation.sql`: enums `report_subject_type`, `report_reason`,
  `report_status`, `audit_actor_role`. Tables `reports` (reporter creates/reads own; staff read +
  triage; polymorphic `subject_type`/`subject_id`, not FK-constrained so reports survive subject
  deletion) and `audit_logs` (append-only via a BEFORE UPDATE/DELETE `prevent_audit_mutation` trigger
  permitting only FK-null cascades; no client write grant). Helpers `is_current_user_staff()` (admin
  OR moderator; wraps the authenticated-revoked `has_role`) + `current_audit_actor_role()`. **Audit
  generation is at the DB layer**: an AFTER UPDATE trigger `on_report_change_audit` appends an
  immutable audit row on every report status/assignment change — atomic + uniform across write paths
  (the Phase 7 pattern). No new RPCs: staff triage via a staff-only UPDATE policy column-scoped to
  `status`/`assigned_admin_user_id`/`resolution`.
- **RLS:** reporters read their own reports + create their own; staff read all reports + the audit log
  and update reports; `audit_logs` is staff-read-only and never client-written; anon fully revoked on
  both tables.
- **Pure module** `cabana-moderation.ts` (+ tests, in the 95% coverage set): `validateReportInput`,
  `normalizeResolution`, the `canTransitionReport`/`allowedTransitions` status state machine,
  `mapReport`/`mapAuditLog`, queue helpers (`countReportsByStatus`, `sortReportsForQueue`,
  `filterReportsByStatus`, `countActiveReports`), display labels, and `buildAuditEntry` (mirrors the
  SQL trigger). Added to the vitest coverage include list.
- **Server actions** `moderation-actions.ts`: getReports, getReportDetail, getAuditLogs, createReport,
  assignReport, updateReportStatus (transition-validated). **Hooks** `use-moderation.ts`: useReports,
  useReportDetail, useAuditLogs, useAssignReport, useUpdateReportStatus, useCreateReport.
- **UI**: `components/cabana/moderation/` — `StaffGate`, `ModerationShell`, `ReportQueue`,
  `ReportRow`, `ReportStatusBadge`, `ReportDetail`, `ModerationActionDialog`, `AuditLogTable`. New
  URL-backed subroutes `/admin/reports` + `/admin/audit` (noindex). The existing `admin.tsx` demo tabs
  are untouched except for two nav cards in the Flagged tab linking to the live routes.
- **Tests**: `supabase/tests/admin_moderation.sql` (report create under reporter RLS, reporter/staff/
  stranger read isolation, forged-report denial, staff triage → 3 audit rows, moderator-is-staff,
  non-staff update no-op, audit immutability UPDATE/DELETE blocked, anon denial). `smoke.sql` extended
  (tables, enums, `is_current_user_staff`, trigger, RLS, anon/audit-write denial); `db-validate.sh` +
  CI run the new suite. Seed adds a demo member + two demo reports so `/admin/reports` renders locally.

**Local verification:** lint clean (only pre-existing shadcn react-refresh warnings), `tsc` clean,
production build green, **219 unit tests pass** at ≥95% (moderation module ~100%). `bun run db:validate`
requires Docker (not available in this sandbox) — CI runs the from-zero rebuild + all **ten** SQL
suites on a Docker-enabled runner.

**Next:** Phase 8 remaining slices (gated) — member-facing report buttons on post/comment/message/
profile surfaces; admin finance subroutes (read-only ledger views + payout approval over the Phase 6
tables); notification outbox processor + a real email/push provider (constraint currently forbids);
optional full migration of the legacy `admin.tsx` demo tabs to URL-backed subroutes. Remote schema
reconciliation + the `subscriptions`→`platform_subscriptions` rename remain deferred. Do not start
without approval.

---

## Previous Status — Phase 7 COMPLETE (Notifications & Activity Foundation)

Built on Phase 6. Local Docker only; remote/push/deploy untouched. **Internal only — NO email/push
provider** (no Resend, Firebase, Expo, web push). This is the in-app event/outbox foundation; the
`notification_outbox` is an inert future-delivery queue.

**Scope delivered:** in-app notifications, unread badges, a canonical activity log, per-user
preferences, an inert outbox, and live Realtime delivery. Event generation is implemented at the
**database trigger layer** (safest, atomic, uniform across direct-insert + RPC write paths) — no
Phase 2–6 action files were modified.

- **Migration** `20260519000000_notifications_activity.sql`: enums `notification_type`, `activity_type`,
  `notification_channel`, `outbox_status`. Tables `notifications` (system-written; `dedupe_key` NOT NULL
  UNIQUE → idempotent generation; clients flip only `read_at`), `activity_events` (append-only canonical
  log + `metadata` jsonb), `notification_preferences` (in-app default on; email/push placeholders off),
  `notification_outbox` (inert; admin-only). Helper `emit_notification` (SECURITY DEFINER: logs activity,
  inserts an idempotent notification when the recipient is eligible — not self, not blocked, in-app on —
  and one outbox row per enabled future channel) + `notif_display_name` / `notif_is_blocked`. AFTER INSERT
  triggers on `follows`, `post_likes`, `post_comments` (visible only), `post_saves`, `creator_subscriptions`,
  `tips`, `purchases`, `messages` (per recipient participant; skips system/deleted), `payout_requests`
  (activity + self-notification). `notifications` added to the `supabase_realtime` publication.
- **RLS:** users read only their own notifications/activity and manage only their own preferences; updates
  are column-scoped to `read_at`; `notification_outbox` is admin-only (`is_current_user_admin`); anon fully
  revoked; no client INSERT/DELETE on notifications.
- **Pure module** `cabana-notifications.ts` (+ tests, ~100%): `mapNotification`/`mapActivityEvent`/
  `mapPreferences`, `formatNotification`, `activityLabel`, `countUnread`, `groupNotificationsByDay`,
  `evaluatePreference`, `isOutboxEligible`, `notificationDedupeKey` (mirrors the SQL key scheme). Added to
  the vitest coverage include list.
- **Server actions** `notification-actions.ts`: getNotifications, getUnreadNotificationCount,
  getActivityFeed, getNotificationPreferences, markNotificationRead, markAllNotificationsRead,
  updateNotificationPreferences. **Hooks** `use-notifications.ts` with a recipient-filtered Realtime channel
  (live list + unread; safe unmount cleanup).
- **UI**: `components/cabana/notifications/` — NotificationsCenter (grouped, mark-read/mark-all),
  NotificationBadge (live, in the sidebar), ActivityFeed, NotificationSettings, NotificationsDashboard
  (real `/dashboard/notifications`, replaced the demo), MemberNotificationsPage (auth-gated `/notifications`).
- **Tests**: `supabase/tests/notifications.sql` (event generation from follow/like/comment/message/payout,
  unread, mark-read + mark-all under RLS, preferences, outbox creation, idempotency/no-duplicate,
  self-suppression, recipient isolation, outbox admin-only, anon denial). `smoke.sql` extended; `db-validate.sh`
  - CI run it.

**Local verification:** from-zero rebuild applies; all **nine** SQL suites pass via the DB container;
200 unit tests pass at ≥95% (notifications module ~100%); lint / tsc / build green.

**Next:** Phase 8+ (gated) — outbox processor + a real email/push provider (Resend/Firebase/Expo/web push),
notification batching/digests, admin moderation/finance subroutes, reports/audit logs. Remote schema
reconciliation + the `subscriptions` rename remain deferred. Do not start without approval.

---

## Previous Status — Phase 6 COMPLETE (Monetization Ledger Foundation)

Built on Phase 5. Local Docker only; remote/push/deploy untouched. **DEMO ONLY — no payment
processor, Stripe, cards, webhooks, KYC, or real payouts.** Every financial event is written by a
SECURITY DEFINER RPC with integer-cent amounts and a `mock_*` reference.

**Scope delivered:** the internal financial ledger a future Stripe would settle into. NOT in scope:
real payments, paid messages (the architecture is prepared but messaging stays free), refunds UI,
admin payout approval UI.

- **Migration** `20260518000000_monetization_ledger.sql`: enums `transaction_type`,
  `transaction_status`, `payout_status`, `payout_request_status`. Tables `transactions` (append-only —
  a BEFORE UPDATE/DELETE trigger blocks money rewrites but permits FK-null cascades; CHECK that
  `creator_net = gross − platform_fee − processor_fee`), `creator_balances` (cached projection),
  `payout_requests`, `payouts`, `tips`, `purchases`, `content_entitlements` (permanent, unique per
  user×post). Adds `posts.price_cents` / `posts.currency` and activates the `purchase` visibility tier.
- **RPCs:** `recalc_creator_balance` (mirrors the pure `deriveCreatorBalance`), `has_content_entitlement`,
  `is_current_user_admin` (wraps the authenticated-revoked `has_role` so admin read policies work),
  `create_mock_purchase` (idempotent unlock → transaction + purchase + entitlement), `create_mock_tip`,
  `request_payout` (eligibility-checked; records request + reserved `processing` payout), `creator_balance`
  (recompute-on-read). Fee model = 10% platform + 3% processor, matching `cabana-money`. `purchase`
  wired into `can_view_post`, `feed_creator_posts`, `post_card`, and a buyer `posts` SELECT policy.
- **RLS:** creators read their own balance/transactions/payouts/tips/sales; buyers read their own
  purchases/entitlements; admins read all (via `is_current_user_admin`); anon fully revoked; all writes
  go through the RPCs only.
- **Pure module** `cabana-money.ts` (+ tests, 100% lines): added `evaluatePayoutEligibility`,
  `evaluatePurchase`, `entitlementFromPurchase`, `MIN_PAYOUT_CENTS` alongside the existing
  fee/balance/format helpers. `cabana-posts.ts` now allows `purchase` visibility + a validated price.
- **Server actions** `money-actions.ts`: createMockPurchase, createMockTip, requestPayout,
  getCreatorBalance, getTransactions, getPayoutHistory, getTips, getPurchases (sales), getEntitlements.
  **Hooks** `use-money.ts`: useBalance, useTransactions, usePayouts, usePurchases, useTips,
  useEntitlements, useRequestPayout, useSendTip, usePurchaseUnlock.
- **UI**: `components/cabana/earnings/` — EarningsDashboard (real `/dashboard/earnings`, replaced
  DemoEarnings) with BalanceCard, TransactionHistory, TipHistory, PurchaseHistory, PayoutHistory, and a
  PayoutRequestDialog. Every flow shows "Demo Mode — No real payment is processed." Purchase unlock CTA
  added to `LockedContentGate` (wired in `PostDetail`); paid-post authoring added to `PostComposer`.
- **Tests**: `supabase/tests/monetization_ledger.sql` (purchase unlock + idempotency, tip, balance
  derivation, payout request + reservation + eligibility guards, ledger immutability, self-action
  rejection, buyer/creator/stranger RLS isolation, anon denial). `smoke.sql` extended; `db-validate.sh`
  - CI run it. Seed adds an `aurora` `purchase` post.

**Local verification:** from-zero rebuild applies; all **eight** SQL suites pass via the DB container;
183 unit tests pass at ≥95% (money/posts 100%/~99.7%); lint / tsc / build green.

**Next:** Phase 7+ (gated) — e.g. notifications, admin moderation/finance subroutes, real payment
processor integration behind the existing ledger, refunds/disputes, paid messages. Remote schema
reconciliation + the `subscriptions` rename remain deferred. Do not start without approval.

---

## Previous Status — Phase 5 COMPLETE (Messaging Foundation)

Built on Phase 4. Local Docker only; remote/push/deploy untouched (config deny-list enforces this).

**Scope delivered:** direct (1:1) conversations, messages, and read receipts with participant-scoped RLS
and **Supabase Realtime**. NOT in scope: paid messages, tips, attachments, notifications/push (the
`message_type` enum carries `image`/`video`/`paid`/`tip` for forward-compat; only `text`/`system` are
writable).

- **Migration** `20260517000000_messaging.sql`: `message_type` enum; `conversations`,
  `conversation_participants` (unique pair), `messages` (soft-delete via `deleted_at`),
  `message_read_receipts` (unique per message/reader). SECURITY DEFINER helpers
  `is_conversation_participant` / `is_conversation_blocked` / `is_message_in_my_conversation` (break the
  participant⇄policy recursion). RPCs `create_direct_conversation` / `start_conversation_with_username`
  (find-or-create, block-aware, no self), `list_conversations` (other-party identity + last-message
  preview + unread), `conversation_header`, `conversation_messages`, `mark_conversation_read`,
  `unread_message_count`. A bump trigger orders the inbox; `messages` + `message_read_receipts` are added
  to the `supabase_realtime` publication (delivery is still RLS-filtered).
- **RLS:** participants read their conversations/roster/messages/receipts; send only as self, only `text`,
  only inside your conversation, **never across a block**; edit/soft-delete only your own messages;
  anon fully revoked.
- **Pure module** `cabana-messaging.ts` (+ tests): body validation, self-guard, preview/unread/sort math,
  edit/delete rules, mappers, and a repository-injected behavior layer.
- **Server actions** `messaging-actions.ts`: createConversation, startConversationWithUsername,
  getConversations, getConversation, getMessages, sendMessage, editMessage, deleteMessage,
  markConversationRead, getUnreadCount. **Hooks** `use-messaging.ts` with Realtime subscriptions
  (live messages, live receipts, live inbox ordering; supabase-js auto-reconnects).
- **UI**: `Inbox`, `ConversationView` (auto-scroll, mark-read on new messages, typing placeholder),
  `MessageBubble`, `MessageComposer`. Real `/messages` (replaced FoundationPage) + new
  `/messages/$conversationId`; the `/$username` Message button now opens a conversation.
- **Tests**: `supabase/tests/messaging.sql` (conversation/message/receipt RLS, participant isolation,
  unread, read receipts, edit/delete rules, block enforcement, self-conversation + anon denial).
  `smoke.sql` extended; `db-validate.sh` + CI run it.

**Local verification:** from-zero rebuild applies; all **seven** SQL suites pass via the DB container;
unit tests pass at ≥95% (messaging module 100%); lint / tsc / build green.

**Next:** Phase 6 (monetization ledger & payments foundation — `transactions`/`tips`/`creator_balances`/
`payouts`, `purchase` post unlock, paid messages) — gated. Remote schema reconciliation + the
`subscriptions` rename remain deferred.

---

## Phase 4 COMPLETE (Creator Subscriptions & Mock Entitlements)

Built on Phase 3.2 engagement. **DEMO-ONLY** — no real money, payment provider, payouts, or KYC. Local
Docker only; remote/push/deploy untouched (config deny-list enforces this).

**Scope delivered:** fan-to-creator subscriptions and the `subscribers` post-visibility tier wired to a
real entitlement. The existing `subscriptions` table (CABANA SaaS plans) was **not** renamed — fan subs
live in a new `creator_subscriptions` table (the `subscriptions`→`platform_subscriptions` rename remains
deferred debt). `purchase` visibility stays unsupported (needs the Phase 6 ledger).

- **Migration** `20260516000000_creator_subscriptions.sql`: `creator_subscription_status` enum;
  `creator_subscription_tiers` (creator-defined, integer-cent demo prices) and `creator_subscriptions`
  (member↔creator, unique live pair); `is_active_subscriber` helper; SECURITY DEFINER write RPCs
  `subscribe_to_creator` (copies tier price, stamps a `mock_*` ref — no charge), `cancel_creator_subscription`,
  and read RPCs `creator_subscription_state`, `creator_subscribers_list`. Extended `can_view_post`,
  `feed_creator_posts`, and `post_card` so `subscribers` posts unlock for active subscribers and surface as
  **locked stubs** (Subscribe CTA) for everyone else; added a posts SELECT policy for subscribers.
- **RLS:** tiers — public reads active, owner manages. Subscriptions — member reads own, creator reads subs
  to own profile; **writes only through the RPCs** (no direct insert/update grant); anon revoked.
- **Pure module** `cabana-subscriptions.ts` (+ tests): tier/price/currency validation, state mapping, and
  `isStateEntitled` reusing `isSubscriptionActive` from `cabana-entitlements`. `cabana-posts` now permits
  `subscribers` visibility (still rejects `purchase`).
- **Server actions** `subscription-actions.ts`: `upsertTier`, `setTierActive`, `getMyTiers`,
  `getCreatorTiers`, `subscribeToCreator`, `cancelSubscription`, `getSubscriptionState`,
  `getCreatorSubscribers`. **Hooks** `use-subscriptions.ts`.
- **UI**: `SubscriptionTierCard`, `CreatorSubscribePanel` (mock-checkout dialog with a visible "Demo — no
  real charge / no card collected" banner), `SubscribersDashboard` (tier manager + subscriber list).
  `/dashboard/subscribers` is now real (replaced `DemoSubscribers`); `/$username` shows a Subscribe panel;
  the composer offers a Subscribers visibility; `LockedContentGate` shows a Subscribe CTA for subscriber locks.
- **Tests**: `supabase/tests/creator_subscriptions.sql` (tier RLS, demo subscribe/cancel, unique live pair,
  subscriber entitlement on posts + feed locking, self-subscribe rejection, direct-write denial, creator
  subscriber visibility, anon denial). `smoke.sql` extended; `posts_feed.sql` updated for the new
  subscriber-locked feed rows; `db-validate.sh` + CI run the new suite.

**Local verification:** from-zero rebuild applies; all **six** SQL suites pass via the DB container; unit
tests pass at ≥95% (subscriptions module 100%); lint / tsc / build green.

**Next:** Phase 5 (messaging) or Phase 6 (monetization ledger: real `transactions`/`tips`/`payouts`,
`purchase` post unlock) — gated. Remote schema reconciliation + the `subscriptions` rename remain deferred.

---

## Phase 3.2 COMPLETE (Engagement Foundation)

Built on Phase 3 posts. Local Docker only — no production Supabase, link, push, or deploy (a config
deny-list blocks those).

**Scope delivered (comments + likes + saves only):** no monetization, messaging, notifications, or
real-time.

- **Migration** `20260515000000_engagement.sql`: `comment_status` enum; `post_comments` (1–2000 chars,
  soft-deletable via status), `post_likes`, `post_saves` (unique per user/post, private); block-aware
  RLS gated by `can_view_post` + new `is_engagement_blocked`; `is_current_user_post_owner` helper;
  ID-free RPCs `post_engagement_state`, `post_comments_list`, `post_card`.
- **RLS guarantees:** comment/like/save only on viewable posts; denied across a block (either
  direction); authors edit/soft-delete own visible comments; post owners hide comments on own posts;
  anon reads visible comments on public posts only and cannot write; likes/saves unique + private.
- **Pure module** `cabana-engagement.ts` (+ tests, in coverage set): comment validation, count
  normalization, like/save toggle math, status handling, display-safe mapping.
- **Server actions** `engagement-actions.ts`: addComment, editComment, deleteComment, hideComment,
  likePost, unlikePost, savePost, unsavePost, getPostEngagementState, getPostComments, getPost. Writes
  use `requireSupabaseAuth`; reads use `optionalSupabaseAuth`. No service-role shortcuts.
- **Hooks** `use-engagement.ts`: usePostEngagementState, usePostComments, usePost, usePostLike,
  usePostSave, and comment mutations (optimistic like/save).
- **UI**: `EngagementBar`, `CommentComposer`, `CommentList`, `PostDetail`; new `/post/$postId` route;
  `PostCard` now shows like/comment/save.
- **Tests**: `supabase/tests/engagement.sql` (comment/like/save RLS, like & save uniqueness, viewability
  gating, block enforcement, creator hide, author soft-delete, anon public-comment read, anon write
  denial). `smoke.sql` extended; `db-validate.sh` + CI run it (CI also gained the Phase 3 `posts_feed`
  step, previously only in CI).

**Local verification:** from-zero rebuild applies; all five SQL suites pass via the DB container;
unit tests pass at ≥95% (100% on the engagement module); lint / tsc / build green.

**Next:** Phase 4 (creator subscriptions & entitlements) — gated. Remote schema reconciliation deferred.

---

## Phase 3 COMPLETE (Posts & Feed Foundation)

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
- Demo-only media kit, settings integrations, and admin portal.
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
