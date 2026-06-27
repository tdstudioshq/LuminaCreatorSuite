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

## Latest Status — Phase 11A COMPLETE (Creator Dashboard Foundation)

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
