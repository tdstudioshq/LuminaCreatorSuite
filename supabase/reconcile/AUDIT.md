# CABANA ⇄ cabanadatabase Schema Audit

**Canonical project:** `rpzaeqoqcaxxavltgvpe` ("cabanadatabase", us-east-2)
**Audited:** 2026-07-07, read-only via Supabase Management API (`information_schema`, `pg_catalog`, `pg_policies`, `storage`, row counts). No writes were made.
**Repo baseline:** 16 migrations `20260511000000` → `20260526000000`.

## Executive finding

cabanadatabase does **not** contain the CABANA schema. It contains a **different, larger "Reel/compliance" schema** (51 tables incl. `performers`, `age_verifications`, `chargebacks`, `creator_verifications`, `support_tickets`, `appeals`) that was scaffolded from a spec but **never populated**: **every table is empty except `public.profiles` (1 row)**, and there is **1 `auth.users` row** (tyler.diorio@gmail.com, an admin).

This is the best possible case for reconciliation. Because the scaffold carries no data, the safe plan is **not** a column-by-column ALTER reconciliation (which would be enormous and conflict-ridden — even same-named tables have different shapes). It is: **preserve the 1 legacy row → drop the empty scaffold → apply the repo's 16 migrations verbatim → backfill the 1 admin user.** That yields an exact, tested CABANA schema instead of a hand-merged hybrid.

## Evidence — required verification items

