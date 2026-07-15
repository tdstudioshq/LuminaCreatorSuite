# CABANA — Admin System Audit & Creator Link-Page Builder Plan

> Prepared July 14, 2026 · Audit performed against commit `064623e` (`main`, level with `origin/main`)
>
> Status: **SHIPPED July 15 2026** — PR #25 ("feat(admin): complete creator-page management and editor") squash-merged to `main` (merge commit `15cb8ad`); migrations `20260537`–`20260540` applied to cloud `rpzaeqoqcaxxavltgvpe` (now at `20260540`) and verified. This document is the original plan; the sections below were written before implementation and are retained for design rationale. **Remaining (not shipped): the invite/claim flow (§12) and staff MFA/session hardening.**
>
> Scope: (1) audit the admin surface and classify it honestly; (2) design an admin-operated
> creator link-page builder that an administrator can publish and hand to a creator.

Every claim below was verified against the working tree at `064623e` — file paths and line
numbers, not documentation. Where the code contradicts the docs, the code wins and is noted.

---

## 1. Repository State (at audit time)

`HEAD` = `origin/main` = `064623e`. `git rev-list --left-right --count origin/main...HEAD` → `0  0`.

Uncommitted work present in the tree, **untouched by this audit**:

| Change | Belongs to |
|---|---|
| `src/components/cabana/posts/PostComposer.tsx` (+214/−21) | Stream Checkpoint 5A.3 |
| `src/components/cabana/posts/VideoUploadCard.tsx` (new) | Stream 5A.3 |
| `src/lib/cabana-composer-media.ts` (new, pure) | Stream 5A.3 |
| `PostComposer.test.tsx`, `VideoUploadCard.test.tsx`, `cabana-composer-media.test.ts` (new) | Stream 5A.3 |
| `src/components/ui/progress.tsx` (+4) | Stream 5A.3 (a11y fix; `VideoUploadCard` is its only consumer) |
| `vitest.config.ts` (+1) | Stream 5A.3 (adds `cabana-composer-media` to the coverage gate) |
| `CLAUDE.md` (+6/−1) | Documentation: Tests-section correction |
| `.claude/` (untracked) | Local agent/skill tooling — unrelated to both workstreams |

Test suite at audit time: **27 files, 912 tests, all passing.**

---

## 2. Current Admin Architecture

Seven admin routes exist; `routeTree.gen.ts` confirms there are no unlisted ones.

| Route | Renders | Guard |
|---|---|---|
| `/admin` | 8-tab legacy console | local `AdminGate` (`src/routes/admin.tsx:42`) |
| `/admin/reports` | `ReportQueue` | `StaffGate` (admin **or** moderator) |
| `/admin/audit` | `AuditLogTable` | `StaffGate` |
| `/admin/finance` | `FinanceOverview` | `AdminGate` (admin only) |
| `/admin/ledger` | `LedgerExplorer` | `AdminGate` |
| `/admin/ledger/$transactionId` | `TransactionDetail` | `AdminGate` |
| `/admin/payouts` | `PayoutQueue` | `AdminGate` |

All seven are `noindex, nofollow`. **None defines `beforeLoad` or `loader`** — authorization is
entirely React render-time. The admin console is linked from no navigation anywhere in the product;
it is reachable only by typing the URL. Obscurity is not the boundary — RLS is.

Naming trap: two unrelated things are both called `AdminGate` — a local function in `admin.tsx:42`
and the imported component `src/components/cabana/admin-finance/AdminGate.tsx`.

---

## 3. Admin Capability Matrix

