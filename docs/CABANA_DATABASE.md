# CABANA Database Specification

> Target production schema for the full creator-subscription platform, plus the documented current state.
>
> This document records the implemented schema through Phase 2C and plans later additions. The
> Phase 2A baseline, Phase 2B member accounts, and Phase 2C relationship migration rebuild cleanly
> from zero. No posts, messaging, payments, or `creator_subscriptions` are authorized without
> explicit approval and an RLS/test plan.
>
> Conventions: UUID (prefer time-ordered, e.g. UUIDv7, for high-volume event/message tables) primary keys · `timestamptz` everywhere · money as **integer minor units (cents) + explicit `currency`** · index every foreign key · RLS predicates use `(select auth.uid())`.

---

## 1. Current Implemented Schema

Source: checked-in migrations plus `src/integrations/supabase/types.ts`. Eleven tables, two enums,
safe public profile views, and protected database helpers. Phase 2B/2C type additions are
hand-maintained pending Lovable regeneration.

| Table              | Columns (current)                                                                                                                   | Notes                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `profiles`         | `id` (=auth.users.id), `email`, `name`, `account_type`, `created_at`, `updated_at`                                                  | Shared identity row; `account_type` defaults to `creator`                               |
| `creator_profiles` | `id`, `user_id` (nullable!), `handle`, `name`, `bio`, `avatar_url`, `banner_url`, `theme`, `plan`, `created_at`, `updated_at` (+ `headline`, `accent_color`, `button_style` from `20260528`) | Public creator surface. `user_id` nullable allows the ownerless `aurora` demo seed. **anon SELECT is column-scoped** (`20260532`) to the public columns — `user_id` is not anon-readable; `authenticated` keeps full-table SELECT |
| `member_profiles`  | `id`, `user_id`, `username`, `display_name`, `bio`, `avatar_url`, timestamps                                                        | Full row owner-only; safe public subset is exposed through `public_member_profiles`     |
| `follows`          | `id`, `follower_id` → profiles, `following_creator_id` → creator_profiles, `created_at`                                             | Unique account→creator relationship; authenticated-only base table                      |
| `blocks`           | `id`, `blocker_id` → profiles, `blocked_user_id` → profiles, `reason`, `created_at`                                                 | Unique private account→account relationship; authenticated-only base table              |
| `links`            | `id`, `profile_id` → creator_profiles, `title`, `url`, `icon`, `featured`, `scheduled` (text!), `position`, `clicks`, `created_at`  | `scheduled` is a label, not a timestamp                                                 |
| `products`         | `id`, `profile_id` → creator_profiles, `title`, `price` (text!), `type` (text), `image_url`, `sales`, `position`, `created_at`      | `price` is a display string; no checkout linkage                                        |
| `analytics_events` | `id`, `profile_id` (nullable) → creator_profiles, `event_type`, `target_id` (nullable), `metadata` (json), `created_at`             | Anonymous inserts allowed for any real profile                                          |
| `subscriptions`    | `id`, `user_id`, `plan`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`, `created_at`, `updated_at` | **CABANA SaaS plan, NOT fan subscription.** Rename target: `platform_subscriptions`     |
| `user_roles`       | `id`, `user_id`, `role` (enum `app_role`), `created_at`                                                                             | Authorization                                                                           |
| `reserved_handles` | `handle` (PK)                                                                                                                       | Blocked usernames                                                                       |

**Enums:** `app_role` (`admin` | `moderator` | `user`) and `account_type` (`creator` |
`member`). **Public views:** `public_creator_profiles`, `public_member_profiles`. Relationship RPCs
accept creator usernames and derive the actor from `auth.uid()`; they never return UUIDs.

**Known current-schema weaknesses** (carried into tech debt): prices/scheduling stored as strings;
no post/publish model; `creator_profiles.user_id` still nullable (ownerless demo seed). The public
`select("*")` **user_id leak is fixed**: migration `20260532` replaces the anon table-wide
SELECT on `creator_profiles` with a **column-scoped** anon SELECT on the 13 public columns only
(`user_id` excluded); the `Public can view creator profiles` policy is unchanged and `authenticated`
keeps full-table SELECT for owner reads. `subscriptions` name collides with future fan subscriptions.

<a id="baseline-migration-phase-2a"></a>

### Baseline migration (Phase 2A)

`supabase/migrations/20260511000000_baseline.sql` is a **squashed, rebuildable-from-zero** reconstruction of the entire current schema. The four original incremental migrations were not self-sufficient (they `ALTER`ed tables whose `CREATE` statements lived only in the remote project), so they are archived under `supabase/_archive/pre_baseline_migrations/` for reference and the baseline supersedes them.

**Objects covered by the baseline:** all 8 tables · enum `app_role` · functions `handle_new_user`, `has_role(uuid, app_role)`, `validate_creator_handle`, `touch_updated_at` · triggers `on_auth_user_created` (signup provisioning → profile + creator_profile + free `subscriptions` + `user` role), `updated_at` touches on profiles/creator_profiles/subscriptions, and `validate_creator_handle_trigger` · RLS on every table (public read on creator_profiles/links/products, owner writes, tightened analytics insert, owner-read analytics, owner-read subscriptions, role policies) · unique `lower(handle)` index · 3 public storage buckets (`avatars`, `banners`, `products`) with owner-scoped object policies · reserved-handle seed data · SECURITY DEFINER `revoke execute` hardening. Demo data (`aurora` + links/products) lives in `supabase/seed.sql`.

**Validation:** `bun run db:validate` resets a local instance from zero and runs `supabase/tests/smoke.sql`. Requires Docker; runs in CI (`.github/workflows/ci.yml` → `db-validate` job). See `supabase/README.md`.

**Known risks / not yet done:** (1) The baseline was **reconstructed from `types.ts` + the incremental migrations**, not dumped from the live DB (no DB access in the authoring environment) — it must be diffed against a real `supabase db dump` before being trusted as byte-exact. (2) Postgres `major_version` in `config.toml` is set to 15; confirm against the remote. (3) Remote migration history still lists the 4 incrementals — run `supabase migration repair --status applied 20260511000000` after verifying, so the squash isn't re-applied (see `supabase/README.md`).

<a id="member-accounts-phase-2b"></a>

### Member accounts migration (Phase 2B)

`supabase/migrations/20260512000000_member_accounts.sql` is the first **additive** migration on top of the baseline. It does **not** rename `subscriptions` or add `creator_subscriptions`/posts/messaging/payments.

**Objects added:**

- **Enum `account_type`** (`creator` | `member`).
- **`profiles.account_type`** — `NOT NULL DEFAULT 'creator'`. The default is the explicit, documented branch: existing rows and any signup without `account_type='member'` stay creators, so all current behavior is preserved.
- **`member_profiles`** — `id`, `user_id` (unique → auth.users, cascade), `display_name`, `bio`, `avatar_url`, timestamps. Private: no public read. RLS = owner-only select/insert/update (no delete; rows removed via the auth.users cascade), plus `updated_at` touch trigger.
- **Table grants** — explicit `GRANT select, insert, update … TO authenticated` and `REVOKE ALL … FROM anon` so member data is private at the grant level (defense in depth), independent of Supabase default privileges.
- **`handle_new_user` branch** — creator → `profiles` + `creator_profiles` + free `subscriptions` + `user` role (unchanged); member → `profiles` + `member_profiles` + `user` role (no creator profile / platform subscription). Re-asserts the SECURITY DEFINER `revoke execute`.
- **Reserved handles** — `account`, `member` added so the member-route slugs can't be claimed as creator handles.

**Validation:** `tests/smoke.sql` asserts the table/enum/column/RLS presence; **`tests/member_accounts.sql`** behaviorally proves trigger branching (creator vs member provisioning) and member RLS (owner-scoped reads/writes; `anon` denied). Both run in `db:validate` (host `psql`) and in CI. Verified from-zero on Docker.

> **Note on `types.ts`:** the generated `src/integrations/supabase/types.ts` was hand-extended with `member_profiles`, `profiles.account_type`, and the `account_type` enum (clearly commented), since Lovable Cloud regeneration requires remote access that is deferred. Reconcile on the next regeneration.

<a id="social-relationships-phase-2c"></a>

### Social relationship migration (Phase 2C)

`supabase/migrations/20260513000000_social_relationships.sql` adds the social graph without posts,
feeds, messaging, notifications, subscriptions, or payments.

- **`member_profiles.username`** — required lowercase public username, generated during member
  signup, validated against the reserved-handle set, and case-insensitively unique.
- **`follows`** — unique (`follower_id`, `following_creator_id`), cascading FKs, reverse index for
  follower counts. RLS allows users to select/insert/delete their own follows and creators to select
  rows targeting their creator profile. Anonymous access is revoked.
- **`blocks`** — unique (`blocker_id`, `blocked_user_id`), no-self check, optional reason capped at
  280 characters, reverse FK index. Only the blocker can select/insert/delete; anonymous access is
  revoked.
- **Safe views** — `public_creator_profiles` and `public_member_profiles` expose only username,
  display name, avatar/banner, bio, a placeholder verification flag, a **real published-post count**
  (`post_count` — the hardcoded `0` was replaced by an actual count in migration
  `20260530000000_high_qa_fixes.sql`, H5), and aggregate follower/following counts. They expose no
  auth/profile UUIDs, email, plan, theme, or private metadata.
- **Protected relationship RPCs** — accept creator usernames, derive the actor from `auth.uid()`,
  and expose no identifiers. The TanStack server actions call them with the caller's authenticated
  RLS-scoped Supabase client; no service role is used.

**Validation:** `supabase/tests/social_relationships.sql` covers follow/block uniqueness, owner and
creator RLS, cross-user denial, self-follow rejection, anonymous base-table/RPC denial, safe-view
columns/counts, and protected follow/unfollow behavior. It runs in `db:validate` and CI.

### Posts & feed migration (Phase 3)

`supabase/migrations/20260514000000_posts_feed.sql` adds creator publishing with public/followers
visibility and private media.

- **`posts`** — `creator_profile_id` FK, `caption`, `visibility` (`post_visibility`), `status`
  (`post_status`), `published_at`/`scheduled_at`. RLS: owner full CRUD via `is_current_user_creator`;
  anyone reads published public posts; followers read published followers posts via
  `is_following_creator`. `subscribers`/`purchase` rows are owner-only.
- **`post_media`** — image metadata (`owner_user_id`, `kind` `post_media_kind`, `storage_path`, dims,
  `position`). **Owner-only** SELECT; all viewer access flows through signed URLs.
- **Helpers/RPCs** — `is_following_creator`, `can_view_post`; ID-free `feed_creator_posts` (followers
  posts returned to non-followers as locked stubs) and `feed_home_posts`. `is_following_creator` /
  `is_current_user_creator` grants extended to `anon` (posts SELECT policies are OR-evaluated for
  anonymous readers).
- **Storage** — private `post-media` bucket (`public = false`), owner-scoped object policies;
  authorization-gated signed URLs issued by the `getPostMediaUrls` server action.

**Validation:** `supabase/tests/posts_feed.sql` (owner CRUD, anon public read, follower gating, locked
stubs, no draft/subscriber leakage, `can_view_post`, owner-only media, private bucket).

### Engagement migration (Phase 3.2)

`supabase/migrations/20260515000000_engagement.sql` adds comments, likes, and saves on top of the post
system. No monetization, messaging, notifications, or real-time.

- **`post_comments`** — `post_id`/`author_id` FKs, `body` (1–2000 chars), `status` (`comment_status`:
  `visible`/`hidden`/`deleted`), `updated_at` trigger. Soft-deletable; no hard-delete policy.
- **`post_likes`** / **`post_saves`** — unique (`post_id`, `user_id`); strictly private to the actor;
  anonymous access revoked.
- **RLS** — engagement requires `can_view_post(post_id)` and is denied across a block via
  `is_engagement_blocked`. Read visible comments on viewable posts (anon → public only); authors read
  their own; post owners read all on their posts. Authors edit/soft-delete own visible comments; post
  owners may hide.
- **Helpers/RPCs** — `is_current_user_post_owner`, `is_engagement_blocked`; ID-free
  `post_engagement_state` (counts + caller's like/save/can-engage), `post_comments_list` (safe author
  identity), `post_card` (single locked-aware post for the detail page).

**Validation:** `supabase/tests/engagement.sql` covers comment/like/save RLS, like & save uniqueness,
viewability gating, block enforcement (both directions), creator hiding, author soft-delete, anonymous
visible-comment reads on public posts, and anonymous write denial. Runs in `db:validate` and CI.

### Creator subscriptions migration (Phase 4, DEMO-ONLY)

`supabase/migrations/20260516000000_creator_subscriptions.sql` adds fan-to-creator subscriptions and
wires the `subscribers` post tier to a real entitlement. **No real money** — prices are integer-cent demo
values and references are `mock_*`. The existing `subscriptions` table is **not** renamed.

- **`creator_subscription_status`** enum (`trialing`/`active`/`past_due`/`canceled`/`expired`).
- **`creator_subscription_tiers`** — creator-defined tiers (name, `price_cents`, currency, `is_active`).
  RLS: public reads ACTIVE tiers; owner manages via `is_current_user_creator`.
- **`creator_subscriptions`** — member↔creator, tier, status, period, `mock_provider_reference`. A partial
  unique index enforces at most one live (`trialing`/`active`) row per pair. RLS: member reads own; creator
  reads subs to own profile; **writes only through the SECURITY DEFINER RPCs** (no direct DML grant); anon
  revoked.
- **Entitlement** — `is_active_subscriber(creator_profile_id)` is added to `can_view_post`,
  `feed_creator_posts`, and `post_card`; subscriber posts unlock for active subscribers and appear as locked
  stubs to others. A posts SELECT policy lets subscribers read subscriber posts directly too.
- **RPCs** — `subscribe_to_creator(username, tier_id)` (copies the tier price, stamps a `mock_*` ref, no
  charge; idempotent re-activation), `cancel_creator_subscription(username)`,
  `creator_subscription_state(username)`, `creator_subscribers_list(cursor,limit)`.

**Validation:** `supabase/tests/creator_subscriptions.sql` covers tier RLS, demo subscribe/cancel, the
unique live pair, subscriber entitlement on posts + feed locking, self-subscribe rejection, direct-write
denial, creator subscriber visibility, and anonymous denial. Runs in `db:validate` and CI.

### Messaging migration (Phase 5)

`supabase/migrations/20260517000000_messaging.sql` adds direct (1:1) messaging with participant-scoped
RLS and Supabase Realtime. No paid messages, attachments, or notifications.

- **`message_type`** enum (`text`/`system` usable now; `image`/`video`/`paid`/`tip` reserved).
- **`conversations`**, **`conversation_participants`** (unique `conversation_id, user_id`), **`messages`**
  (`deleted_at` soft-delete; `body` ≤ 4000), **`message_read_receipts`** (unique `message_id, reader_id`).
- **Recursion-safe RLS** — participant checks go through SECURITY DEFINER helpers
  (`is_conversation_participant`, `is_conversation_blocked`, `is_message_in_my_conversation`) so the
  `conversation_participants` policy never queries itself. Participants read their conversations/roster/
  messages/receipts; send only as self, only `text`, only in their conversation, **never across a block**;
  edit/soft-delete only own messages; anon revoked.
- **RPCs** — `create_direct_conversation` / `start_conversation_with_username` (find-or-create, block-aware,
  no self), `list_conversations` (other-party safe identity + last-message preview + unread),
  `conversation_header`, `conversation_messages`, `mark_conversation_read`, `unread_message_count`. A bump
  trigger updates `conversations.updated_at` on new messages for inbox ordering.
- **Realtime** — `messages` and `message_read_receipts` are added to the `supabase_realtime` publication;
  delivery is still RLS-filtered, so a subscriber only receives rows it may read.

**Validation:** `supabase/tests/messaging.sql` covers conversation/message/receipt RLS, participant
isolation, unread calculations, read receipts, edit/delete rules, block enforcement (no new conversation,
no new message), self-conversation rejection, and anon denial. Runs in `db:validate` and CI.

### Monetization ledger migration (Phase 6, DEMO-ONLY)

`supabase/migrations/20260518000000_monetization_ledger.sql` adds the internal financial ledger a future
real processor (Stripe) would settle into. **No payment processor, cards, webhooks, KYC, or real payouts.**
Every financial event is created by a SECURITY DEFINER RPC with integer-cent amounts and a `mock_*`
reference.

- **Enums** — `transaction_type` (`creator_subscription|product|post_unlock|paid_message|tip|refund|adjustment`),
  `transaction_status` (`pending|succeeded|failed|refunded|disputed`), `payout_status`
  (`queued|processing|paid|failed|canceled`), `payout_request_status` (`requested|approved|rejected|paid`).
- **`transactions`** — every financial event; **append-only / immutable**. A BEFORE UPDATE/DELETE trigger
  (`prevent_ledger_mutation`) blocks any change to monetary/identity fields and all deletes, permitting only
  FK columns being nulled by `ON DELETE SET NULL` (so accounts can be deleted while the ledger row is
  retained). A CHECK enforces `creator_net_cents = gross_cents − platform_fee_cents − processor_fee_cents`;
  all cent columns are non-negative (the `refund` _type_ carries reversal semantics, not a negative amount).
- **`creator_balances`** — cached projection (pending / available / lifetime gross·fees·net / paid-out),
  unique per `(creator_profile_id, currency)`. Never the source of truth: `recalc_creator_balance`
  recomputes it from the immutable ledger (mirrors the pure `deriveCreatorBalance`).
- **`payout_requests`** (lifecycle: requested→approved/rejected→paid) and **`payouts`** (disbursement
  history; `queued`/`processing` reserve available balance, `paid` counts as withdrawn).
- **`tips`**, **`purchases`** (each backed by one ledger `transaction`), and **`content_entitlements`**
  (permanent access, unique per `user_id, post_id`, `source` = purchase/subscription/grant).
- **`posts`** gains nullable `price_cents` + `currency`, activating the `purchase` visibility tier.
- **RPCs** — `create_mock_purchase` (idempotent: transaction + purchase + entitlement, then recalc),
  `create_mock_tip`, `request_payout` (eligibility-checked: min $10, ≤ available; records a request + a
  reserved `processing` payout), `creator_balance` (recompute-on-read), helpers `has_content_entitlement`
  and `is_current_user_admin` (wraps the authenticated-revoked `has_role` so admin SELECT policies work).
  `purchase` is wired into `can_view_post`, `feed_creator_posts`, `post_card`, and a buyer `posts` policy.
- **RLS** — creators read their own balance/transactions/payouts/tips/sales; buyers read their own
  purchases/entitlements; admins read all; **anon has no access to any financial table**; all writes go
  through the RPCs (no INSERT/UPDATE/DELETE grants).

**Validation:** `supabase/tests/monetization_ledger.sql` covers purchase unlock (+ idempotency), tips,
balance derivation, payout request/reservation + eligibility guards, ledger immutability, self-action
rejection, buyer/creator/stranger RLS isolation, and anon denial. Runs in `db:validate` and CI.

### Notifications & activity migration (Phase 7, internal only)

`supabase/migrations/20260519000000_notifications_activity.sql` adds the in-app notifications/activity
foundation and an inert future-delivery outbox. **No external delivery** — no Resend, Firebase, Expo, or
web push. Event generation lives at the DATABASE layer (AFTER INSERT triggers on the existing source
tables), so events fire uniformly for both direct-insert and SECURITY DEFINER RPC write paths, atomically.

- **Enums** — `notification_type` / `activity_type` (`new_follower`, `post_liked`, `post_commented`,
  `post_saved`, `new_subscriber`, `tip_received`, `purchase_made`, `message_received`, `payout_requested`,
  `system`), `notification_channel` (`in_app`/`email`/`push`), `outbox_status`
  (`pending`/`sent`/`failed`/`skipped`/`canceled`).
- **`notifications`** — in-app, system-written (no client INSERT). `dedupe_key` is `NOT NULL UNIQUE` so
  re-firing an event is a no-op (idempotency). Clients may update only `read_at` (column-scoped grant).
- **`activity_events`** — append-only canonical log with a `metadata` jsonb; every generated event is
  logged here regardless of whether it surfaces as a user notification.
- **`notification_preferences`** — per-user `in_app_enabled` (default true) + `email_enabled` /
  `push_enabled` placeholders (default false). Self-manageable (insert/update own row).
- **`notification_outbox`** — future email/push queue (inert this phase): `channel`, `status`, `attempts`,
  `scheduled_for`, unique `(notification_id, channel)`. **Admin-only**, never user-readable.
- **Helpers / triggers** — `emit_notification` (SECURITY DEFINER): logs the activity event, then — when the
  recipient is eligible (exists, not self, not blocked via `notif_is_blocked`, in-app enabled) — inserts an
  idempotent notification (`ON CONFLICT (dedupe_key) DO NOTHING`) and one outbox row per enabled future
  channel. AFTER INSERT triggers wire `follows`, `post_likes`, `post_comments` (visible only), `post_saves`,
  `creator_subscriptions`, `tips`, `purchases`, `messages` (one per recipient participant; skips
  system/deleted), and `payout_requests` (activity + creator self-notification).
- **Realtime** — `notifications` is added to the `supabase_realtime` publication; delivery is RLS-filtered
  to the recipient.
- **RLS** — users read only their own notifications/activity and manage only their own preferences; the
  outbox is admin-only; anon has no access; notifications are trigger-written (no client INSERT/DELETE).

**Validation:** `supabase/tests/notifications.sql` covers event generation (follow/like/comment/message/
payout), unread counts, mark-read + mark-all-read under RLS, preferences, outbox row creation,
idempotency (no duplicate on re-fire), self-notification suppression, recipient isolation,
**admin recipient-scoping** (an admin whose "read all" policy sees every row still gets only their own
back from the recipient-scoped personal-center query — no leak), outbox admin-only, and anonymous
denial. Runs in `db:validate` and CI.

## 2. Target Production Schema

New tables grouped by dependency. Group letters match the build roadmap (`CABANA_BUILD_ROADMAP.md` §5).

### Identity & roles

- **`users`** — application projection over `auth.users`: `id` PK (=auth.users.id), `email`, `status` (`active|restricted|suspended|deleted`), `created_at`, `updated_at`, `deleted_at`.
- **`profiles`** (extend current) — `user_id` PK, `display_name`, `username` (unique, ci), `avatar_path`, `bio`.
- **`creator_profiles`** (extend current) — add `verified bool`, `monetization_status` (`disabled|pending|active|restricted`), `subscription_price_cents int`, `default_currency`, `subscriber_count int`; migrate `avatar_url/banner_url` → `*_path`; make `user_id` NOT NULL for real accounts.
- **`member_profiles`** (extend current) — migrate `avatar_url` → `avatar_path` and add
  `is_private bool`.
- **`admin_users`** — `user_id`, `role`, `permissions jsonb`, `active`, `created_at` (extends/replaces `user_roles` with capability scopes: moderator/support/finance/admin/super-admin).
- **`settings`** — `user_id` PK, `email_notifications`, `push_notifications`, `message_permissions` (`everyone|followers|subscribers|nobody`), `comment_permissions` (same enum), `marketing_opt_in`, `locale`, `timezone`, `updated_at`.

### Social graph (Group A)

- **`follows`** — ✅ implemented as `id`, `follower_id`, `following_creator_id`, `created_at`;
  unique pair with indexed FKs and RLS.
- **`blocks`** — ✅ implemented as `id`, `blocker_id`, `blocked_user_id`, optional `reason`,
  `created_at`; unique pair, no-self constraint, indexed FKs, and private RLS.

### Publishing (Group B)

- **`posts`** — `id`, `creator_profile_id`, `caption`, `visibility` (`public|followers|subscribers|purchase`), `price_cents` (null unless `purchase`), `currency`, `status` (`draft|scheduled|published|archived`), `published_at`, `scheduled_at`, `comment_count`, `like_count`, `save_count`, timestamps.
- **`media`** — `id`, `owner_user_id`, `kind` (`image|video|audio|file`), `storage_bucket`, `storage_path`, `mime_type`, `bytes`, `width`, `height`, `duration_seconds`, `processing_status` (`uploaded|processing|ready|failed`), `moderation_status` (`pending|approved|rejected`), `created_at`.
- **`post_media`** — `post_id`, `media_id`, `position`. Join, ordered.
- **`comments`** — `id`, `post_id`, `user_id`, `parent_comment_id` (self-ref), `body`, `status` (`visible|hidden|deleted`), timestamps.
- **`likes`** — `user_id`, `post_id`, `created_at`. Composite PK.
- **`saves`** — `user_id`, `post_id`, `created_at`. Composite PK.

### Creator subscriptions & entitlements (Group C)

- **`creator_subscriptions`** — `id`, `member_user_id`, `creator_profile_id`, `tier_name`, `status` (`trialing|active|past_due|canceled|expired`), `price_cents`, `currency`, `started_at`, `current_period_end`, `cancel_at_period_end`, `canceled_at`, provider IDs, timestamps. Unique active (`member_user_id`, `creator_profile_id`).
- **`subscription_tiers`** — `id`, `creator_profile_id`, `name`, `price_cents`, `currency`, `description`, `active`, `position`.
- **`content_entitlements`** — `id`, `user_id`, `creator_profile_id` (nullable), `post_id` (nullable), `source` (`subscription|purchase|grant`), `granted_at`, `expires_at`. The single server-side source of truth for "can this user view this content."

### Messaging & activity (Group D)

- **`conversations`** — `id`, `type` (`direct|support`), `last_message_id`, `last_message_at`, timestamps.
- **`conversation_participants`** — `conversation_id`, `user_id`, `last_read_message_id`, `joined_at`, `blocked_at`. Unique (`conversation_id`, `user_id`). _Production requires this explicit table even though the demo type stores participant IDs inline._
- **`messages`** — `id`, `conversation_id`, `sender_user_id`, `body`, `media_id`, `kind` (`text|image|video|system`), `price_cents`, `currency`, `unlocked_at`, `created_at`, `deleted_at`.
- **`notifications`** — `id`, `user_id` (recipient), `actor_user_id`, `type` (`follow|like|comment|subscription|message|tip|purchase|payout|system`), `entity_type`, `entity_id`, `payload jsonb`, `read_at`, `created_at`.

### Money ledger (Group E)

- **`transactions`** — `id`, `payer_user_id`, `creator_profile_id`, `type` (`creator_subscription|product|post_unlock|paid_message|tip|refund|adjustment`), `gross_cents`, `platform_fee_cents`, `processor_fee_cents`, `creator_net_cents`, `currency`, `status` (`pending|succeeded|failed|refunded|disputed`), `reference_type`, `reference_id`, provider/`mock_` ref (unique), timestamps. **Immutable once `succeeded`.**
- **`tips`** — `id`, `transaction_id` (1:1), `sender_user_id`, `creator_profile_id`, `amount_cents`, `currency`, `message`, `status`, `created_at`.
- **`creator_balances`** — `id`, `creator_profile_id`, `currency`, `pending_cents`, `available_cents`, `lifetime_gross_cents`, `lifetime_fees_cents`, `lifetime_paid_out_cents`, `updated_at`. Unique (`creator_profile_id`, `currency`). **Derived**, never authoritative.
- **`payouts`** — `id`, `creator_profile_id`, `amount_cents`, `currency`, `status` (`queued|processing|paid|failed|canceled`), `scheduled_for`, `paid_at`, `failure_reason`, provider/`mock_` ref, timestamps.
- **`orders`** / **`order_items`** — product purchase lifecycle (buyer, creator, totals, provider checkout/payment IDs, status) + line-item snapshots.
- **`refunds`** / **`disputes`** — reference a transaction; status + provider IDs.

### Commerce media

- **`product_files`** — `product_id`, `media_id`, digital-delivery metadata.

### Trust & operations (Group F)

- **`reports`** — `id`, `reporter_user_id`, `subject_type` (`user|creator|post|comment|message`), `subject_id`, `reason` (`spam|harassment|impersonation|copyright|scam|other`), `details`, `status` (`open|reviewing|resolved|dismissed`), `assigned_admin_user_id`, `resolution`, timestamps.
- **`audit_logs`** — `id`, `actor_user_id`, `actor_role` (`creator|moderator|admin|system`), `action`, `target_type`, `target_id`, `before jsonb`, `after jsonb`, `reason`, `request_id`, `ip_address`, `user_agent`, `created_at`. **Append-only.**
- **`creator_verifications`** — KYC/identity request + provider status (store status, not raw documents).
- **`webhook_events`** — provider event id (unique), type, payload, processed_at — idempotency + replay protection.
- **`outbox_jobs`** — durable queue for email/push/media-processing/webhook-retry/aggregate-update jobs.

### Platform billing (rename)

- **`platform_subscriptions`** — the current `subscriptions` table renamed: CABANA SaaS billing (Atelier/Studio/Maison/Empire), Stripe customer/subscription IDs, status, period. Frees `subscriptions`/`creator_subscriptions` for fan billing.

## 3. Relationships

- `auth.users 1—1 users 1—1 profiles` → split into `1—0..1 creator_profiles` and `1—0..1 member_profiles` and `1—1 settings`.
- `creator_profiles 1—N posts`, `1—N products`, `1—N links`, `1—N subscription_tiers`, `1—1 creator_balances` (per currency), `1—N payouts`, `1—N analytics_events`.
- `posts N—N media` via `post_media`; `posts 1—N comments` (self-ref threads), `1—N likes`, `1—N saves`.
- `users N—N creator_profiles` via `follows` and via `creator_subscriptions`.
- `content_entitlements` resolves (`user`, `post`/`creator`) for gated reads.
- `conversations N—N users` via `conversation_participants`; `conversations 1—N messages`.
- `transactions 1—0..1 tips`, `1—N refunds`/`disputes`; `transactions` referenced by `creator_subscriptions`, `orders`, `tips`, paid `posts`/`messages` via (`reference_type`,`reference_id`).
- `reports`/`audit_logs`/`creator_verifications` reference acting/subject users.

## 4. ER Diagram

```mermaid
erDiagram
    auth_users ||--|| users : projects
    users ||--|| profiles : has
    users ||--o| creator_profiles : "may be creator"
    users ||--o| member_profiles : "may be member"
    users ||--|| settings : has
    users ||--o| admin_users : "may be admin"

    creator_profiles ||--o{ posts : publishes
    creator_profiles ||--o{ products : sells
    creator_profiles ||--o{ links : has
    creator_profiles ||--o{ subscription_tiers : offers
    creator_profiles ||--o| creator_balances : accrues
    creator_profiles ||--o{ payouts : receives
    creator_profiles ||--o{ analytics_events : generates

    users ||--o{ follows : follows
    follows }o--|| creator_profiles : targets
    users ||--o{ creator_subscriptions : subscribes
    creator_subscriptions }o--|| creator_profiles : to
    creator_subscriptions ||--o| content_entitlements : grants

    posts ||--o{ post_media : has
    post_media }o--|| media : references
    posts ||--o{ comments : has
    comments ||--o{ comments : replies
    posts ||--o{ likes : receives
    posts ||--o{ saves : bookmarked
    content_entitlements }o--o| posts : unlocks

    conversations ||--o{ conversation_participants : includes
    conversation_participants }o--|| users : member
    conversations ||--o{ messages : contains
    messages }o--o| media : attaches

    users ||--o{ notifications : receives

    transactions ||--o| tips : may_be
    transactions ||--o{ refunds : may_have
    transactions ||--o{ disputes : may_have
    creator_subscriptions ||--o{ transactions : bills
    orders ||--o{ order_items : contains
    orders ||--o{ transactions : settles
    products ||--o{ order_items : sold_as
    products ||--o{ product_files : delivers

    reports }o--|| users : reporter
    audit_logs }o--|| users : actor
    creator_verifications }o--|| creator_profiles : verifies
    webhook_events ||--o{ outbox_jobs : may_enqueue
```

## 5. RLS Strategy

**Principles:** Enable RLS on every user/creator/financial/message table. Treat frontend role checks as UX only. Use explicit column lists / public-safe views instead of `select("*")`. Wrap `auth.uid()` in `(select …)` for plan stability. Avoid per-row recursive role lookups — use stable security-definer helpers (`has_role`) with a fixed `search_path`. Service-role access lives only in trusted server code.

| Table                                              | Read                                                                                                                | Write                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `creator_profiles` (public-safe view)              | Everyone reads published, **owner-id-omitting** view                                                                | Owner updates own                                                                        |
| `member_profiles`                                  | Full row owner-only; `public_member_profiles` exposes the explicit safe subset                                      | Owner inserts/updates own; no direct anonymous table access                              |
| `posts`                                            | `public` rows: everyone. `followers`/`subscribers`/`purchase`: only via `content_entitlements`. Owner reads all own | Creator CRUD own                                                                         |
| `post_media`                                       | Same access as parent post                                                                                          | Owner writes                                                                             |
| `comments`                                         | Readable if post readable                                                                                           | Author creates/edits own; post creator can hide                                          |
| `follows`                                          | User reads own follows; creator reads followers targeting own profile; public view exposes counts only              | Authenticated user inserts/deletes own; no update                                        |
| `blocks`                                           | Blocker only; blocked user cannot infer the relationship                                                            | Blocker inserts/deletes own; no update                                                   |
| `likes`                                            | Aggregate-safe reads (planned)                                                                                      | Authenticated user owns write (planned)                                                  |
| `saves`                                            | Private to owner                                                                                                    | Owner only                                                                               |
| `creator_subscriptions`                            | Member and creator read scoped rows                                                                                 | **Status written by trusted server only**                                                |
| `content_entitlements`                             | Owner reads own                                                                                                     | Server only                                                                              |
| `conversations`/`messages`                         | Participants only (via `conversation_participants`)                                                                 | Participant sends                                                                        |
| `notifications`                                    | Recipient only                                                                                                      | Recipient marks read; server creates                                                     |
| `transactions`/`tips`/`creator_balances`/`payouts` | Parties read **restricted** fields                                                                                  | Trusted server / finance only                                                            |
| `reports`                                          | Reporter reads own; moderators read all                                                                             | Reporter creates; moderators manage                                                      |
| `audit_logs`                                       | Privileged read by capability                                                                                       | **Append-only**, server only                                                             |
| `analytics_events`                                 | Owner reads aggregates                                                                                              | Insert constrained + rate-limited (today's check only verifies profile exists — tighten) |

**Public-safe views exist:** `public_creator_profiles` and `public_member_profiles` omit all IDs and
private fields. The legacy public creator bundle still reads `creator_profiles` directly for
links/products/analytics compatibility; migrating that bundle fully onto safe views remains a
hardening task before public IDs can be considered eliminated everywhere.

## 6. Storage Buckets

| Bucket                      | Visibility  | Today                                                                            | Target                                             |
| --------------------------- | ----------- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `avatars`                   | Public      | ✅ used; path `${userId}/${uuid}.${ext}`, RLS `auth.uid() = foldername(name)[1]` | Keep public; server-validate MIME/size; strip EXIF |
| `banners`                   | Public      | bucket + policies exist, **no upload UI**                                        | Add upload UI (P1)                                 |
| `products`                  | Public      | ✅ used                                                                          | Keep public for catalog imagery                    |
| `post-media` (new)          | **Private** | demo path only                                                                   | Signed-URL reads gated by entitlement              |
| `message-attachments` (new) | **Private** | —                                                                                | Signed URLs, participant + unlock checks           |
| `product-files` (new)       | **Private** | —                                                                                | Signed download after order                        |
| `verification-docs` (new)   | **Private** | —                                                                                | Short retention; minimal storage                   |

**Rules:** store storage **paths**, not permanent `getPublicUrl` strings, for anything non-public. Issue short-lived signed URLs only after authorization. Never log full signed URLs. Generate optimized variants / poster frames asynchronously; track in `media`.

## 7. Index Recommendations

- Case-insensitive unique on `lower(username)` (profiles/member_profiles) and `lower(handle)` (creator_profiles).
- Unique pairs: `follows`, `likes`, `saves`, `conversation_participants`, active-scope `creator_subscriptions`.
- FK index on **every** referencing column (links/products/posts/comments/etc. → parents).
- `posts (creator_profile_id, published_at DESC, id DESC)` + **partial** `WHERE status='published'`.
- `messages (conversation_id, created_at DESC, id DESC)` — cursor pagination.
- `notifications (user_id, created_at DESC)` + **partial** `WHERE read_at IS NULL` (unread count).
- `analytics_events (profile_id, created_at DESC)`.
- `transactions (creator_profile_id, created_at DESC)`, `(payer_user_id, created_at DESC)`; **unique** provider/`mock_` reference.
- `reports (status, created_at)` — moderation queue.
- `creator_balances (creator_profile_id, currency)` unique; `payouts` partial `WHERE status IN ('queued','processing')`.
- `webhook_events (provider_event_id)` unique — idempotency.
- Check constraints: non-negative money columns; currency length = 3.
- Consider UUIDv7 for `messages`, `notifications`, `analytics_events`, `audit_logs`.
- Enable and monitor `pg_stat_statements`.
