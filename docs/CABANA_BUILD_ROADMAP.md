# CABANA Build Roadmap

> Phase 1 foundation plan
>
> Last updated: June 25, 2026
>
> **Status (July 8, 2026): this plan is fully executed.** The build has since shipped through Phase 11B
> (posts, engagement, subscriptions, messaging, ledger, notifications, moderation, admin finance/payouts,
> discovery, dashboard, analytics — all demo-money). §§2–3, the §6 route table, and §15 describe the
> **June 2026 starting state**, not the current app. Current status lives in
> [`CLAUDE.md`](../CLAUDE.md), [`CABANA_BUILD_PHASES.md`](./CABANA_BUILD_PHASES.md), and
> [`CABANA_PROJECT_STATE.md`](./CABANA_PROJECT_STATE.md).
>
> Source of truth: [`CABANA_ARCHITECTURE.md`](../CABANA_ARCHITECTURE.md)

## 1. Current App Summary

CABANA is an existing TanStack Start and React creator operating system with a working luxury visual system, Supabase authentication, public creator profiles, links, product cards, image uploads, and first-party click analytics.

The current product is creator-first. It behaves primarily as a premium link-in-bio, storefront, media-kit, and analytics SaaS. It is not yet a member subscription network: there is no member account model, social post model, content entitlement system, inbox, notification center, creator earnings ledger, or real payment workflow.

The expansion strategy is additive:

1. Preserve all existing creator OS functionality.
2. Introduce shared domain contracts and demo data.
3. Establish non-functional but route-complete UI foundations.
4. Add Supabase tables and RLS in dependency order.
5. Add mock monetization and entitlement logic.
6. Replace mock state with production services only after the product rules are stable.

Phase 1 does not alter the current remote Supabase schema and does not move money.

## 2. What Already Exists

### Product surfaces

- Marketing landing page.
- AI marketing page.
- Pricing page.
- Signup, login, logout, and password recovery.
- Seven-step onboarding demo.
- Public creator page at `/$username`.
- Seeded `/demo` creator profile.
- Bespoke `/td` and `/eldondolla` creator pages.
- Authenticated creator Studio.
- Role-gated admin demo.

### Creator Studio

- Overview metrics.
- Profile, bio, handle, avatar, and theme editing.
- Link creation, editing, deletion, featuring, and reordering.
- Product creation, editing, image upload, and deletion.
- Page-view, link-click, and product-click analytics.
- Media-kit demo.
- AI copy demo.
- Settings/integration demo.

### Platform foundation

- React 19 and TanStack Start.
- File-based TanStack Router routes.
- TanStack Query.
- Tailwind CSS 4 and the CABANA token system.
- Framer Motion.
- Supabase Auth, PostgreSQL, Storage, and RLS.
- User-role table with `admin`, `moderator`, and `user`.
- Cloudflare-compatible Lovable deployment.

## 3. What Is Missing

### Member product

- Member profiles and privacy settings.
- Member authentication role/upgrade flow.
- Feed and discovery data.
- Persistent follows.
- Likes, saves, and comments.
- Creator subscriptions and content entitlements.
- Member billing and purchase history.

### Creator publishing

- Posts and post-media records.
- Draft, scheduled, published, and archived states.
- Public, follower, subscriber, and individual-purchase visibility.
- Content upload and processing.
- Subscriber management.
- Creator message permissions.

### Monetization

- Fan-to-creator subscriptions.
- Locked posts and media.
- Tips.
- Paid messages.
- Transactions and immutable creator earnings.
- Creator balances and payout records.
- Refund, dispute, and chargeback handling.

### Communication

- Conversations and participants.
- Messages and attachments.
- Read state.
- Real-time delivery and typing.
- Notification records and triggers.

### Trust and operations

- Reports.
- Blocks and account restrictions.
- Real moderation queues.
- Admin actions.
- Audit logs.
- Complete reproducible Supabase migrations.

## 4. Recommended Module Expansion

New modules should be organized by business boundary rather than by page.