| Capability | Classification | Evidence |
|---|---|---|
| `/admin/reports` — queue + triage | **fully-wired-live** | `moderation-actions.ts:56`; staff-only RLS UPDATE, column-scoped |
| `/admin/audit` — audit trail | **live-read-only** | `moderation-actions.ts:90`, `.limit(200)` |
| `/admin/finance` — revenue overview | **live-read-only** | `admin-finance-actions.ts:76` |
| `/admin/ledger` (+ detail, CSV export) | **live-read-only** | `admin-finance-actions.ts:91` |
| `/admin/payouts` — approve/reject/hold/release/mark_paid | **fully-wired-live** | `reviewPayout` → SECURITY DEFINER `admin_review_payout` |
| Notification outbox processing | **live, UNAUDITED** | `processOutbox` → `process_notification_outbox` |
| `/admin` Overview tab | **placeholder-demo** | hardcoded `StatCard value="14,829"`, chart arrays (`admin.tsx:390-505`) |
| `/admin` **Users** tab | **missing-backend** | hardcoded `USERS` array (`admin.tsx:508`); every control `{...demoDisabled}` |
| `/admin` Verification tab | **missing-backend** | hardcoded `requests` (`admin.tsx:622`); **no `is_verified` column exists anywhere** |
| `/admin` Subscriptions tab | **missing-backend** | hardcoded tiers/MRR (`admin.tsx:701`) |
| `/admin` Payouts tab | **placeholder-demo** | self-labeled; deep-links to real `/admin/payouts` |
| `/admin` Flagged tab | **placeholder-demo** | self-labeled; deep-links to real `/admin/reports` |
| `/admin` Featured tab | **missing-backend** | hardcoded `list` (`admin.tsx:1009`); `/discover` computes "featured" algorithmically |
| `/admin` Growth tab | **placeholder-demo** | hardcoded funnel arrays |
| Admin settings | **missing-UI** | no route, tab, or component |
| Admin support | **missing-UI** | nothing anywhere |
| **Admin creator/user management** | **missing-UI + missing-backend** | no route, action, RLS policy, or write path |

### On "honestly classified"

The demo surfaces mostly already are. `/admin` carries the amber pill *"Demo preview — sample data.
Live tools: Reports · Audit · Finance · Payouts"*; dead controls carry `{...demoDisabled}`
(`disabled`, `aria-disabled`, `title="Demo preview — not functional"`).

**The one genuinely dishonest surface is the Users tab**: it renders a plausible user table with
per-row action menus over six fabricated creators. It looks like user management and has no backend
at all. Removing it is the highest-leverage honesty fix in the admin console.

---

## 4. Admin Authorization Findings

### Verified sound

- **No service-role in the admin tier.** `supabaseAdmin` is imported in exactly three files —
  `stream-actions.ts:36`, `post-actions.ts:23`, `stream-webhook.server.ts:36`. Every admin action
  runs under the **caller's own RLS**.
- **No client-supplied authority.** No action reads a role or user id from the client payload;
  `assignReport` takes `context.userId` from the validated token (`moderation-actions.ts:139`).
- **Self-escalation is impossible.** `user_roles` writes require `is_current_user_admin()`
  (`20260526000000`); `supabase/tests/user_roles_policy.sql:66` behaviorally asserts a non-admin's
  `insert ... 'admin'` raises `insufficient_privilege`.
- **`useHasRole` cannot be spoofed** — it performs a real RLS-scoped DB read of `user_roles`
  (`cabana-roles.ts`), not a JWT claim.

### FINDING 1 — Moderators can read finance-sensitive audit entries (real)

`audit_logs` has exactly **one** SELECT policy, gated on `is_current_user_staff()` = admin **OR**
moderator, with **no `target_type` filter** (`20260520000000_admin_moderation.sql:261`).

Every finance base table (`transactions`, `payouts`, `payout_requests`, `creator_balances`, `tips`,
`purchases`, `content_entitlements`) gates admin reads on `is_current_user_admin()` — **admin only**.

But the Phase 8C.2 trigger writes payout decisions into that same `audit_logs` with
`target_type = 'payout_request'`, carrying before/after `status` and **`amount_cents`** plus the
admin's note (`20260522000000_admin_payouts.sql:47-51`).

**Net effect:** a moderator who cannot query `payouts` or `transactions` at all can still read every
payout amount and admin decision through the audit log. The existing test exercises only the admin
path; no test asserts a moderator is denied.

### FINDING 2 — `processOutbox` is an unaudited admin mutation

It bulk-mutates `notification_outbox` (dead-letters, retry backoff, attempt counts). `audit_logs`
appears **nowhere** in `20260523000000_notification_engine.sql`. Every other admin write appends an
audit row; this one silently does not, breaking the "every admin decision is audited" invariant.

### FINDING 3 — Report triage has no defense in depth

