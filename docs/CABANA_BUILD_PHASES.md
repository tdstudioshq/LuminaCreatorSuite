# CABANA Build Phases

> The sequential engineering plan for the remainder of CABANA. Ten ordered phases, each with goal, files, database changes, components, routes, complexity, dependencies, and acceptance criteria.
>
> This is the authoritative **sequencing** document. Outcomes map to the product roadmap in [`CABANA_PRODUCT_SPEC.md`](./CABANA_PRODUCT_SPEC.md) §10; schema/API/route/component detail lives in the other blueprints. **Plan only — no phase is authorized to start by this document.**
>
> Hard guardrails carried from the session handoff: integer-cents money, demo monetization clearly labeled, RLS-ready ownership, `creator_subscriptions` (not `subscriptions`) for fan billing, never edit `routeTree.gen.ts`, no real payments/KYC/adult content until explicitly approved, no production tables before a validated baseline migration.

---

## Phase 0 (implicit) — Already done

Phase 1 foundation from the handoff: domain types (`cabana-types.ts`), demo data (`cabana-demo-data.ts`), `FoundationPage`, 9 placeholder routes, dashboard nav. Validation gate (`bun run lint` / `build` / `bunx tsc --noEmit`) passing.

---

## Phase 1 — Foundation Hardening & Demo UI Primitives

**Goal:** Stabilize the existing creator OS (fix dead buttons/`#` links, apply saved theme, banner upload, URL/delete validation, atomic reorder, real plan label, reconcile `/docs/data-model`) and turn the 9 placeholders into demo-data-driven UI using pure helpers. **No backend writes, no Supabase changes.** Establish the test runner.

**Files affected:** `src/lib/cabana-money.ts` _(new)_, `src/lib/cabana-entitlements.ts` _(new)_, `src/lib/cabana-permissions.ts` _(new)_; `dashboard.posts/subscribers/earnings/messages/notifications.tsx`; `feed/discover/messages/notifications.tsx`; `ProfileEditor.tsx`, `LinkManager.tsx`, `Sidebar.tsx`, `$username.tsx`; marketing CTA/footer fixes; `docs.data-model.tsx`; `package.json` (+ Vitest), `vite.config.ts`/test config.

**Database changes:** None.

**Components:** `PostCard`, `MemberProfileCard`, `SubscriberTable`, `TransactionTable`, `EarningsSummary`, `CreatorBalanceCard`, `NotificationList/Row`, `ConversationList`, `MessageThread`, `LockedContentGate` (demo). Shared `EmptyState`/`LoadingState`/`ErrorState`/`Money`. `BannerUpload`.

**Routes:** No new routes; 9 placeholders gain real demo content. Member placeholders stay public-safe (demo data only, nothing private).

**Estimated complexity:** Medium (broad but low-risk; no data layer changes).

**Dependencies:** Phase 0. Product decision on V1 boundary (spec §10) confirmed.

**Acceptance criteria:**

- Existing screens visually/functionally unchanged; no dead buttons or `#` links remain on shipped surfaces.
- New screens render from `CABANA_DEMO_DATA`; no private/real Supabase data loaded by member placeholders.
- Demo balances **derived** via `cabana-money.ts`; locked state from `cabana-entitlements.ts`; no mock action implies a real charge.
- Saved theme applied to public page; banner upload works; plan label reflects real data.
- Vitest set up; unit tests for money + entitlement rules pass.
- `bun run lint`, `bun run build`, `bunx tsc --noEmit` pass; mobile layouts usable; new controls have accessible labels.

---

## Phase 2 — Database Foundation, Member Accounts & Social Relationships