```text
src/
├── components/cabana/
│   ├── foundation/        # Phase 1 route foundations
│   ├── posts/             # Future composer, cards, media, comments
│   ├── members/           # Member identity and subscriber lists
│   ├── messaging/         # Inbox, conversation, composer
│   ├── notifications/     # Notification list, badge, preferences
│   ├── monetization/      # Subscription, transaction, balance UI
│   └── moderation/        # Reports and admin review UI
├── lib/
│   ├── cabana-types.ts
│   ├── cabana-demo-data.ts
│   ├── cabana-entitlements.ts      # Future pure entitlement rules
│   ├── cabana-money.ts             # Future integer-money helpers
│   └── cabana-permissions.ts       # Future frontend capability hints
└── routes/
    ├── feed.tsx
    ├── discover.tsx
    ├── messages.tsx
    ├── notifications.tsx
    └── dashboard.*.tsx
```

Backend access should be split into:

- Public/RLS-safe read modules.
- Authenticated owner CRUD modules.
- Trusted server actions for entitlements, financial state, admin actions, and signed URLs.
- Provider adapters for future payment, email, and media services.

## 5. Database Expansion Plan

Do not replace the existing schema. Add tables in dependency groups after a complete baseline migration of the current remote database has been captured.

### Group A — Identity and social graph

1. `member_profiles`
2. `follows`
3. Optional future `blocks`

This group establishes member identity and persistent creator relationships without monetization.

### Group B — Publishing

1. `posts`
2. `post_media`
3. `comments`
4. `likes`
5. `saves`

This group can support public posts before private subscriptions are active.

### Group C — Creator subscriptions

1. `creator_subscriptions`
2. Future `content_entitlements`

The existing `subscriptions` table is CABANA platform billing. It should eventually be renamed to `platform_subscriptions` before `creator_subscriptions` becomes production data.

### Group D — Messaging and activity

1. `conversations`
2. Future `conversation_participants`
3. `messages`
4. `notifications`

Conversation participant membership must be explicit in production even though the Phase 1 TypeScript demo type stores participant IDs directly.

### Group E — Mock monetization ledger

1. `transactions`
2. `tips`
3. `creator_balances`
4. `payouts`

Mock transactions must still behave like immutable financial records. UI actions can create demo records, but settled values should never be edited in place.

### Group F — Trust and operations

1. `reports`
2. `audit_logs`
3. Future verification, webhook-event, and outbox-job tables

## 6. Frontend Route Plan

### Phase 1 routes added

| Route                      | Audience                 | Phase 1 state      |
| -------------------------- | ------------------------ | ------------------ |
| `/dashboard/posts`         | Creator                  | Luxury placeholder |
| `/dashboard/subscribers`   | Creator                  | Luxury placeholder |
| `/dashboard/messages`      | Creator                  | Luxury placeholder |
| `/dashboard/earnings`      | Creator                  | Luxury placeholder |
| `/dashboard/notifications` | Creator                  | Luxury placeholder |
| `/feed`                    | Public/member foundation | Luxury placeholder |
| `/discover`                | Public/member foundation | Luxury placeholder |
| `/messages`                | Member foundation        | Luxury placeholder |
| `/notifications`           | Member foundation        | Luxury placeholder |

### Future route expansion

```text
/post/$postId
/creator/$username/subscribe
/settings/member
/settings/billing
/messages/$conversationId
/dashboard/posts/new
/dashboard/posts/$postId/edit
/dashboard/subscribers/$subscriptionId
/dashboard/messages/$conversationId
/dashboard/earnings/transactions
/dashboard/earnings/payouts
/admin/reports
/admin/audit
```

Public member routes should eventually use an authenticated member layout. Creator routes remain under the existing `/dashboard` layout. Admin routes should eventually move from local tabs to URL-backed subroutes.

## 7. Component Plan

### Phase 1

- `FoundationPage`
  - Reusable CABANA-styled status screen.
  - Supports public pages with `GlobalNav`.
  - Supports dashboard pages inside the existing dashboard layout.
  - Clearly identifies inactive demo behavior.

### Publishing components