`assignReport` / `updateReportStatus` are plain `.update()` calls with **no admin check in
TypeScript and no SECURITY DEFINER wrapper** — authorization is 100% the `"Staff update reports"`
RLS policy. It fails safely today, but one policy regression becomes a silent bypass with no second
layer. Contrast `admin_review_payout`, which raises `'Admin role required'` inside the function body.

### FINDING 4 — Admin reads are capped, never paginated

`getReports` 200 · `getAuditLogs` 200 · `getAdminTransactions` ≤1000 · `getAdminPayouts` 500 ·
`getAdminCreatorEarnings` 1000 · `getOutboxStats` 1000. All `.limit(N)`, **zero `.range()`/cursor**.
Past the cap, rows are invisible with no truncation indicator. This is worst for the audit log, where
"I looked and saw nothing" is a compliance claim.

### FINDING 5 — "Admin"-named actions return 200 with scoped data for non-admins

RLS owner-policies are OR'd, so `getAdminTransactions` called by an ordinary creator returns *their
own* transactions rather than 403. Documented and **not a leak**
(`admin-finance-actions.ts:6-9`), but the naming invites a future maintainer to assume a 403 that
does not exist.

### Route protection

**Client-only.** No `beforeLoad`/`loader` on any admin route. Deliberate and documented (RLS is the
boundary), and there is no flash of privileged UI — the gates render a spinner until the role
resolves. But admin safety depends entirely on the database refusing, never on the router.

---

## 5. Critical Admin Gaps

1. **There is no admin creator management of any kind** — no route, component, server action, RLS
   policy, or service-role path. Verified by grepping every `.from("creator_profiles")`,
   `.from("links")`, `.from("products")` call site: all writes live in `cabana-store.ts`'s
   `useCabanaMutations`, hard-scoped to `auth.uid()`.
2. **An admin cannot edit another creator's profile or links.** The only policies on
   `creator_profiles` are `insert`/`update` `with check (auth.uid() = user_id)`.
   `is_current_user_admin()` is **never referenced** in connection with `creator_profiles`, `links`,
   `products`, or `storage.objects`.
3. **An admin cannot read another user's email.** `profiles` is owner-only SELECT
   (`baseline.sql:259`) with no admin policy. A creator directory can show handle/name/bio/avatar
   (public data) but **not** email — and must not pretend to.
4. Verification and featured-creator curation have **no backing column or table**. The UI is fiction.
5. `processOutbox` breaks the audit invariant (Finding 2).

---

## 6. Existing Creator Link-Page Architecture

`/$username` (`src/routes/$username.tsx`) **is already a link-in-bio page.** It reads via
`useCreatorByHandle` (an explicit 13-column list — deliberately not `select *`, matching the anon
column grant), and renders banner, avatar, name, headline, bio, follower count, a tabbed body
(Posts / Media / Products), a subscribe panel, and a `LinksCard` rendering all `links` ordered by
`position`.

Three facts matter:

- **It is client-fetched, not SSR'd.** Only the OG/Twitter meta tags render server-side from the
  route param. The profile data arrives after hydration; first paint is a skeleton.
- **It is not `noindex`.** Unlike `/discover`, the public creator page is fully indexable.
- **The four bespoke pages (`thetejeda`, `danielasanchez`, `eldondolla`, `td`) are hardcoded React**
  — literal `LINKS`/`SOCIALS` arrays, hand-picked fonts, static image imports. **This is the
  current workflow for hand-building a creator page, and it is exactly the pain this project
  removes.** Every new creator today costs a source edit and a redeploy.

Editing surfaces today: `/dashboard/profile` (`ProfileEditor`), `/dashboard/links` (`LinkManager`,
framer-motion drag-reorder writing `links.position`), `/dashboard/storefront`, `/onboarding`.

**Theming is three axes, not a theme system:** `theme` (4 canned gradients), `accent_color` (6 preset
hexes or default, hex-CHECKed), `button_style` (rounded/pill/square). No typography, background, or
layout options.

