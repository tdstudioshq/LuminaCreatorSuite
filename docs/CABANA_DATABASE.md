# CABANA Database Specification

> Target production schema for the full creator-subscription platform, plus the documented current state.
>
> **This document is a plan. It authorizes no new product tables.** Gate (a) — a complete rebuildable baseline migration of the *current* schema — is now **substantially met** by Phase 2A (see [§"Baseline migration"](#baseline-migration-phase-2a) below): `supabase/migrations/20260511000000_baseline.sql` rebuilds the existing schema from zero. Gate (b) — an approved RLS strategy for *new* tables — remains open. No `member_profiles`, posts, messaging, payments, or `creator_subscriptions` may be added until 2B is explicitly approved.
>
> Conventions: UUID (prefer time-ordered, e.g. UUIDv7, for high-volume event/message tables) primary keys · `timestamptz` everywhere · money as **integer minor units (cents) + explicit `currency`** · index every foreign key · RLS predicates use `(select auth.uid())`.

---

## 1. Current Implemented Schema (as generated)

Source: `src/integrations/supabase/types.ts`. Eight tables, one enum, one function.

| Table | Columns (current) | Notes |
|-------|-------------------|-------|
| `profiles` | `id` (=auth.users.id), `email`, `name`, `created_at`, `updated_at` | Shared identity row created by signup trigger |
| `creator_profiles` | `id`, `user_id` (nullable!), `handle`, `name`, `bio`, `avatar_url`, `banner_url`, `theme`, `plan`, `created_at`, `updated_at` | Public creator surface. `user_id` nullable allows ownerless seeds (`aurora`, `oliviac`) |
| `links` | `id`, `profile_id` → creator_profiles, `title`, `url`, `icon`, `featured`, `scheduled` (text!), `position`, `clicks`, `created_at` | `scheduled` is a label, not a timestamp |
| `products` | `id`, `profile_id` → creator_profiles, `title`, `price` (text!), `type` (text), `image_url`, `sales`, `position`, `created_at` | `price` is a display string; no checkout linkage |
| `analytics_events` | `id`, `profile_id` (nullable) → creator_profiles, `event_type`, `target_id` (nullable), `metadata` (json), `created_at` | Anonymous inserts allowed for any real profile |
| `subscriptions` | `id`, `user_id`, `plan`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`, `created_at`, `updated_at` | **CABANA SaaS plan, NOT fan subscription.** Rename target: `platform_subscriptions` |
| `user_roles` | `id`, `user_id`, `role` (enum `app_role`), `created_at` | Authorization |
| `reserved_handles` | `handle` (PK) | Blocked usernames |

**Enum** `app_role`: `admin` | `moderator` | `user`. **Function** `has_role(_role, _user_id) → boolean` (security-definer role check).

**Known current-schema weaknesses** (carried into tech debt): prices/scheduling stored as strings; no post/publish model; `creator_profiles.user_id` nullable and exposed by public `select("*")`; no `member_profiles`; `subscriptions` name collides with future fan subscriptions.

<a id="baseline-migration-phase-2a"></a>
### Baseline migration (Phase 2A)

`supabase/migrations/20260511000000_baseline.sql` is a **squashed, rebuildable-from-zero** reconstruction of the entire current schema. The four original incremental migrations were not self-sufficient (they `ALTER`ed tables whose `CREATE` statements lived only in the remote project), so they are archived under `supabase/_archive/pre_baseline_migrations/` for reference and the baseline supersedes them.

**Objects covered by the baseline:** all 8 tables · enum `app_role` · functions `handle_new_user`, `has_role(uuid, app_role)`, `validate_creator_handle`, `touch_updated_at` · triggers `on_auth_user_created` (signup provisioning → profile + creator_profile + free `subscriptions` + `user` role), `updated_at` touches on profiles/creator_profiles/subscriptions, and `validate_creator_handle_trigger` · RLS on every table (public read on creator_profiles/links/products, owner writes, tightened analytics insert, owner-read analytics, owner-read subscriptions, role policies) · unique `lower(handle)` index · 3 public storage buckets (`avatars`, `banners`, `products`) with owner-scoped object policies · reserved-handle seed data · SECURITY DEFINER `revoke execute` hardening. Demo data (`aurora` + links/products) lives in `supabase/seed.sql`.

**Validation:** `bun run db:validate` resets a local instance from zero and runs `supabase/tests/smoke.sql`. Requires Docker; runs in CI (`.github/workflows/ci.yml` → `db-validate` job). See `supabase/README.md`.

**Known risks / not yet done:** (1) The baseline was **reconstructed from `types.ts` + the incremental migrations**, not dumped from the live DB (no DB access in the authoring environment) — it must be diffed against a real `supabase db dump` before being trusted as byte-exact. (2) Postgres `major_version` in `config.toml` is set to 15; confirm against the remote. (3) Remote migration history still lists the 4 incrementals — run `supabase migration repair --status applied 20260511000000` after verifying, so the squash isn't re-applied (see `supabase/README.md`).

## 2. Target Production Schema

New tables grouped by dependency. Group letters match the build roadmap (`CABANA_BUILD_ROADMAP.md` §5).

### Identity & roles
- **`users`** — application projection over `auth.users`: `id` PK (=auth.users.id), `email`, `status` (`active|restricted|suspended|deleted`), `created_at`, `updated_at`, `deleted_at`.
- **`profiles`** (extend current) — `user_id` PK, `display_name`, `username` (unique, ci), `avatar_path`, `bio`.
- **`creator_profiles`** (extend current) — add `verified bool`, `monetization_status` (`disabled|pending|active|restricted`), `subscription_price_cents int`, `default_currency`, `subscriber_count int`; migrate `avatar_url/banner_url` → `*_path`; make `user_id` NOT NULL for real accounts.
- **`member_profiles`** — `id`, `user_id` (unique), `display_name`, `username` (unique, ci), `avatar_path`, `bio`, `is_private bool`, timestamps.
- **`admin_users`** — `user_id`, `role`, `permissions jsonb`, `active`, `created_at` (extends/replaces `user_roles` with capability scopes: moderator/support/finance/admin/super-admin).
- **`settings`** — `user_id` PK, `email_notifications`, `push_notifications`, `message_permissions` (`everyone|followers|subscribers|nobody`), `comment_permissions` (same enum), `marketing_opt_in`, `locale`, `timezone`, `updated_at`.

### Social graph (Group A)
- **`follows`** — `id`, `follower_user_id`, `creator_profile_id`, `status` (`active|blocked`), `created_at`. Unique (`follower_user_id`, `creator_profile_id`).
- **`blocks`** — `blocker_user_id`, `blocked_user_id`, `created_at`. Unique pair.

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
- **`conversation_participants`** — `conversation_id`, `user_id`, `last_read_message_id`, `joined_at`, `blocked_at`. Unique (`conversation_id`, `user_id`). *Production requires this explicit table even though the demo type stores participant IDs inline.*
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

| Table | Read | Write |
|-------|------|-------|
| `creator_profiles` (public-safe view) | Everyone reads published, **owner-id-omitting** view | Owner updates own |
| `member_profiles` | Public-safe fields discoverable; full row owner-only | Owner updates own |
| `posts` | `public` rows: everyone. `followers`/`subscribers`/`purchase`: only via `content_entitlements`. Owner reads all own | Creator CRUD own |
| `post_media` | Same access as parent post | Owner writes |
| `comments` | Readable if post readable | Author creates/edits own; post creator can hide |
| `likes`/`follows` | Aggregate-safe reads | Authenticated user owns write; creator reads own follower list |
| `saves` | Private to owner | Owner only |
| `creator_subscriptions` | Member and creator read scoped rows | **Status written by trusted server only** |
| `content_entitlements` | Owner reads own | Server only |
| `conversations`/`messages` | Participants only (via `conversation_participants`) | Participant sends |
| `notifications` | Recipient only | Recipient marks read; server creates |
| `transactions`/`tips`/`creator_balances`/`payouts` | Parties read **restricted** fields | Trusted server / finance only |
| `reports` | Reporter reads own; moderators read all | Reporter creates; moderators manage |
| `audit_logs` | Privileged read by capability | **Append-only**, server only |
| `analytics_events` | Owner reads aggregates | Insert constrained + rate-limited (today's check only verifies profile exists — tighten) |

**Public-safe views are mandatory**: a `public_creator_view` that omits `user_id` must replace the current `select("*")` on `creator_profiles` (today it leaks `user_id`).

## 6. Storage Buckets

| Bucket | Visibility | Today | Target |
|--------|-----------|-------|--------|
| `avatars` | Public | ✅ used; path `${userId}/${uuid}.${ext}`, RLS `auth.uid() = foldername(name)[1]` | Keep public; server-validate MIME/size; strip EXIF |
| `banners` | Public | bucket + policies exist, **no upload UI** | Add upload UI (P1) |
| `products` | Public | ✅ used | Keep public for catalog imagery |
| `post-media` (new) | **Private** | demo path only | Signed-URL reads gated by entitlement |
| `message-attachments` (new) | **Private** | — | Signed URLs, participant + unlock checks |
| `product-files` (new) | **Private** | — | Signed download after order |
| `verification-docs` (new) | **Private** | — | Short retention; minimal storage |

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