- `PostCard`
- `PostMediaGallery`
- `PostVisibilityBadge`
- `PostComposer`
- `PostSchedulePanel`
- `CommentList`
- `CommentComposer`
- `EngagementActions`

### Member/subscriber components

- `MemberAvatar`
- `MemberProfileCard`
- `FollowButton`
- `SubscriberTable`
- `SubscriptionStatusBadge`
- `SubscriptionTierCard`
- `LockedContentGate`

### Messaging components

- `ConversationList`
- `ConversationRow`
- `MessageThread`
- `MessageBubble`
- `MessageComposer`
- `PaidMessageGate`
- `TypingIndicator`

### Notifications components

- `NotificationList`
- `NotificationRow`
- `UnreadBadge`
- `NotificationPreferences`

### Monetization components

- `EarningsSummary`
- `TransactionTable`
- `CreatorBalanceCard`
- `PayoutHistory`
- `TipComposer`
- `MockCheckoutDialog`

### Admin and moderation components

- `ReportQueue`
- `ReportDetail`
- `ModerationActionDialog`
- `AuditLogTable`

Components should accept typed records and callbacks. They should not import Supabase directly unless they are explicit data-bound containers.

## 8. Supabase Table Plan

The following is a table contract plan, not a Phase 1 migration.

| Table                   | Core ownership                       | Required indexes                                  | Initial RLS intent                                                  |
| ----------------------- | ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------- |
| `member_profiles`       | `user_id`                            | unique `user_id`, unique lower username           | Public-safe profile fields readable; owner updates                  |
| `posts`                 | creator through `creator_profile_id` | creator/status/published cursor                   | Public rows readable; restricted rows entitlement-gated; owner CRUD |
| `post_media`            | post creator                         | `post_id, position`; `owner_user_id`              | Same access as parent post; owner writes                            |
| `comments`              | author; creator moderates            | `post_id, created_at, id`; `user_id`              | Read if post readable; author creates/edits; creator can hide       |
| `likes`                 | `user_id`                            | unique user/post; `post_id`                       | User owns write; aggregate-safe reads                               |
| `saves`                 | `user_id`                            | unique user/post; `user_id, created_at`           | Private to owner                                                    |
| `follows`               | follower                             | unique follower/creator; creator/follower indexes | Follower creates/deletes; creator reads follower list               |
| `creator_subscriptions` | member and creator                   | unique active pair; creator/status; member/status | Member and creator read scoped records; server writes status        |
| `conversations`         | participants                         | `last_message_at, id`                             | Participants only                                                   |
| `messages`              | sender within conversation           | `conversation_id, created_at, id`                 | Participants read; participant sends                                |
| `notifications`         | recipient                            | unread partial index; recipient cursor            | Recipient only                                                      |
| `tips`                  | sender/creator through transaction   | creator/date; sender/date                         | Parties read; trusted server creates final state                    |
| `transactions`          | parties, server-authoritative        | provider ref unique; creator/date; payer/date     | Parties read limited fields; trusted server writes                  |
| `creator_balances`      | creator                              | unique creator/currency                           | Creator reads; trusted server updates                               |
| `payouts`               | creator                              | creator/date; pending status partial              | Creator reads; finance server/admin writes                          |
| `reports`               | reporter/admin                       | status/date; subject index                        | Reporter creates/views own; moderators manage                       |
| `audit_logs`            | system/admin                         | actor/date; target/date                           | Admin read by capability; append-only server writes                 |

### Supabase conventions

- Use UUID or time-ordered UUID identifiers consistently.
- Use `timestamptz`.
- Store money as integer minor units plus currency.
- Index every foreign key.
- Use composite indexes matching cursor and status queries.
- Use partial indexes for unread notifications and pending payouts/reports.
- Wrap `auth.uid()` in `select` inside RLS policies for stable performance.
- Keep service-role access in trusted server code only.
- Use public-safe views instead of `select("*")` for creator/member discovery.

## 9. Mock Monetization Plan

Phase 1 and the next demo phase must not call a payment provider.

### Demo rules