**URL validation is client-only and inconsistent.** `isValidHttpUrl` (`cabana-validation.ts`) does
reject `javascript:` / `data:` — but only incidentally, because `normalizeUrl` force-prepends
`https://` before parsing. `LinkManager` calls it; **`onboarding.tsx` does not** (it blind-prefixes).
There is **no DB CHECK on `links.url`**, so a raw PostgREST insert can store `javascript:alert(1)`
verbatim. The render path (`$username.tsx:747`) only checks `startsWith("http")` — which neuters the
payload by accident, not by design.

---

## 7. Existing Database Support

### Already present — extend, don't rebuild

| Need | Status |
|---|---|
| Ordered custom links | **Yes** — `links.position integer not null default 0` |
| Handle uniqueness | **Yes** — `unique index creator_profiles_handle_lower_idx on (lower(handle))` |
| Reserved handles | **Yes** — `reserved_handles` + `validate_creator_handle()` BEFORE trigger |
| Admin role primitive | **Yes** — `is_current_user_admin()`, SECURITY DEFINER, `search_path=''` |
| Append-only audit + trigger pattern | **Yes** — `audit_logs` + `on_report_change_audit` / `on_payout_request_change_audit` |
| **Ownerless creator profile** | **Yes** — `creator_profiles.user_id` is **nullable**. The baseline comment says so explicitly: *"user_id is nullable to allow ownerless seed profiles (e.g. the `aurora` demo)."* The `aurora` seed row **is** an unclaimed page today. |
| Claim without orphaning a duplicate | **Yes** — `handle_new_user` (`20260512:112`) provisions `creator_profiles` **only when `account_type = 'creator'`**. A member signup creates no profile, so a claimer can attach to an admin-built page with nothing to merge. |
| Admin uploading media for a creator | **Yes, with no migration** — buckets are public and RLS only requires the first path segment to equal `auth.uid()`. An admin uploads to *their own* folder and writes the resulting public URL into the target profile's `avatar_url`. |

### Missing — forces a migration

- No admin write policy or RPC on `creator_profiles` / `links`.
- **No draft/publish concept at all.** Both tables' SELECT policies are `using (true)`. A row is
  public the instant it exists.
- **`public_creator_profiles` is `security_invoker = false`** (`20260513:386`, `20260530:34`) — it
  runs as the view *owner* and **bypasses base-table RLS**. Adding a draft filter to
  `creator_profiles` alone would **not** stop drafts leaking through `/discover`. **This is the
  easiest way to ship a leak in this project.**
- No `is_verified`, no featured-curation table, no invite/claim table.
- No typography/background fields; no `kind` discriminator for social vs custom vs contact links.
- No CHECK constraint on `links.url`.
- No admin SELECT policy on `profiles` (hence no email visibility).

---

## 8. Product Decision (recorded — decided by Tyler, July 14 2026)

- **Existing creator profiles and normal self-signups continue to default to `published`.**
- **Admin-created creator pages must explicitly start as `draft`.**
- **Self-signup behavior does not change in this phase.**

Implementation consequence: `creator_profiles.page_status` is added with **`default 'published'`**,
so every existing row and every future self-signup keeps today's exact behavior with no backfill.
The admin creation RPC explicitly inserts `'draft'`. Any other default would silently unpublish the
entire existing creator base.

---

## 9. Proposed Admin Creator Management

A new **`/admin/creators`** area behind the existing admin-only `AdminGate`.

- **Directory** (`/admin/creators`) — every creator: handle, name, avatar, claimed/unclaimed, page
  status, link count, created date. **Needs no migration**: `creator_profiles` already grants
  `authenticated` full-table SELECT under a `using (true)` policy. It cannot show emails
  (owner-only `profiles`) and must not fabricate them.
- **Detail/editor** (`/admin/creators/$creatorId`) — the link-page builder.
- Replace the fictional `/admin` **Users** tab with a real link here and delete the fake table.

**No impersonation, and no service-role in the browser.** Admin authority flows through
`is_current_user_admin()` inside SECURITY DEFINER RPCs, exactly like `admin_review_payout`. No token
minting, no `act-as` session, no client-supplied admin flag.

---

## 10. Proposed Link-Page Builder

Extend the existing tables; the existing `/$username` page renders the result.