> **Split into 2A (infra), 2B (accounts), and 2C (relationships).**
>
> **Phase 2A — Supabase Baseline + CI — ✅ DONE.** Squashed rebuildable-from-zero baseline (`supabase/migrations/20260511000000_baseline.sql`) covering all existing tables/enums/functions/triggers/RLS/storage; demo `seed.sql`; `bun run db:validate` (reset-from-zero + `tests/smoke.sql`); CI (`.github/workflows/ci.yml`) running lint/typecheck/test/build + a Docker-based `db-validate` job. No new product tables, no `subscriptions` rename. See `supabase/README.md` and [`CABANA_DATABASE.md` §"Baseline migration"](./CABANA_DATABASE.md#baseline-migration-phase-2a). Open follow-ups: diff the reconstructed baseline against a live `supabase db dump`; confirm `major_version`; `migration repair` remote history.
>
> **Phase 2B — Member Accounts & Auth Infrastructure — ✅ DONE.** Migration `20260512000000_member_accounts.sql` adds account types and private member profiles; creator/member signup provisioning branches safely; `/account`, account-aware dashboard guards, protected account actions, and member RLS tests are live.
>
> **Phase 2C — Social Relationship Foundation — ✅ DONE.** Migration `20260513000000_social_relationships.sql` adds member usernames, `follows`, `blocks`, indexed FKs/uniqueness, complete owner/creator RLS, anonymous denial, and ID-free `public_creator_profiles` / `public_member_profiles`. Protected actions (`followCreator`, `unfollowCreator`, `blockUser`, `unblockUser`, relationship/count reads), hooks (`useRelationship`, `useFollow`), persistent creator-page follow state, unit tests, and `social_relationships.sql` are included.

**Goal:** Establish the reproducible database, account model, protected server-action tier, and
relationship graph required by every later social feature.

**Database changes:** Rebuildable baseline; `account_type`; private member profiles; member
usernames; `follows`; `blocks`; safe public profile views; RLS and behavioral SQL tests.

**Routes/components:** `/account` member foundation and persistent Follow/Following proof on
`/$username`. No feed or publishing UI.

**Acceptance criteria:** ✅ from-zero rebuild; ✅ creator/member branching; ✅ protected account and
relationship actions; ✅ persistent follows; ✅ private blocks; ✅ ID-free public views; ✅ policy
tests; ✅ CI validation.

---

## Phase 3 — Posts & Feed Foundation ✅ DONE

**Goal:** Add public/follower publishing and the first real feed on top of Phase 2C relationships.
No subscriptions, payments, messaging, or notifications.

**Delivered:** migration `20260514000000_posts_feed.sql` (`posts`, `post_media`, 3 enums, RLS,
`is_following_creator`/`can_view_post`, `feed_creator_posts`/`feed_home_posts`, private `post-media`
bucket); `cabana-posts.ts` (+ tests), `post-actions.ts`, `use-posts.ts`; `PostComposer`, `PostsDashboard`,
`PostCard`, `PostMediaGallery`, `PostVisibilityBadge`, `LockedContentGate`, `HomeFeed`; real
`/dashboard/posts`, `/feed`, and a posts section on `/$username`. Followers-only posts surface to
non-followers as locked stubs. Private media via authorization-gated signed URLs.

**Validation:** `posts_feed.sql` behavioral suite + smoke extensions; in `db:validate` and CI.

## Phase 3.2 — Engagement Foundation ✅ DONE

**Goal:** Add low-risk engagement primitives (comments, likes, saves) on top of the post system.
No monetization, messaging, notifications, or real-time.

**Delivered:** migration `20260515000000_engagement.sql` (`post_comments`, `post_likes`, `post_saves`,
`comment_status` enum, block-aware RLS, `is_engagement_blocked`/`is_current_user_post_owner`,
`post_engagement_state`/`post_comments_list`/`post_card` RPCs); `cabana-engagement.ts` (+ tests),
`engagement-actions.ts`, `use-engagement.ts`; `EngagementBar`, `CommentComposer`, `CommentList`,
`PostDetail`; new `/post/$postId` route; `PostCard` now shows like/comment/save.

**RLS guarantees:** engagement requires `can_view_post`; denied across a block; authors edit/soft-delete
own comments; creators hide comments on own posts; anon reads visible comments on public posts only and
cannot write. Likes/saves are unique per user/post and private.

**Validation:** `engagement.sql` behavioral suite + smoke extensions; in `db:validate` and CI.

**Next (gated):** Phase 4.

---

## Phase 4 — Creator Subscriptions & Mock Entitlements ✅ DONE (subscriptions slice)

**Goal:** Fan-to-creator subscriptions with **mock checkout** and server-resolved entitlements. Subscriber-only content actually gates on entitlement. No real money.

**Delivered (subscriptions + entitlement):** migration `20260516000000_creator_subscriptions.sql`
(`creator_subscription_status` enum, `creator_subscription_tiers`, `creator_subscriptions` with a unique
live pair, `is_active_subscriber`, and write/read RPCs); `subscribers` visibility wired into
`can_view_post` / `feed_creator_posts` / `post_card` (locked stubs for non-subscribers). `cabana-subscriptions.ts`
(+ tests), `subscription-actions.ts`, `use-subscriptions.ts`; `SubscriptionTierCard`,
`CreatorSubscribePanel` (mock-checkout dialog, "Demo" banner, no card fields), `SubscribersDashboard`;
real `/dashboard/subscribers`, subscribe panel on `/$username`, Subscribers option in the composer,
Subscribe CTA in `LockedContentGate`. The existing `subscriptions` table was **not** renamed.

**Validation:** `creator_subscriptions.sql` behavioral suite + smoke extensions + `posts_feed.sql` update;
in `db:validate` and CI.

**Deferred to Phase 6 (monetization ledger):** `transactions` / `tips` / `creator_balances` / `payouts`,
the `purchase` post-unlock visibility, and the `subscriptions`→`platform_subscriptions` rename.

### Original Phase 4 plan (full scope, for reference)

**Goal:** Fan-to-creator subscriptions with **mock checkout** and server-resolved entitlements. Subscriber-only content actually gates on entitlement. Demo tips and derived balances. No real money.

**Files affected:** `lib/cabana-subscriptions.ts`, `lib/cabana-entitlements.ts` (server-backed now), `lib/cabana-money.ts`; `dashboard.subscribers.tsx`, `dashboard.earnings.tsx`, `$username.tsx` (subscribe CTA, locked posts), `feed.tsx`.

**Database changes:** **Group C:** `creator_subscriptions`, `subscription_tiers`, `content_entitlements`. **Group E (mock):** `transactions`, `tips`, `creator_balances`. Rename plan: **`subscriptions` → `platform_subscriptions`** (with migration) before `creator_subscriptions` carries production data. RLS: members/creators read scoped rows; **status/ledger written by trusted server only**.

**Components:** `SubscriptionTierCard`, `SubscriptionStatusBadge`, `SubscriberTable`, `LockedContentGate` (server entitlement), `MockCheckoutDialog`, `TipComposer`, `TransactionTable`, `CreatorBalanceCard`.

**Routes:** `/creator/$username/subscribe`, `/settings/billing`, `/dashboard/subscribers/$subscriptionId`, `/dashboard/earnings/transactions`.

**Estimated complexity:** High (entitlement correctness + ledger immutability).

**Dependencies:** Phase 3 (members, posts, relationships, RLS, server actions). Mock-money rules from spec §7 / API §6.

**Acceptance criteria:**

- Mock checkout creates a `creator_subscription` + `succeeded` `transaction` + `content_entitlement`; balance updates by derivation; no real charge; visible "Demo" label.
- `subscribers`-visibility posts are viewable only with a valid entitlement (server-checked), invisible otherwise.
- Succeeded transactions immutable; balance never independently stored as truth.
- Subscription status transitions (`trialing→active→past_due→canceled`) work via server action.
- Entitlement + money unit tests pass.

---

## Phase 5 — Messaging

**Goal:** Real conversations and messages with participant-scoped RLS, Realtime delivery, read state, cursor pagination, and private attachments (with paid-message scaffolding, demo unlock).

**Files affected:** `lib/cabana-messaging.ts`; `messages.tsx`, `messages.$conversationId.tsx`, `dashboard.messages.tsx`, `dashboard.messages.$conversationId.tsx`.

**Database changes:** **Group D (messaging):** `conversations`, `conversation_participants` (explicit), `messages`. Private `message-attachments` bucket + signed URLs. RLS by participant membership. Indexes `(conversation_id, created_at DESC, id DESC)`.

**Components:** `ConversationRow`, `MessageThread`, `MessageBubble`, `MessageComposer`, `PaidMessageGate`, `TypingIndicator`.

**Routes:** `/messages/$conversationId`, `/dashboard/messages/$conversationId`.

**Estimated complexity:** High (Realtime + RLS + pagination + attachment authorization).

**Dependencies:** Phase 3 (members, relationships, posts, private storage), Phase 4 (entitlement for paid messages; message permissions in `settings`).

**Acceptance criteria:**

- Only participants read/send a conversation (RLS-enforced); Realtime delivers inserts + read-state.
- Cursor pagination on `(created_at, id)`; read receipts via `conversation_participants.last_read_message_id`.
- Attachments served by short-lived signed URLs after participant + unlock checks.
- Blocking + message-permission checks honored; rate limits applied.

---

## Phase 6 — Monetization Depth (Paid Content, Products → Orders)

**Goal:** Extend mock monetization to paid posts/unlocks and product orders with digital delivery; complete the ledger surface; introduce `media` moderation status. Still mock-money (real processor is Phase 7).

**Files affected:** `lib/cabana-orders.ts`, `lib/cabana-money.ts`, `StoreManager.tsx`, `$username.tsx`, `dashboard.earnings.tsx`.

**Database changes:** `orders`, `order_items`, `product_files`; extend `transactions` types (`product`, `post_unlock`, `paid_message`); `media.moderation_status` usage. RLS for orders (buyer/creator scoped reads, server writes).

**Components:** `MockCheckoutDialog` (extended), `EarningsSummary` (full), order/delivery UI, `LockedContentGate` for paid posts.

**Routes:** product detail/checkout under storefront; `/post/$postId` paid-unlock path.

**Estimated complexity:** Medium–High.

**Dependencies:** Phase 4 (transactions, entitlements), Phase 3 (private media for downloads).

**Acceptance criteria:**

- Paid post unlock and product order create immutable `transactions` + entitlements/orders; balance derives correctly.
- Digital downloads delivered via signed URLs only after a succeeded order.
- All amounts integer cents; demo labels present; succeeded values immutable.

---

## Phase 7 — Payments & Payouts (Real Money)

**Goal:** Replace mock money with a real processor (hosted checkout), connected creator accounts + KYC, immutable webhook-sourced ledger, payouts, refunds, disputes, reconciliation. **Requires explicit authorization to begin.**

**Files affected:** server actions for checkout/billing-portal/webhooks; `lib/cabana-payments.ts`; provider adapter modules; finance admin surfaces.

**Database changes:** `payouts`, `refunds`, `disputes`, `creator_verifications`, `webhook_events`, `outbox_jobs`; provider IDs on `transactions`/`creator_subscriptions`/`orders`. Idempotency constraints; reconciliation jobs.

**Components:** `CheckoutDialog` (real), `PayoutHistory`, connected-account/KYC status, finance dashboards.

**Routes:** `/dashboard/earnings/payouts`, billing portal entry, `/api/webhooks/$provider`.

**Estimated complexity:** **Very High** (financial correctness, compliance, idempotency, reconciliation).

**Dependencies:** Phases 4 & 6 accepted (mock ledger/entitlement/refund behavior proven); legal/KYC groundwork (Phase 11 items may interleave). Explicit go-ahead per guardrails.

**Acceptance criteria:**

- Webhooks are source of truth: signed, idempotent (`webhook_events`), processed via `outbox_jobs`.
- Card data never touches CABANA; provider-hosted collection only.
- Ledger immutable; balances reconcile against provider; failed renewals/grace/cancellation/refund/dispute/chargeback handled.
- Monetization gated by `monetization_status` + verification; payout flow with failure handling.
- Payment/webhook/idempotency tests pass.

---

## Phase 8 — Admin & Operations

**Goal:** Replace the hardcoded `/admin` with server-gated, URL-backed admin on real data: user/role management, verification review, metrics, audit-log viewer, with capability-scoped permissions and MFA for admins.

**Files affected:** `admin.tsx` → admin layout + subroutes; admin server actions; `lib/cabana-admin.ts`.

**Database changes:** `admin_users` (capability scopes), `audit_logs` (append-only) wired to every privileged action; server-side role validation.

**Components:** `AuditLogTable`, user/role tools, verification review, finance read tools (`TransactionTable` admin variant).

**Routes:** `/admin/users`, `/admin/audit`, `/admin/finance`, `/admin/verification` (URL-backed, server role gate).

**Estimated complexity:** High.

**Dependencies:** Phase 2 (server actions, roles), Phase 7 (finance data) for finance tools.

**Acceptance criteria:**

- All admin reads/writes are server-authorized (no client-only gate); service role never in browser.
- Every state-changing admin action appends an immutable `audit_logs` row.
- Capability scopes (moderator/support/finance/admin/super-admin) enforced; admin MFA required.
- No hardcoded admin data remains.

---

## Phase 9 — Moderation & Trust

**Goal:** Reports, blocks, suspensions, takedowns, appeals, and moderation queues on real data; media moderation workflow.

**Files affected:** moderation server actions; `lib/cabana-moderation.ts`; report entry points across post/comment/message/profile surfaces; admin report routes.

**Database changes:** **Group F:** `reports` (wired to queues), block/suspension enforcement in RLS, `media.moderation_status` gating publication. Indexes `reports (status, created_at)`.

**Components:** `ReportQueue`, `ReportDetail`, `ModerationActionDialog`; report buttons in content components.

**Routes:** `/admin/reports`, report flows from content.

**Estimated complexity:** Medium–High.

**Dependencies:** Phase 8 (admin shell, audit logs, capability scopes), Phase 3 (content), Phase 5 (message reports).

**Acceptance criteria:**

- Report → triage → temporary restriction → reviewer decision → notice → appeal → final action → audit, all persisted.
- Blocks/suspensions enforced by RLS, not just UI; media reviewed before publication where required.
- Moderator capability separated from finance/admin.

---

## Phase 10 — Notifications & Delivery

**Goal:** Durable notifications generated from server events, unread counts, notification center, and email/push via an outbox (independent of source transactions), with user preferences.

**Files affected:** notification triggers in server actions/handlers; `lib/cabana-notifications.ts`; `notifications.tsx`, `dashboard.notifications.tsx`; email provider adapter.

**Database changes:** `notifications` wired to event generation; `outbox_jobs` for email/push; partial index `WHERE read_at IS NULL`; `settings` notification preferences honored. Event dedup/aggregation ("12 people liked…").

**Components:** `NotificationList`, `NotificationRow`, `UnreadBadge`, `NotificationPreferences`.

**Routes:** member + creator notification centers become live (replace demo).

**Estimated complexity:** Medium.

**Dependencies:** Phases 2–9 (the events that generate notifications: follows, comments, subs, messages, tips, payouts, moderation). Outbox pattern from Phase 7.

**Acceptance criteria:**

- Notifications generated server-side for all event types; unread count via indexed query.
- Mark one/all read (owner RLS); preferences respected; email/push via outbox with retry; external failure never blocks the source write.
- High-volume events deduplicated/aggregated.

---

## Phase 11 — Compliance, Hardening & Launch

**Goal:** Launch-ready posture: legal/policy pages + acceptance records, creator KYC/tax, security/RLS review + pen-test, CSP and headers, advanced analytics, accessibility/perf passes, backups/DR, monitoring, controlled beta.

**Files affected:** legal routes; acceptance-record server actions; security headers/CSP config; analytics ingestion; observability wiring.

**Database changes:** policy-acceptance records (version + timestamp); tax/earnings reporting aggregates; retention schedules; complete RLS audit.

**Components:** legal pages, consent/acceptance UI, age-gate, enhanced analytics surfaces.

**Routes:** `/terms`, `/privacy`, `/creator-agreement`, `/dmca`, `/refunds`, `/content-policy`.

**Estimated complexity:** High (breadth + non-engineering coordination).

**Dependencies:** All prior phases (esp. 7 for tax/KYC, 9 for DMCA/takedown).

**Acceptance criteria:**

- Legal pages published; acceptance recorded with version/timestamp before monetization.
- Security/RLS review + pen-test complete; CSP + headers in place; server-side upload validation.
- Accessibility + performance passes; backups/PITR + DR runbook tested; monitoring/error-tracking/uptime/alerting live.
- Controlled beta launched with support + incident procedures.

---

## Dependency Graph (summary)

```
P1 ─▶ P2 ─▶ P3 ─┬─▶ P4 ─▶ P6 ─▶ P7 ─▶ P8 ─▶ P9
                └─▶ P5 ────────────────┘       ╲
                └──────────────────────────────▶ P10 ─▶ P11
```

P2 is the account/relationship keystone; P3 adds publishable content. P7 (real money) must not
precede acceptance of P4/P6 mock behavior. P10 trails the event-producing phases. P11 closes out.

## Cross-Phase Definition of Done (every phase)

`bun run lint` + `bun run build` + `bunx tsc --noEmit` pass · new tables have RLS + policy tests · money is integer cents · privileged writes audit-logged · no service-role key in client code · demo monetization labeled · CI green · end-of-session handoff updated (files changed, schema touched, demo vs prod, results, next task).