- All demo monetary values use integer cents.
- All demo provider IDs begin with `mock_`.
- Demo actions display a visible “Demo” label.
- No card fields or bank-account fields are collected.
- Demo transactions are deterministic and local or stored in clearly identified demo tables.
- Mock subscriptions can transition among `trialing`, `active`, `past_due`, and `canceled`.
- Mock transaction status can transition from `pending` to `succeeded` or `failed`, but succeeded amounts are immutable.
- Creator balance is derived from succeeded transactions minus fees, refunds, and demo payouts.
- Mock payout requests never leave CABANA.

### Demo flows

1. Member selects a creator tier.
2. Mock checkout summarizes recurring price and confirms no real charge.
3. A demo creator subscription record is created.
4. A succeeded demo transaction is created.
5. The creator balance projection updates.
6. Creator and member receive demo notifications.
7. Entitlement helper grants subscriber content in demo mode.

The mock data layer added in Phase 1 provides members, posts, subscriptions, transactions, and notification records for these screens.

## 10. Messaging Plan

### Phase 1

- Add conversation and message TypeScript contracts.
- Add deterministic demo conversations and messages.
- Add creator and member placeholder routes.
- Do not expose private messages or connect Realtime.

### Demo implementation phase

- Build inbox and thread UI from demo data.
- Add local send, read, and unread state.
- Add mock message permission checks.
- Add disabled attachment and paid-message controls with clear demo labels.

### Supabase implementation phase

- Add `conversation_participants`.
- Require participant membership through RLS.
- Use cursor pagination on `(created_at, id)`.
- Use Supabase Realtime for message inserts and read-state updates.
- Use private storage and signed URLs for attachments.
- Add rate limits, blocking, reporting, and spam controls.

## 11. Notifications Plan

### Phase 1

- Add notification TypeScript contracts and demo records.
- Add creator and member placeholder routes.

### Demo implementation phase

- Build notification lists and unread badges.
- Support local mark-read and mark-all-read interactions.
- Link demo notifications to safe existing/placeholder routes.

### Supabase implementation phase

- Generate notification rows from trusted event handlers.
- Index `(user_id, created_at desc)` and unread rows.
- Aggregate noisy events where appropriate.
- Add an outbox for transactional email and future push delivery.
- Keep external delivery failure independent from the source transaction.

## 12. Admin Portal Plan

The current `/admin` route is role-gated but its content and actions are hardcoded.

### Expansion order

1. Add URL-backed admin routes.
2. Add read-only report and audit-log tables.
3. Replace overview metrics with server-only queries.
4. Add report triage and resolution.
5. Add member/creator restrictions and restoration.
6. Add creator-subscription and mock-transaction inspection.
7. Add mock payout review.
8. Add verification and feature-curation workflows.

### Permission boundaries

- Moderator: reports, content restrictions, appeals.
- Support: account lookup and non-financial assistance.
- Finance: transactions, balances, payouts, refunds.
- Admin: roles, policy, platform configuration.
- Super-admin: rare role/capability administration.

All admin mutations must be server-authorized and append an `audit_logs` record.

## 13. Security/RLS Plan

### General rules

- Enable RLS on every new user, creator, message, notification, and financial table.
- Treat frontend role checks as UX only.
- Use explicit column lists and public-safe views.
- Never expose service-role keys or provider secrets.
- Validate input again on the server.

### Ownership rules

- Member profiles: owner updates; only approved public fields are discoverable.
- Creator posts: creator owns writes; visibility and entitlement determine reads.
- Comments: author owns edits; post creator can moderate visibility.
- Likes/follows/saves: authenticated user owns writes.
- Saves: private to the member.
- Conversations/messages: participants only.
- Notifications: recipient only.
- Transactions/balances/payouts: parties receive restricted reads; trusted server owns writes.
- Reports: reporter can create/view own; moderators can review.
- Audit logs: trusted append-only writes; privileged reads.

### Performance rules