| Control | Storage |
|---|---|
| Handle/slug | `creator_profiles.handle` (existing trigger enforces reserved + unique) |
| Display name, bio, headline | existing columns |
| Profile image, background image | `avatar_url`, `banner_url` (admin uploads to own folder) |
| Theme, accent, button style | existing 3 axes |
| **Typography, background style** | **new** `font_family`, `background_style` (CHECK-constrained like `button_style`) |
| Social links, custom buttons, contact button | **existing `links` table** + new `kind` column (`link` \| `social` \| `contact`) — no new table |
| Button label / destination / order | `links.title` / `links.url` / `links.position` (all existing) |
| Per-link visibility | **new** `links.is_visible boolean default true` |
| Featured content | existing `links.featured` |
| Storefront / subscription links | existing `products` / `creator_subscription_tiers` (unchanged) |

Desktop/mobile preview reuses the **real** `$username` render path in a width-constrained frame — not
a second renderer that can drift from production.

---

## 11. Draft, Publish, and Public URL Model

Add `creator_profiles.page_status` (`draft` | `published` | `archived`), **default `published`**
(see §8).

Replace the `using (true)` SELECT policies with **role-targeted, OR'd policies**. This shape is
load-bearing: `is_current_user_admin()` is revoked from `anon`, so a policy that `anon` evaluates
must never call it.

```sql
-- creator_profiles (links is structurally identical)
"Public can view published pages"  TO anon, authenticated  USING (page_status = 'published')
"Owners can view own page"         TO authenticated        USING (auth.uid() = user_id)
"Admins can view all pages"        TO authenticated        USING (is_current_user_admin())
```

**And update `public_creator_profiles` to filter `page_status = 'published'`.** Without this, drafts
leak into `/discover` regardless of the base-table policy, because the view is `security_invoker = false`.

- **Publish** → live at `https://cabanagrp.com/<handle>`.
- **Unpublish** → status flips to `draft`; the public policy stops matching; `/$username` renders its
  existing "Creator not found" branch. Access is removed cleanly — no cache purge, no URL rotation.

---

## 12. Creator Invite / Claim Model

**The architecture supports this safely, and it is recommended.** Two facts make it clean: `user_id`
is already nullable with a live ownerless precedent (`aurora`), and member signups create no
competing creator profile.

1. Admin builds and publishes an unclaimed page (`user_id IS NULL`).
2. Admin generates an invite. A **new `creator_invites` table** stores a **SHA-256 hash** of the
   token — never the raw value, which is shown to the admin exactly once. Columns:
   `creator_profile_id`, `email`, `expires_at`, `claimed_at`, `claimed_by_user_id`, `revoked_at`,
   `created_by`.
3. Creator opens `/claim/$token` and signs up (or in) as a **member** — so no duplicate profile is
   auto-provisioned by `handle_new_user`.
4. `claim_creator_profile(_token)` — SECURITY DEFINER — hashes the token, requires an unexpired,
   unrevoked, unclaimed invite, requires `auth.uid()` to not already own a creator profile, then sets
   `user_id = auth.uid()`, flips `profiles.account_type` to `creator`, marks the invite claimed, and
   writes an audit row. **Single-use.**
5. Admin retains management authority (the admin RPCs are role-based, not ownership-based) and can
   later transfer ownership or archive.

Explicitly **not** in this model: no impersonation, no shared credentials, no long-lived URL token
that survives use.

---

## 13. Authorization and Audit Model

- Authority is `public.user_roles.role = 'admin'`, read via the existing `is_current_user_admin()`.
  **No email appears anywhere in authorization logic** — `tyler.diorio@gmail.com` is merely the
  account that holds the row.
- **Every admin page mutation goes through a SECURITY DEFINER RPC** that raises
  `'Admin role required'` internally, mirroring `admin_review_payout`. Recommendation: do **not** add
  a broad admin UPDATE policy on `creator_profiles`, so raw PostgREST cannot become a second,
  unreviewed write path.
- **Audit generation stays at the DB layer**, per CABANA's established principle: `AFTER
  INSERT/UPDATE` triggers on `creator_profiles` and `links` append to the **existing** `audit_logs`
  with `target_type` of `creator_profile` / `creator_link` / `creator_invite`. Triggers fire
  uniformly regardless of write path — no second audit system.
- URL validation moves from advisory to enforced: a **DB CHECK on `links.url`** requiring
  `^https?://`, mirrored by the pure module. This closes the raw-PostgREST hole that exists today.
