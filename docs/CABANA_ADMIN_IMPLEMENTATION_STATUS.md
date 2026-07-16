# CABANA Admin Implementation Status

> Audit date: 2026-07-14
> Working branch: `admin/creator-pages`
> Audited HEAD: `7e728252d129e435ae6b5d76a6f6ea015d4df973`
> Production baseline branch: `main` / `origin/main` at `9638e32`
> Checklist source: `/Users/tdstudiosny/Downloads/CABANA_ADMIN_MASTER_CHECKLIST.md`
> Checklist SHA-256: `c62bc1c2b9204776d6f1b948fa05d801a2e97c2175db8fbdfe40b31464bd1d39`
>
> **Update 2026-07-15 — Phase 2A SHIPPED (PR #25 → `main` `15cb8ad`, cloud `20260540`).** Admin creator-page management is now live in production: PR #25 ("feat(admin): complete creator-page management and editor") squash-merged to `main`, and migrations `20260537`–`20260540` are applied to cloud `rpzaeqoqcaxxavltgvpe` and verified. `/admin/creators`, the new/detail editor (`/admin/creators/new`, `/admin/creators/$creatorProfileId`), the shared public creator-page renderer, regenerated `types.ts`, and the audited admin write path for `creator_profiles`/`links` are live. `20260539` restricts finance/ownership audit visibility to admins (moderators no longer see those rows) and `20260540` adds one-page-per-owner uniqueness plus owner column-UPDATE and `links.profile_id` lockdowns. The "branch-only" / "not production" / hardening-pending notes throughout this audit predate that merge. Still remaining (not shipped): the invite/claim flow and staff MFA/session hardening.

## Executive summary

CABANA has a small, real admin foundation: database-backed `admin` and `moderator` roles; live reports and immutable audit records; caller-RLS finance reads over an explicitly mock ledger; an admin-gated mock payout state machine; and a branch-only, paginated creator directory with creator-page management RPCs. It is not a launch-ready administration system. Most checklist areas—user management, verification/KYC, performer consent, enforcement, CSAM response, support, legal/privacy operations, real payments, tax, fraud, settings, system health, and recovery—have no operational implementation.

No Critical vulnerability was confirmed. High launch risks are missing staff MFA/session controls, unaudited unrestricted admin role changes, upload eligibility without identity/age verification, storage paths without database-enforced MIME/size/malware controls, and a Stream publish-readiness rule that is not enforced by `publishPost`. Real money, real payouts, and adult-content uploads must remain disabled.

The creator-page work at this HEAD is committed and pushed but branch-only. Migrations `20260537` and `20260538` are not production capabilities. They also need hardening before deployment: creator owners can bypass the new lifecycle RPC through direct column updates, one-page-per-owner is not protected by a unique constraint, and creator-transfer audit payloads are visible to moderators. **(SHIPPED July 15 2026, PR #25 → `main` `15cb8ad`, cloud `20260540`: `20260540` adds the one-page-per-owner unique index and blocks owner direct `page_status`/`user_id` updates; `20260539` restricts the transfer-audit rows to admins — these hardening gaps are now closed.)**

## Audit method and evidence boundary

Each capability is assigned exactly one of: `COMPLETE`, `COMPLETE_BUT_MOCK`, `PARTIAL`, `PLACEHOLDER`, `BACKEND_ONLY`, `UI_ONLY`, `MISSING`, `BLOCKED`, `NOT_APPLICABLE_YET`, or `REQUIRES_LEGAL_OR_VENDOR_DECISION`. `COMPLETE` is reserved for a real authorized path with relevant tests. A route, field, button, table, type, or mock value alone is not completion.

Important paths were traced as:

```text
route/UI -> hook -> server action -> caller Supabase/RPC
         -> table/view -> RLS/SQL authorization -> audit -> tests
```

“Production” below means the repository-documented state of `main` and the cloud deployment. This audit did not query GitHub, Vercel, Cloudflare, Supabase production, vendor dashboards, backup configuration, or Auth settings. Claims such as “Stream webhook live” are therefore documented, not independently re-verified.

## Exact baseline

```text
git branch --show-current
admin/creator-pages

git status --short
 M docs/CLAUDE_SESSION_HANDOFF.md
?? .claude/

git rev-parse HEAD
7e728252d129e435ae6b5d76a6f6ea015d4df973

git log -8 --oneline --decorate
7e72825 (HEAD -> admin/creator-pages, origin/admin/creator-pages) feat(db): add admin creator-page management RPCs and audit
fe4b537 feat(db): add creator-page visibility foundation
1e3a172 docs: refresh admin testing conventions
e37fe02 feat(admin): add live creator directory
9638e32 (origin/main, origin/HEAD, main) docs: add admin creator-page implementation plan
064623e docs: record live Stream webhook and 5A.2 upload transport in CLAUDE.md
7658e2c feat(stream): add resumable upload transport and controller
8d8b438 feat(stream): add pure upload session state machine

git branch -a
* admin/creator-pages
  main
  stream/5a3-composer-ui
  remotes/origin/HEAD -> origin/main
  remotes/origin/admin/creator-pages
  remotes/origin/checkpoint/auth-routes-2026-07-03
  remotes/origin/design/cabana-ui-ux-exploration
  remotes/origin/feat/phase-2b-member-accounts
  remotes/origin/feat/phase-2c-social-relationships
  remotes/origin/main
  remotes/origin/pr/23
  remotes/origin/refactor/social-application-layout
  remotes/origin/release/v1-pre-production
  remotes/origin/stream/5a3-composer-ui

git remote -v
origin https://github.com/tdstudioshq/LuminaCreatorSuite.git (fetch)
origin https://github.com/tdstudioshq/LuminaCreatorSuite.git (push)
```

The modified handoff and untracked `.claude/` predated this audit and were not changed. Repository documentation records draft PR #25 for this branch and draft PR #24 for Stream composer work; those PR states were not externally verified.

## Current production state

Repository documentation says the cloud schema is current through `20260536`. The following are present on `main` and documented as deployed; production runtime was not independently verified:

- `/admin` as a clearly labeled demo hub, plus `/admin/reports`, `/admin/audit`, `/admin/finance`, `/admin/ledger`, `/admin/ledger/$transactionId`, and `/admin/payouts`.
- `public.user_roles` with `admin`, `moderator`, and `user`; `has_role`, `is_current_user_admin`, and `is_current_user_staff`; RLS on current public tables.
- Member reports, staff assignment/status changes, database-triggered report audit records, and append-only `audit_logs`.
- An immutable mock transaction ledger, derived creator balances, mock payout requests, admin payout transitions, and payout decision audit records. No provider moves money.
- In-app notifications; an outbox/retry/dead-letter engine whose delivery result is simulated. No email or push provider exists.
- Cloudflare Stream migration `20260536`, ticket/action/webhook/tus/controller foundations, and signed-playback server actions. `CLAUDE.md` says the webhook is registered and live; no successful real-video flow is documented.
- Unit/injected-dependency/SSR-oriented tests, 25 behavioral SQL suites on this branch, frozen Bun and pnpm lockfile validation, builds, and from-zero database rebuilds in CI.

Production **now has** `/admin/creators`, `page_status`, creator-page admin RPCs, and creator-page mutation audit records — migrations `20260537`/`20260538` (plus `20260539`/`20260540`) shipped via PR #25 (`main` `15cb8ad`) and are applied to cloud `20260540`. _(The branch/production comparison below was written pre-merge and describes the prior branch-only state.)_

## Branch-only state

`admin/creator-pages` adds four commits and 22 changed files over `main`:

- `/admin/creators`: a real, read-only, server-paginated directory.
- `getAdminCreators`: authenticated caller client, explicit `assertAdmin`, caller RLS, search/claim filters, exact count and `.range()` pagination; owner UUID and email are omitted from the result.
- `20260537000000_creator_page_visibility.sql`: `page_status`, typography/background fields, link kind/visibility, HTTP(S)-prefix check, published visibility RLS, and a filtered `public_creator_profiles` view.
- `20260538000000_admin_creator_page_management.sql`: eight admin-only `SECURITY DEFINER` RPCs plus internal audit helper for page create/update/status/transfer and link upsert/visibility/reorder/delete.
- Pure/action/SSR and behavioral SQL tests for the directory, visibility, authorization, audit, transitions, transfer, and links.

Still absent: creator detail/editor/new routes, invitation/claim schema and UI, preview controls, public rendering of the new appearance fields, browser E2E tests, production migration application, regenerated Supabase types, and the reserved audit-visibility follow-up (no such migration file currently exists). `src/lib/admin-creator-page-actions.ts` uses a temporary narrow type cast because the generated types reflect production, not the branch schema.

The separate `stream/5a3-composer-ui` branch contains commit `308476b` with upload composer UI and tests. **[Superseded July 16 2026: the complete Stream vertical slice — composer + playback UI + publish/detach/reconcile — squash-merged to production `main` as `d2b7137` and deployed; the pre-merge description that follows is retained for audit history.]** It is unmerged and does not supply playback UI or consume the existing playback actions; it also lacks server-side publish readiness, attached-media deletion, and admin media tooling.

## Current admin route matrix

| Route | Scope | UI gate | Data and writes | Effective authorization | Pagination/filtering | Audit/tests | Status |
|---|---|---|---|---|---|---|---|
| `/admin` | Main / documented production | Local `AdminGate` in `src/routes/admin.tsx` | Hardcoded overview, verification, subscriptions, payouts, flagged, featured, growth; links to live tools | Client `useHasRole("admin")` only; no privileged data action on the hub | Disabled demo filters | Demo controls are disabled/labeled; no dashboard data tests | `PLACEHOLDER` |
| `/admin/creators` | Live (PR #25 → `main` `15cb8ad`, cloud `20260540`) | `AdminGate` | `useAdminCreators` -> `getAdminCreators` -> `creator_profiles` and `links`; read-only directory (create/edit via `/admin/creators/new` + `/admin/creators/$creatorProfileId`) | Bearer validation -> explicit `assertAdmin` -> caller RLS | Server search, claimed filter, page/page-size, `.range()` | `cabana-admin-creators.test.ts`, `CreatorDirectory.test.tsx`; no browser E2E | `PARTIAL` |
| `/admin/reports` | Main / documented production | `StaffGate` | `getReports`, `assignReport`, `updateReportStatus` -> `reports` | Bearer validation; actions rely on staff RLS, not explicit `assertStaff` | Status filter; capped at 200, no cursor/page | Report audit trigger; unit + `admin_moderation.sql` | `PARTIAL` |
| `/admin/audit` | Main / documented production | `StaffGate` | `getAuditLogs` -> `audit_logs` | Bearer validation + broad staff RLS | Latest 200 only; no search/page/export | Append-only trigger + SQL tests; payload scope too broad | `PARTIAL` |
| `/admin/finance` | Main / documented production | `AdminGate` | `transactions`, `payouts`, `creator_balances`; read-only | Bearer validation + caller RLS: creator/payer owner policies plus admin read-all; non-admin calls return scoped own rows rather than 403 | 500/1,000 windows; client filters | Pure finance + ledger SQL tests; mock data | `PARTIAL` |
| `/admin/ledger` | Main / documented production | `AdminGate` | Read/search/filter/export current transaction window | Same caller-RLS boundary; no strict admin denial | Client filtering over capped window; CSV of current window | Pure tests; exports not audited | `PARTIAL` |
| `/admin/ledger/$transactionId` | Main / documented production | `AdminGate` | One RLS-visible ledger row | Same caller-RLS boundary; no strict admin denial | Record route | Pure mapping tests; mock data | `PARTIAL` |
| `/admin/payouts` | Main / documented production | `AdminGate` | Queue read plus `admin_review_payout` transitions | Queue read is RLS-only; write RPC strictly checks admin in SQL | 500-row cap/status filter | SQL transition/balance/audit/denial tests; no provider | `COMPLETE_BUT_MOCK` |

No current admin routes exist for users, creator verification, content/media oversight, subscriptions, messaging oversight, payments/refunds/chargebacks, fraud, KYC/sanctions/tax, support, copyright, legal/privacy requests, notifications/broadcasts, discovery controls, platform settings, analytics, system health, backup/recovery, or staff administration.

## Authorization chain

```text
Browser route
  -> AdminGate or StaffGate (UX only)
  -> useHasRole(role)
  -> caller's own public.user_roles row

Server action
  -> attachSupabaseToken
  -> requireSupabaseAuth
  -> Supabase getClaims(token), userId = signed claims.sub
  -> caller-scoped Supabase client
  -> optional explicit assertAdmin (creator actions only)
  -> RLS and/or SQL RPC role check
```

Nested `/admin/*` routes deliberately bypass the root `/admin` gate through `<Outlet>` and bring their own client gate. None uses `beforeLoad`, an SSR loader role check, or a server route guard. The real data boundary is therefore action/RPC/RLS authorization.

`has_role(uuid, app_role)` is a `SECURITY DEFINER` helper used by trusted SQL/RLS; execution is revoked from public client roles. `is_current_user_admin()` and `is_current_user_staff()` take no caller-supplied identity and derive `auth.uid()`. The latter means admin **or** moderator. No runtime email authority or client-supplied `isAdmin` authority was found.

Explicit server denial is inconsistent:

- Strict: branch creator directory and creator-page action wrappers call `assertAdmin`; payout decisions and outbox processing check admin inside SQL RPCs.
- RLS-only: finance, ledger, payout queue, reports, audit reads and report mutations. Several admin-named reads return the caller's normal scoped rows/empty results rather than strict denial.
- Direct RLS DML: an admin can manage `user_roles` through PostgREST without a reason, action wrapper, step-up, or audit record.

## Current staff role and permission matrix

| Requested role | Exists today | Current effective permission | Checklist gap |
|---|---:|---|---|
| Super admin | No | `admin` is the highest current role across implemented capabilities | Separate break-glass/super-admin scope, MFA, approvals, review |
| Admin | Yes | All current admin routes; role DML; finance; payouts; all reports/audits; outbox; branch creator management | Monolithic, no step-up, role-change audit, session controls, or two-person approval |
| Moderator | Yes | Reports assignment/status and every audit-log row | No senior-review role; audit scope exposes unnecessary finance/owner data; no enforcement tools |
| Finance | No | Finance permissions are held by `admin` | Add least-privilege finance scope without private-content access |
| Payouts | No | Payout review is held by `admin` | Add payout-review scope, dual approval and step-up |
| Support | No | No support capability | Add scoped account/ticket views without money or private-content authority |
| Compliance | No | No compliance capability | Add identity/sanctions/legal-hold scope with restricted evidence access |
| Auditor | No | No read-only role | Add immutable read-only, field-minimized, export-approved access |

The database enum also contains nonstaff `user`. Finance, payouts, support, compliance, auditor, senior moderation, legal, fraud, marketing, analytics, engineering operations, and vendor-support roles exist only as checklist recommendations.

## Master-checklist capability matrix

The companion `docs/CABANA_ADMIN_GAP_MATRIX.md` is the authoritative capability-level matrix incorporated into this status report: it classifies all 899 items in the 35 numbered sections plus all 19 definition-of-done checks, for 918/918 total. The table below is the section-level roll-up, not a substitute for those classifications.

| # | Checklist section | Status | Repository evidence and conclusion |
|---:|---|---|---|
| 1 | Admin access and staff security | `PARTIAL` | Trusted DB roles and caller auth exist; gates are client-only; MFA, session administration, step-up, rate limits, SSO/JIT/reviews/offboarding are absent. |
| 2 | Roles and permissions | `PARTIAL` | Only `admin`, `moderator`, `user`; admin is monolithic and role changes are unaudited. |
| 3 | Admin overview dashboard | `PLACEHOLDER` | `src/routes/admin.tsx` uses labeled sample statistics; only links to underlying live tools are real. |
| 4 | User directory and account management | `MISSING` | No route, admin query, account state model, session action, timeline, notes, export, suspension or deletion workflow. |
| 5 | Creator onboarding and verification | `PLACEHOLDER` | Disabled sample verification cards; no identity provider, tables, queue, decisions, appeals, or webhook history. |
| 6 | Adult-content performer identity and consent | `REQUIRES_LEGAL_OR_VENDOR_DECISION` | No runtime controls or records; architecture docs are planning only. Counsel, identity vendor and operating policy are prerequisites. |
| 7 | Creator profile and link-page management | `PARTIAL` | **SHIPPED to production (PR #25 → `main` `15cb8ad`, cloud `20260540`):** directory + new/detail editor + audited admin write path + shared public renderer are live; lifecycle/uniqueness gaps closed by `20260539`/`20260540`. Still remaining: invite/claim flow. |
| 8 | Content management | `MISSING` | Creator-owned post CRUD exists, but there is no admin inventory, safe review, enforcement, evidence, appeal or cleanup verification. |
| 9 | Video and live-stream administration | `PARTIAL` | Stream backend is substantial; upload UI is branch-only, playback UI and admin/live-stream/cleanup tooling are missing, and publish readiness is client-only. |
| 10 | Trust and safety moderation | `PARTIAL` | Reports queue and assignment/status audit exist; policy taxonomy, evidence, enforcement, appeals, holds and severe-review controls do not. |
| 11 | CSAM and child-safety response | `REQUIRES_LEGAL_OR_VENDOR_DECISION` | No queue, evidence vault, CyberTipline workflow, preservation, training or detection vendor. |
| 12 | User reports and investigations | `PARTIAL` | Creator/post/message reporting and basic triage exist; media/live/underage/NCII, attachments, priority/SLA, case linkage and notifications are missing. |
| 13 | Messaging administration | `MISSING` | Participant-only messaging exists; no staff search/access-with-reason, reported-thread evidence, restrictions, legal export or access audit. |
| 14 | Subscriptions and monetization | `PLACEHOLDER` | Admin tab is sample data. Member subscriptions and entitlements are demo-only and lack admin/global management. |
| 15 | Payments and card security | `REQUIRES_LEGAL_OR_VENDOR_DECISION` | No payment provider or card handling. Provider selection, PCI scope and webhook/reconciliation design are prerequisites. |
| 16 | Creator earnings and payouts | `PARTIAL` | Mock ledger/balances/queue/transitions exist; not true double-entry and no provider confirmation, reserves, KYC, reconciliation, dual approval or step-up. |
| 17 | KYC, sanctions and financial compliance | `REQUIRES_LEGAL_OR_VENDOR_DECISION` | No provider, screening records, rules, holds or program. |
| 18 | Fraud and risk operations | `MISSING` | No signals, scores, device/IP graph, rules engine, review queue or hold controls. |
| 19 | Tax administration | `REQUIRES_LEGAL_OR_VENDOR_DECISION` | No tax profiles/forms/calculation/delivery/provider; counsel/accounting and vendor choices required. |
| 20 | Refunds, disputes and chargebacks | `MISSING` | Refund types and pure arithmetic are foundations only; no trusted refund action/RPC, request, decision, provider or evidence workflow. |
| 21 | Customer support and CRM | `MISSING` | No ticket model, routes, context, replies, integrations, SLA or access audit. |
| 22 | Copyright and intellectual-property operations | `REQUIRES_LEGAL_OR_VENDOR_DECISION` | Generic copyright report reason exists; no compliant intake/takedown/counter-notice/repeat-infringer process. |
| 23 | Legal and law-enforcement requests | `REQUIRES_LEGAL_OR_VENDOR_DECISION` | No intake, verification, hold, approval, secure disclosure, custody or transparency workflow. |
| 24 | Privacy and data rights | `REQUIRES_LEGAL_OR_VENDOR_DECISION` | No request workflow, consent/version registry, deletion orchestration, retention overrides or audit. |
| 25 | Security operations | `PARTIAL` | RLS, server-only secrets, Stream HMAC, signed private media, redirect sanitizer and headers exist; upload controls, MFA, rate limiting, CSP, alerting, scanning, IR and penetration testing are absent/unverified. |
| 26 | Audit logs | `PARTIAL` | Append-only schema and report/payout/branch-creator audit exist; coverage, metadata, pagination/export and role isolation are incomplete. |
| 27 | Notifications and communications | `PARTIAL` | In-app notifications work; email/push and outbox outcomes are simulated; no admin templates, broadcasts or targeting. |
| 28 | Discovery, recommendations and promotions | `PLACEHOLDER` | Public deterministic discovery exists; admin featured controls are hardcoded and disabled, with no ranking-change audit. |
| 29 | Analytics and reporting | `PLACEHOLDER` | Creator analytics are live over scoped/demo data; admin growth is hardcoded and there is no platform-wide full-history reporting/export. |
| 30 | Platform configuration | `MISSING` | Scattered hardcoded constants are not an admin configuration backend; no settings table/API, versioning, authorization, audit, rollback or pause controls exist. |
| 31 | System operations and integrations | `PARTIAL` | Outbox retry/DLQ and provider idempotency primitives exist, but 22 of 24 checklist capabilities—including every health/admin operations surface—are missing. |
| 32 | Backup, recovery and business continuity | `MISSING` | One-time reconciliation backups are history, not an operational backup/PITR/restore/DR program. |
| 33 | Internal staff operations | `MISSING` | No staff directory, permission owners, training, on-call/handoff, QA, wellness or insider-risk workflow. |
| 34 | Admin-interface quality | `PARTIAL` | Real tools have loading/empty/error/confirmation states, but raw errors, capped reads, local-only filters, broad payloads and incomplete reason requirements remain. |
| 35 | Release and change management | `PARTIAL` | Strong CI/from-zero SQL tests and smoke script; no E2E/a11y/load/security suite, production environment gate, canary or automated rollback. |

## Creator-page system detail

The branch call chain is:

```text
/admin/creators
-> AdminGate
-> CreatorDirectory
-> useAdminCreators
-> getAdminCreators
-> requireSupabaseAuth + assertAdmin
-> creator_profiles / links under caller RLS
```

Management wrappers in `src/lib/admin-creator-page-actions.ts` again assert admin before calling the eight RPCs in migration `20260538`. Each RPC uses `SECURITY DEFINER`, `search_path=''`, `auth.uid()`, `is_current_user_admin()`, schema-qualified objects, explicit revoke/grant, row locks where applicable, stable errors and audit-on-success. `supabase/tests/admin_creator_page_management.sql` proves anon/nonadmin/forged-claim denial and operation/audit behavior.

The backend is not ready to deploy unchanged:

- Migration `20260537` leaves the baseline owner UPDATE policy and authenticated UPDATE grant intact. An owner can directly change `page_status`, bypassing the RPC state machine and audit. This is especially unsafe if `archived` is intended as enforcement.
- “One page per owner” is checked in the transfer RPC but has no partial unique constraint. Concurrent transfers to an owner with no existing row can both pass.
- `admin_update_creator_page` uses `coalesce`, so nullable avatar/banner fields cannot be cleared.
- The HTTP(S) check is prefix-only and `NOT VALID`; malformed/legacy URLs remain possible.
- The public page relies on RLS but does not select/render `font_family`, `background_style`, link `kind`, or `is_visible`; `public_creator_profiles` is not consumed.
- Creator-transfer audit rows include owner Auth UUIDs and are readable by moderators under the current broad audit policy.
- No invitation, hashed claim token, expiry/revocation, claim route, or creator-account conversion exists.

Required release order: check all shared environment ledgers -> amend the two migration files only if they are unapplied everywhere shared -> local from-zero rebuild and SQL tests -> regenerate `src/integrations/supabase/types.ts` and remove the cast shim -> build/test the editor and public flow -> approved application of `20260537000000_creator_page_visibility.sql`, `20260538000000_admin_creator_page_management.sql` and a separately created audit follow-up -> compatible app deploy -> production verification. Do not call either existing migration production-live before that sequence is completed.

## Stream and media detail

Production-documented backend flow:

```text
creator -> createStreamUploadTicket -> Cloudflare direct upload + stream_videos
        -> tus transport/controller -> webhook or owner polling
        -> compare-and-set lifecycle -> post_media status/dimensions
viewer  -> can_view_post -> service read ready media -> signed token/URLs
```

Positive controls include server-only Cloudflare/service secrets, raw-body HMAC with a 300-second window, strict payload parsing, caller entitlement before service-role playback reads, ready-only token issuance, and compare-and-set terminal lifecycle states. Tests cover injected provider/action failures, signatures, races, RLS and linkage.

Material gaps:

- `publishPost` updates status without enforcing `assertPublishableMedia`; the composer-branch readiness rule can be bypassed through the server action.
- No merged UI imports the upload hook. The composer UI is branch-only, and no feed/profile/detail component consumes `getStreamPlayback` or renders a video player.
- `deleteStreamVideo` handles only unattached rows. There is no detach flow, scheduled orphan sweeper, or provider-inventory reconciliation for assets created before a failed DB insert.
- Deleting a post intentionally leaves the Stream row/remote asset orphaned for future cleanup, but no cleanup job exists.
- `stream_videos` has owner-only RLS and `can_view_post` has no staff override. Moderators cannot safely inspect reported locked video.
- There is no live-stream start/stop, emergency termination, live chat moderation, recording hold, admin media route or lifecycle audit.

The production smoke test only proves that an unsigned webhook call returns `401`; it does not prove a signed Cloudflare callback, real upload, processing, playback, entitlement revocation or deletion.

## Payments, payouts and ledger

All money is demo-only by design. Migration `20260518` states there are no cards, payment webhooks, KYC or real payouts. Transaction references use `mock_*`; `create_mock_purchase`, `create_mock_tip` and `request_payout` synthesize ledger events.

| Layer | Classification | Evidence |
|---|---|---|
| Transaction creation | `COMPLETE_BUT_MOCK` | Auth-derived mock RPCs, integer cents, SQL tests and concurrency locks |
| Ledger | `PARTIAL` | Append-only `transactions` with derived balances; it is not journal/account/entry double-entry accounting |
| Balances | `COMPLETE_BUT_MOCK` | `creator_balances` recalculated from mock transactions/payout reservations |
| Payout request | `COMPLETE_BUT_MOCK` | Creator request RPC, minimum, reservation and tests |
| Payout review | `COMPLETE_BUT_MOCK` | Admin SQL state machine and audit; reason optional |
| Provider confirmation | `MISSING` | “Mark paid” is manual and calls no payout provider |
| Refunds | `MISSING` | Enum/type and pure breakdown logic are foundation only; no trusted refund creation/action/RPC or admin workflow |
| Chargebacks/disputes | `MISSING` | Status labels only; no records, webhooks, evidence or reversals |
| Reserves/reconciliation/tax/KYC/sanctions | `MISSING` | No operational models, providers or jobs |

Most user/admin finance surfaces say demo/mock. Two hub descriptions are misleading: `src/routes/admin.tsx:354` and the payout-tab link describe “Real revenue” even though every row is simulated. No current code can charge a card or transfer funds.

## Trust, safety and adult-content readiness

Technically implemented: authenticated member reports for creator/post/message surfaces; report reasons including harassment, impersonation, copyright, scam, hate and sexual content; staff queue, assignment and basic status transitions; append-only audit for status/assignment; reporting RLS and behavioral tests.

Policy/documentation only: architecture and phase documents discuss age gates, KYC, DMCA, prohibited content, retention and future compliance. They are plans, not approved policies or runtime controls.

Requires counsel and/or vendors: adult-content classification and recordkeeping obligations; performer age/identity and liveness; content-specific/co-performer consent; retention and inspection procedures; NCMEC/CyberTipline operations; sanctions/KYC; tax; DMCA/counter-notice; law-enforcement disclosure; privacy/retention; payment and payout provider duties. This audit makes no legal conclusion.

Entirely missing technically: creator verification gate before upload; performer/content-consent records; evidence vault/holds/custody; strikes, warnings, suspensions, bans and payout holds; appeals; severe-action four-eyes review; CSAM queue/reporting/preservation; NCII/deepfake/trafficking controls; content/media admin review; secure legal/privacy request workflows; staff training/wellness/exposure controls.

The current Stream ticket only requires ownership of a creator profile. Image storage can also be used without identity or age verification. CABANA must not accept adult-content uploads until the legal, identity, consent, moderation, evidence, child-safety and staff-control gates in the roadmap are accepted in production.

## Confirmed security findings

### Critical

None confirmed from repository evidence.

### High

1. **Staff account protection is incomplete.** No MFA/AAL/factor flow, forced enrollment, step-up, admin session inventory, individual device revocation or suspicious-login control was found. Basic password validation permits six characters. A stolen admin session receives the monolithic admin permission set. Evidence: `src/lib/cabana-auth.ts`, `src/lib/cabana-roles.ts`, `src/integrations/supabase/auth-middleware.ts`.
2. **Role administration is unaudited and unconstrained.** Authenticated table DML plus admin RLS lets any admin add/remove any role, including admin, without reason, notification, last-admin protection, expiry, step-up or two-person approval. Evidence: migrations `20260525`/`20260526`, `supabase/tests/user_roles_policy.sql`.
3. **Upload admission is not identity/age/compliance gated.** Any account owning a creator profile may obtain a Stream ticket; image buckets likewise have no verification predicate. This is a launch blocker before adult content. Evidence: `src/lib/stream-actions.ts:89-99,228-249` and storage policies in migrations `20260511`/`20260514`.
4. **Storage validation is bypassable.** The `avatars`, `banners`, `products` and private `post-media` bucket definitions set no `allowed_mime_types` or `file_size_limit`; owner-path RLS permits direct Storage API uploads. UI MIME/size checks and media-row validation do not constrain the uploaded object, and no malware scan exists. Public buckets can therefore host attacker-selected content under the project storage domain. Evidence: `20260511000000_baseline.sql:336-363`, `20260514000000_posts_feed.sql:385-400`, `src/lib/use-posts.ts:166-199`.

### Medium

- Moderators receive all audit payloads, including payout details and branch creator-transfer owner UUIDs; sensitive audit categories are not role-scoped. **(CLOSED July 15 2026 by `20260539` — finance/ownership audit rows are now admin-only, so moderators no longer see them; shipped via PR #25 → `main` `15cb8ad`.)**
- Direct staff PostgREST updates can bypass the TypeScript report transition machine; resolution-only edits are not audited.
- Admin route gates are client-only, and finance/report/audit actions inconsistently rely on RLS rather than explicit strict server denial.
- Branch creator owners can directly alter `page_status` without admin lifecycle/audit; ownership uniqueness is not concurrency-safe. **(CLOSED July 15 2026 by `20260540` — owner column-UPDATE excludes `page_status`/`user_id` and a one-page-per-owner unique index enforces uniqueness; shipped via PR #25 → `main` `15cb8ad`.)**
- Stream publish readiness is not server-enforced: `publishPost` can accept processing/errored media despite the composer branch's UI gate. Evidence: `src/lib/cabana-stream.ts:331-363`, `src/lib/post-actions.ts:184-201`.
- Authenticated users can enumerate `creator_profiles.user_id` for visible rows because only anon received a column-scoped grant.
- No application throttling is present for reports, uploads, analytics-event ingestion or privileged mutations; cloud/provider limits were not verified.
- Payout decision reasons are optional, including rejection and mark-paid.
- Audit coverage omits role changes, reads/exports, outbox processing and resolution-only report edits; request ID/IP/user agent columns are not populated.
- Stream remote assets can remain after post/media deletion or failed compensation; there is no executable cleanup/reconciliation job.
- No staff-authorized media inspection path exists for locked reported content.

### Low

- Multiple admin actions throw raw Supabase error messages; report/audit UIs can display them.
- Legacy internal `SECURITY DEFINER` helpers (`has_role`, handle validators, signup trigger) pin `search_path=public` rather than empty. Objects are qualified and client execution is revoked, so no exploit was confirmed.
- Production links lack a database HTTP(S) constraint; the branch check is prefix-only and permits malformed values.
- CSP is absent while browser sessions use local storage. Existing React rendering and redirect controls reduced immediate evidence; no exploitable XSS sink was confirmed.

### Sensitive service-role paths reviewed

No service-role key was found in client code. `SUPABASE_SERVICE_ROLE_KEY` is read only by `src/integrations/supabase/client.server.ts` and is not `VITE_*`. Service access is concentrated in:

- `post-actions.ts`: `can_view_post` precedes private-media read/signing; storage cleanup follows an owner-RLS deletion.
- `stream-actions.ts`: owner-visible row checks precede lifecycle mutation/deletion; `can_view_post` precedes playback reads/token issuance.
- `stream-webhook.server.ts`: HMAC verification precedes service-backed lifecycle synchronization.

These paths held up in code and injected-dependency tests. Production environment scoping and rotation were not independently verified.

## Mock-versus-live classification

| Area | Data classification | Operational truth |
|---|---|---|
| `/admin` overview/verification/subscriptions/flagged/featured/growth | Hardcoded sample | Mostly labeled demo with disabled controls; two finance descriptions incorrectly imply “Real” data |
| Reports and audit | Real database rows; documented production state | Real RLS and mutations; limited workflow and capped reads |
| Finance/ledger/balances | Live rows generated by mocks | Real database behavior, no real money |
| Payout queue | Simulated processing | Real state transitions/audit, no provider transfer |
| Creator directory | Live database rows, branch-only | Read-only; not deployed on production main |
| Creator-page admin writes | Branch-only backend | Tested locally/CI; migrations not applied, no UI |
| Subscriptions/tips/purchases | Demo RPC data | Entitlements behave, no billing provider |
| In-app notifications | Live internal events | Email/push absent; outbox result simulated |
| Creator analytics | Live scoped rows over demo money | Not a platform-admin analytics system |
| Stream webhook/actions | Real provider code, documented live backend | No documented successful real video; no merged upload/playback UI or playback consumer |
| Stream composer | Separate branch | Draft/unmerged; UI gate not authoritative |

## Test and release inventory

- **Unit/pure tests:** 28 TypeScript/TSX test files at this HEAD; Vitest node environment.
- **Injected dependency tests:** creator page actions, Stream actions/provider/webhook/controller/tus and other domain flows.
- **SSR/source-oriented component tests:** creator directory and the Stream composer branch; no browser DOM/E2E runner.
- **Coverage:** V8 thresholds of 95% for lines, functions, branches and statements over 21 selected pure modules; current CI runs `bun run test`, not `test:coverage`, so those thresholds are configured but not enforced there.
- **Behavioral SQL:** 25 files in `supabase/tests`, including user roles, moderation, payouts, Stream, creator visibility and creator management.
- **CI:** Bun frozen install + lint/typecheck/test/build; pnpm frozen production dependency tree + typecheck/build; Supabase CLI from-zero reset + all SQL suites.
- **Production smoke:** deployment freshness/security headers, storage/RLS paths, locked-media stubs, notification scoping, realtime messages, database state and unsigned Stream webhook denial. It does not run a browser, sign a real Stream callback, verify service-role playback, email/push, admin writes, or payment flows.
- **Missing:** browser end-to-end tests, accessibility automation, load tests, dynamic security tests, real provider integration tests, backup restore exercises and admin smoke coverage.

CI contains no deployment job. Vercel preview/production behavior is external to this workflow; repository docs describe draft preview deployments and manual prebuilt production deploys, but there is no repository-enforced production approval environment, canary or rollback automation.

Admin areas with no meaningful tests because the capability does not exist include user management, verification/KYC, adult performer consent, content enforcement, CSAM, messaging oversight, support, copyright/legal/privacy, fraud/tax/refunds/chargebacks, platform settings, system health, backup/recovery and staff operations.

## Launch blockers

1. Staff MFA, forced enrollment, secure recovery, session inventory/revocation, step-up and rate limits.
2. Least-privilege staff roles; audited/approved role changes; sensitive audit isolation.
3. Explicit server authorization and safe errors on every privileged action, plus server/SSR route enforcement where appropriate.
4. Identity/age/verification gate and server-enforced file type/size/malware/content admission before uploads.
5. Trust-and-safety enforcement, evidence, appeals, child-safety/NCMEC procedure and trained restricted staff before adult content.
6. Creator-page lifecycle/ownership/audit hardening, local rebuild, regenerated types and UI/E2E before any controlled `20260537`/`20260538` production apply.
7. Stream server publish gate, playback on feed/profile/detail, detach/delete, orphan/provider reconciliation and staff media review.
8. Real payment/payout provider, true accounting/reconciliation, refunds/disputes/reserves, KYC/sanctions/tax, dual approval and provider-confirmed settlement before real money.
9. User/account administration plus support, DMCA, legal and privacy request workflows.
10. Monitoring/alerting, backups/PITR/restore exercise, incident/DR runbooks, E2E/a11y/security/load tests and production release approval.

## Unknowns and limitations

- Production schema, data, RLS catalog, Auth policy, rate limits, password policy, MFA availability, session behavior, backups/PITR and environment variables were not queried.
- GitHub PR/check state, Vercel previews/deploy aliases and Cloudflare registration were not fetched. PR #24/#25 and production Stream claims come from repository documents.
- `CLAUDE.md` says the Stream webhook is live, while `docs/CABANA_API.md`, `docs/CABANA_ROUTE_MAP.md`, `docs/CABANA_TECH_DEBT.md` and older handoff passages still call it dormant. The latest dated source was preferred and the drift is a release-documentation defect.
- `docs/CABANA_ADMIN_CREATOR_PAGES_PLAN.md` still begins “plan only” and reserves `20260539` for invites; the current handoff records implemented `20260537`/`20260538` and reserves `20260539` for audit visibility, but no `20260539` file exists. The handoff/current tree were treated as authoritative. **(Update 2026-07-15: `20260539` (audit visibility + role management) and `20260540` (one-page-per-owner + owner-UPDATE lockdown) now exist and are applied to cloud `20260540`; the plan doc's “plan only” header is superseded — see PR #25 → `main` `15cb8ad`. Invite/claim did not ship and remains open.)**
- No full CI, database rebuild, browser, load, accessibility, security scan, provider call or production smoke was run as part of this read-only audit.
- The historical `supabase/reconcile` scaffold contained empty compliance/support tables that were deliberately dropped. They are not current capabilities and were not counted.