- Index all ownership and foreign-key columns.
- Use `(select auth.uid())` in RLS predicates.
- Avoid per-row recursive role lookups; use stable security-definer helpers with fixed `search_path` when needed.
- Use partial indexes for unread notifications, active subscriptions, open reports, and pending payouts.
- Test policies with guest, member, creator, moderator, and admin fixtures.

## 14. Step-by-Step Build Order

### Completed in Phase 1 foundation

1. Added the subscription-platform domain type file.
2. Added deterministic demo data generators.
3. Added shared luxury foundation screen.
4. Added creator dashboard placeholder routes.
5. Added public/member placeholder routes.
6. Added dashboard navigation entries only for routes that exist.
7. Documented the database, RLS, monetization, messaging, notification, and admin plan.

### Phase 1B — demo UI primitives ✅ done

1. Add pure money and entitlement helpers.
2. Add demo post cards and member cards.
3. Render demo posts in `/dashboard/posts`.
4. Render demo subscribers in `/dashboard/subscribers`.
5. Render demo transactions and balances in `/dashboard/earnings`.
6. Render demo inbox and notification lists.
7. Add component/unit tests for demo state transitions.

### Phase 2 — database foundation ✅ done (executed as Phases 2A–2C + 3/3.2)

1. Capture a complete current Supabase baseline migration.
2. Rebuild a clean local/staging instance from zero.
3. Add `member_profiles` and role modeling.
4. Add social/publishing tables.
5. Add RLS and policy tests.
6. Add private post-media storage.
7. Replace demo public post reads with RLS-safe queries.

### Phase 3 — subscriptions and mock entitlements ✅ done (executed as Phases 4 + 6, demo-only)

1. Add creator tiers.
2. Add mock creator subscriptions and transactions.
3. Add entitlement checks.
4. Add subscriber-only post rendering.
5. Add demo tips and balances.

### Phase 4 — messaging and notifications ✅ done (executed as Phases 5 + 7/9A/9B; email/push providers still gated)

1. Add production tables and RLS.
2. Add participant-scoped messaging.
3. Add Realtime.
4. Add notification triggers/outbox.

### Phase 5 — admin and moderation ✅ done (executed as Phases 8–8C)

1. Add reports/audit tables.
2. Replace hardcoded admin panels.
3. Add moderation capabilities and audit trails.

### Later — real payments

Real payment and payout providers are intentionally excluded until mock transaction, entitlement, refund, and ledger behavior is accepted.

## 15. Risks and Assumptions

### Risks

- The checked-in Supabase migrations are not a complete rebuildable baseline.
- Existing public creator reads expose fields that should be hidden by a public-safe view.
- Existing public storage is unsuitable for premium media.
- The current `subscriptions` name conflicts with future creator subscriptions.
- The app currently creates creator accounts for every signup.
- Public member routes do not yet require authentication.
- Mock financial state can be mistaken for real state if demo labeling is inconsistent.
- Dashboard navigation density increases before modules are complete.
- Special creator pages bypass the shared creator profile model.
- Current admin screens visually imply capabilities that do not exist.

### Assumptions

- Existing CABANA creator OS behavior remains supported.
- The luxury dark visual system remains the default.
- Supabase remains the preferred backend.
- Member and creator experiences will share one authentication system.
- Creator subscriptions are separate from CABANA platform plan subscriptions.
- Phase 1 routes are intentionally placeholders.
- No real payment, payout, KYC, or adult-content workflow is authorized in this phase.
- Future private content uses private storage and signed URLs.
- Production financial records are written by trusted server functions/webhooks, not direct browser mutations.

## Phase 1 Files Added

```text
docs/CABANA_BUILD_ROADMAP.md
src/lib/cabana-types.ts
src/lib/cabana-demo-data.ts
src/components/cabana/foundation/FoundationPage.tsx
src/routes/dashboard.posts.tsx
src/routes/dashboard.subscribers.tsx
src/routes/dashboard.messages.tsx
src/routes/dashboard.earnings.tsx
src/routes/dashboard.notifications.tsx
src/routes/feed.tsx
src/routes/discover.tsx
src/routes/messages.tsx
src/routes/notifications.tsx
```