- Note: creator-page audit rows will be readable by **moderators** (the `is_current_user_staff`
  policy). That is likely acceptable, but it is the same untyped-policy issue as Finding 1 and should
  be fixed alongside it.

---

## 14. Schema Changes Required

**A migration is unavoidable.** Three, sequenced to the phases. All additive; none renames or drops.

**`20260537000000_creator_page_model.sql`** — `page_status` enum + column (default `published`);
`links.kind` + `links.is_visible`; `creator_profiles.font_family` + `background_style`
(CHECK-constrained); CHECK on `links.url`; audit triggers on both tables.
*No policy changes — pure data model, zero behavior change.*

**`20260538000000_admin_creator_management.sql`** — the role-targeted SELECT policies (§11); the
`public_creator_profiles` view filter; the admin RPCs (`admin_create_creator_page`,
`admin_update_creator_page`, `admin_set_page_status`, `admin_upsert_link`, `admin_reorder_links`,
`admin_delete_link`, `admin_transfer_page_ownership`), each admin-gated and audited.

**`20260539000000_creator_invites.sql`** — `creator_invites` (hashed tokens) +
`admin_create_creator_invite` + `claim_creator_profile`.

Each validated on local Docker (`bun run db:validate`) first. **Cloud apply only with explicit
approval, via the Management API pattern — never `supabase db push`.**

---

## 15. Routes and Screens

| Route | Screen |
|---|---|
| `/admin/creators` | Directory (search, filter by status/claimed) |
| `/admin/creators/new` | Create unclaimed page |
| `/admin/creators/$creatorId` | Link-page editor (identity · links · look · preview) |
| `/admin/creators/$creatorId/invite` | Generate/revoke invite; copy token once |
| `/claim/$token` | Public claim landing (`noindex`) |
| `/$username` | **Unchanged** — now respects `page_status` |

---

## 16. Server Actions

New `src/lib/admin-creator-actions.ts` — every action composes `attachSupabaseToken` +
`requireSupabaseAuth` and delegates to its admin-gated RPC:

`getAdminCreators` (**paginated via `.range()`, not a bare cap**), `getAdminCreatorDetail`,
`createCreatorPage`, `updateCreatorPage`, `setPageStatus`, `upsertCreatorLink`,
`reorderCreatorLinks`, `deleteCreatorLink`, `transferPageOwnership`, `createCreatorInvite`,
`revokeCreatorInvite`.

Plus `src/lib/creator-claim-actions.ts` → `claimCreatorProfile` (member-callable, not admin).

---

## 17. Exact Files to Add or Modify

**Add**
- `supabase/migrations/20260537000000_creator_page_model.sql`
- `supabase/migrations/20260538000000_admin_creator_management.sql`
- `supabase/migrations/20260539000000_creator_invites.sql`
- `supabase/tests/creator_page_admin.sql`, `supabase/tests/creator_invites.sql`
- `src/lib/cabana-creator-pages.ts` (**pure — joins the 95% coverage gate**) + `.test.ts`
- `src/lib/admin-creator-actions.ts`, `src/lib/creator-claim-actions.ts`, `src/lib/use-admin-creators.ts`
- `src/components/cabana/admin-creators/` — `CreatorDirectory`, `CreatorPageEditor`,
  `LinkListEditor`, `PageAppearanceEditor`, `PagePreview`, `PublishBar`, `InviteDialog`
- `src/routes/admin.creators.tsx`, `admin.creators.new.tsx`, `admin.creators.$creatorId.tsx`,
  `claim.$token.tsx`

**Modify**
- `vitest.config.ts` — add `cabana-creator-pages.ts` to `coverage.include`
- `src/routes/admin.tsx` — replace the fabricated Users tab with a real link to `/admin/creators`
- `src/routes/$username.tsx` — respect `page_status`; render `kind` / `is_visible`
- `src/lib/cabana-store.ts` — add `page_status` to the explicit public column list
- `CLAUDE.md`, `GEMINI.md`, `docs/CLAUDE_SESSION_HANDOFF.md`, `docs/CABANA_DATABASE.md`

---