| Item                           | Status            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles.account_type`        | ❌ missing        | Live `profiles` columns: `id, auth_user_id, role, admin_scopes, display_name, username, email, avatar_url, banner_url, bio, date_of_birth, age_verified_at, suspended_at, suspension_reason, deleted_at, created_at, updated_at`. **No `account_type`.** Different PK model too: live PK is `id` (own uuid) with a separate `auth_user_id` FK; CABANA PK **is** `auth.users.id`.                                                                                      |
| creator / member / admin model | ⚠️ conflict       | Live uses `profiles.role` (enum `user_role`) + `admin_scopes` (enum `admin_scope[]` = `{moderation,finance,compliance}`) + `fan_profiles`. CABANA uses `profiles.account_type` (`creator`\|`member`) + `member_profiles` + a separate `user_roles` table (enum `app_role` = `admin`\|`moderator`\|`user`). Fundamentally different authz shapes.                                                                                                                      |
| `handle_new_user` trigger      | ❌ missing        | **Zero triggers on `auth.users`** (only non-internal trigger check returned `[]`). The scaffold creates profiles at the app layer. CABANA's `handle_new_user` (SECURITY DEFINER, provisions profile + role + creator_profile/member_profile) does not exist.                                                                                                                                                                                                          |
| onboarding completion state    | ❌ missing (both) | No onboarding-completion column in either schema. CABANA has never persisted one (the `/auth/callback` route infers "new user" from account-creation recency). Not introduced by this reconciliation.                                                                                                                                                                                                                                                                 |
| creator profiles               | ⚠️ conflict       | `creator_profiles` exists in both but from different designs; live copy is **empty**. CABANA's has `handle`, `theme`, nullable `user_id` for ownerless seed profiles, its own RLS.                                                                                                                                                                                                                                                                                    |
| links                          | ❌ missing        | No `links` table live. CABANA link-in-bio core table absent.                                                                                                                                                                                                                                                                                                                                                                                                          |
| posts / feed                   | ⚠️ conflict       | `posts`, `post_media`, `post_comments`, `post_likes`, `post_saves` exist but from the Reel design (enums `post_status`={draft,scheduled,published,archived,**deleted**}, `post_visibility`={public,subscribers,**ppv**}, plus `poll_options`/`poll_votes`/`collections`/`performers` not in CABANA). CABANA visibility is {public,followers,subscribers,purchase}. No `feed_home_posts`/`feed_creator_posts`/`can_view_post` functions exist. All empty.              |
| subscriptions / payments       | ⚠️ conflict       | Live has a **fuller** payments layer: `transactions`, `payouts`, `invoices`, `chargebacks`, `payment_methods`, `refund_requests`, `creator_subscriptions`, `creator_subscription_tiers`, `creator_balances`, `content_entitlements`. CABANA equivalents differ (CABANA adds `payout_requests`, `purchases`, `tips`, `subscriptions` (SaaS plans); demo-only mock refs). Enum `payout_status` and `transaction_type` collide by name with different labels. All empty. |
| RLS policies                   | ⚠️ replaced       | 92 live public policies, all on scaffold tables → dropped via CASCADE with their tables. CABANA migrations install their own full policy set. Storage: 14 policies across 5 buckets; CABANA-relevant ones are re-created, live-only bucket policies kept.                                                                                                                                                                                                             |

## Table-level map (public schema)

**Present in both by name (all empty live; shapes differ → replaced):** analytics_events, audit_logs, blocks, content_entitlements, conversations, creator_balances, creator_profiles, creator_subscription_tiers, creator_subscriptions, follows, message_read_receipts, messages, notification_outbox, notification_preferences, notifications, payouts, post_comments, post_likes, post_media, post_saves, posts, profiles⚠️(preserved), reports, transactions.

**❌ CABANA tables missing from live (11):** activity_events, conversation_participants, links, member_profiles, payout_requests, products, purchases, reserved_handles, subscriptions, tips, user_roles.

**Live-only tables (dropped — empty, Reel/compliance scaffold, 27):** admin_notes, age_verifications, appeal_events, appeals, chargebacks, collections, compliance_records, content_performers, creator_verification_documents, creator_verification_events, creator_verification_requests, creator_verifications, fan_profiles, feature_flags, fraud_signal_events, invoices, payment_methods, performers, platform_config, poll_options, poll_votes, refund_requests, risk_status, strikes, support_tickets, takedown_requests, user_warnings.

## Enums

CABANA defines 20 `public` enums; live defines 26 (Reel set). **6 names collide with different labels** — these MUST be dropped before the migrations run or CABANA's `exception when duplicate_object` guards silently keep the wrong labels:

| enum                  | live labels                                              | CABANA labels                                                               |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `payout_status`       | requested,approved,paid,declined,on_hold,canceled,failed | queued,processing,paid,failed,canceled                                      |
| `post_status`         | draft,scheduled,published,archived,deleted               | draft,scheduled,published,archived                                          |
| `post_visibility`     | public,subscribers,ppv                                   | public,followers,subscribers,purchase                                       |
| `report_status`       | open,assigned,resolved,dismissed,escalated               | open,reviewing,resolved,dismissed                                           |
| `report_subject_type` | post,comment,message,profile,media                       | user,creator,post,comment,message                                           |
| `transaction_type`    | (Reel set)                                               | creator_subscription,product,post_unlock,paid_message,tip,refund,adjustment |

## Storage buckets

| bucket                                                                     | live      | CABANA wants | action                             |
| -------------------------------------------------------------------------- | --------- | ------------ | ---------------------------------- |
| avatars                                                                    | ✅ public | ✅ public    | keep (CABANA insert is idempotent) |
| banners, products, post-media                                              | ❌        | ✅           | created by migrations              |
| creator-media, message-media, verification-documents, compliance-documents | live-only | —            | keep untouched                     |

## Reconciliation plan (files in this folder — NOT yet applied)

1. **`01_pre_migrations_reset.sql`** — guards that all scaffold tables are empty (aborts otherwise), preserves `public.profiles` → `legacy_reel.profiles`, drops the 50 empty scaffold tables, 26 enums, and `set_updated_at()`. Keeps all storage buckets.
2. **Apply the 16 repo migrations in order** (`supabase db push` after `supabase link`, or `psql -f` each). Do **not** run `supabase/seed.sql` remotely.
3. **`02_post_migrations_backfill.sql`** — recreates the CABANA `profiles`/`user_roles`/`creator_profiles`/`subscriptions` rows for the pre-existing admin auth user (the CABANA trigger never fired for it) and re-grants `admin`.

**Rollback:** the reset runs in a transaction; a mid-flight failure rolls back. Recommended before step 1: `supabase db dump -f reconcile/scaffold_snapshot.sql` for a full DDL snapshot.

## Dry-run result (local Docker, 2026-07-07) — ✅ PASS

Full sequence exercised end-to-end via `dry_run.sh` (clean slate → `00_simulate_cloud_scaffold.sql`
reproducing the verified live state → `01` → 16 migrations → `02` → validation). No cloud contact.

- Scaffold simulated: **51 public tables, 26 enums, 1 profiles row** (matches live).
- After `01`: **0 public tables, 0 public enums**, admin row preserved in `legacy_reel.profiles`.
- 16 migrations applied in order with **zero errors** (only idempotent `drop … if exists` NOTICEs).
- After `02`: reconciled schema = **35 tables, 35 RLS-enabled, 86 policies**; all 12 key CABANA
  tables present; **no scaffold leftovers**.
- ✅ Enum collisions resolved: `post_visibility` = `public,followers,subscribers,purchase` and
  `payout_status` = `queued,processing,paid,failed,canceled` (CABANA labels, not scaffold).
- ✅ Trigger: `on_auth_user_created` (handle_new_user) present on `auth.users`.
- ✅ Admin backfill: user `4d54cf94…` → `account_type=creator`, roles `{admin,user}`, creator
  handle `tylerdiorio`.
- ✅ `profiles.account_type` column present.
- ✅ **Guard verified**: injecting 1 row into a scaffold table makes `01` abort
  (`ABORT: public.follows has 1 rows`) and roll back with **zero drops** (51 tables intact,
  `legacy_reel` never created) — real data cannot be destroyed.
- ✅ `supabase gen types typescript --local` from the reconciled DB → **table set identical** to
  the committed `src/integrations/supabase/types.ts`.
- ✅ Repo gate unaffected: 332/332 tests, production build succeed.

## APPLIED TO CLOUD — 2026-07-07 ✅

Executed against `rpzaeqoqcaxxavltgvpe` via the Supabase Management API (access-token auth; the
project is unlinked and the DB password was not available, so `db push`/native `db dump` were not
used — each migration was sent wrapped in `begin;…commit;` for atomicity).

1. **Backup** captured first → `backups/` (data_profiles + data_auth_users = the only 2 data rows,
   exact; schema_ddl 342 stmts; schema_columns 461; policies; storage). See `backups/MANIFEST.md`.
2. **Preconditions re-confirmed:** 0 rows across all 50 non-profile tables, profiles=1, auth.users=1.
3. **01 reset** → public went 51 tables/26 enums → 0/0; admin row preserved in `legacy_reel.profiles`.
4. **16 migrations** applied in order — all ok, no errors.
5. **02 backfill** → admin re-provisioned.

**Post-reconciliation cloud state (verified):** 35 tables, 20 enums, 62 functions, 86 policies,
**all 35 tables RLS-enabled (0 unprotected)**. `profiles.account_type` ✅; `post_visibility` =
public,followers,subscribers,purchase ✅; `payout_status` = queued,processing,paid,failed,canceled
✅; `on_auth_user_created` trigger ✅; admin user `4d54cf94…` → account*type=creator, roles
{admin,user}, creator handle `tylerdiorio` ✅. Internal helpers correct: `emit_notification`/
`notif*\*`/`current_audit_actor_role`owner-only;`is_current_user_admin`/`is_current_user_staff`executable by`authenticated`(by design). Storage: 8 buckets (4 CABANA + 4 scaffold retained).
**Google OAuth** re-verified end-to-end (live browser on prod → 302 → accounts.google.com).
Types regenerated →`src/integrations/supabase/types.ts` updated (added current RPC signatures).
Gate: lint 0 errors · tsc OK · 332/332 tests · build ✅.

**`legacy_reel.profiles` (1 row) intentionally KEPT** pending your final verification (a real Google
sign-in completing the round-trip). To remove after you confirm: `drop schema legacy_reel cascade;`.

## Not automated / decisions for you:

- The scaffold's `admin_scopes` granularity ({moderation,finance,compliance}) has no CABANA analogue (CABANA gates on a single `admin` role). Scopes are preserved in `legacy_reel.profiles` for reference; not carried into authz.
- `supabase/config.toml` still names the old ref `dwnricswfskypqqfknnh`; linking to `rpzaeqoqcaxxavltgvpe` for `db push` is a separate explicit step.
- These files are intentionally **outside** `supabase/migrations/` so they cannot run as part of a normal `db reset`/`db push`.