## 18. Testing Strategy

- **Pure layer (95% gate)** — `cabana-creator-pages.ts`: handle normalization; reserved-handle
  rejection; URL scheme rejection (`javascript:`, `data:`, `vbscript:`); the page state machine
  (`draft→published→draft→archived`, illegal transitions denied); link ordering; invite lifecycle.
  Repository-injected, no DB.
- **Behavioral SQL** (`supabase/tests/`) — a non-admin cannot call any `admin_*` creator RPC; **a
  draft page is invisible to anon both on the base table AND through `public_creator_profiles`**;
  unpublish revokes access; a claim token is single-use and expires; a second claimer is rejected;
  every admin mutation produced an `audit_logs` row.
- **Components** — `renderToStaticMarkup` (vitest runs `environment: "node"`; no jsdom /
  testing-library). Assert the editor never renders a service-role value and that an unpublished page
  renders the not-found branch.
- **Post-deploy** — extend `scripts/smoke-prod.ts` with an anon check that a known draft handle 404s.

---

## 19. Migration Strategy

Local Docker first (`bun run db:reset` → `bun run db:validate`), behavioral tests green, then the
handoff gate (`bun run lint`, `bun run build`, `bunx tsc --noEmit`, `bun run test`).

Cloud apply **only on explicit approval**, one migration at a time via the Management API,
`20260537` → `20260538` → `20260539`. `20260537` is behavior-neutral and can land well ahead of the
others.

---

## 20. Phased Implementation Plan

| Phase | Deliverable | Migration |
|---|---|---|
| **1** | `/admin/creators` directory — live data, read-only, paginated; delete the fake Users tab | **None** |
| **2** | Admin creator-management server actions + admin RPCs + audit triggers | `20260537`, `20260538` |
| **3** | Ordered links & page settings data model (`kind`, `is_visible`, typography, background, URL CHECK) | in `20260537` |
| **4** | Admin link-page editor UI | none |
| **5** | Preview · draft · publish workflow | none |
| **6** | Public rendering honors `page_status` (+ view filter) | in `20260538` |
| **7** | Invite / claim flow | `20260539` |
| **8** | Production authorization hardening + end-to-end verification | none |

> **Status (2026-07-15):** Phases 1–6 and 8 SHIPPED via PR #25 (`main` `15cb8ad`). The migration numbering diverged from this plan: the shipped chain is `20260537` (creator-page visibility) → `20260538` (admin RPCs + audit) → `20260539` (audit-visibility restriction + role-management RPCs, **not** creator_invites) → `20260540` (one-page-per-owner uniqueness + owner-UPDATE / `links.profile_id` lockdown), all applied to cloud `20260540`. **Phase 7 (invite/claim, §12) did not ship — admin-created pages are ownerless drafts and a `claimed` status filter exists, but no invite/claim implementation. It remains the open follow-up.**

---

## 21. Release Blockers

1. **`public_creator_profiles` must be filtered** in the same migration that introduces
   `page_status`. It bypasses base-table RLS; skip it and every draft page is discoverable.
2. **`page_status` must default to `published`** (§8). Any other default silently unpublishes every
   existing creator.
3. **No admin write may land without its audit trigger.** Ship them in one migration.
4. **Moderator/finance audit asymmetry (Finding 1)** should be closed before more sensitive rows land
   in `audit_logs`.
5. `processOutbox` remains unaudited (Finding 2).
6. Admin reads must use `.range()`, not a bare cap — do not extend the existing truncation pattern
   into a new surface.
7. **Stream 5A.3 is uncommitted and 5B playback is incomplete.** CLAUDE.md prohibits deploying
   upload-only UI, so an admin-creator deploy must not drag the composer work along. Land 5A.3 on its
   own branch first.

---

## 22. Recommended First Checkpoint

**Phase 1 — `/admin/creators`, read-only, live data, zero migration.**

It is the only phase that ships real value with no schema risk: `creator_profiles` is already fully
readable by `authenticated`, so the directory can list every creator today. It proves the surface,
produces a real inventory of who exists, and lets us delete the fictional Users tab — the highest-
leverage honesty fix in the admin console. Every schema-bearing change then lands behind an approved
migration with behavioral tests.
