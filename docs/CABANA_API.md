# CABANA API & Server Actions Specification

> The data-access contract for CABANA: what runs as direct (RLS-safe) Supabase client calls vs. trusted server actions, with input/output shapes, auth requirements, error handling, and webhook architecture.
>
> Documents both implemented contracts and planned interfaces. Planned sections do not authorize
> implementation. Companion: [`CABANA_DATABASE.md`](./CABANA_DATABASE.md),
> [`CABANA_PRODUCT_SPEC.md`](./CABANA_PRODUCT_SPEC.md).

---

## 1. Access Tiers (the core rule)

CABANA has two ways to reach the database. Choosing the wrong tier is a security bug.

| Tier                   | Mechanism                                                                                                         | Use for                                                                                                        | Auth                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **T1 — Direct client** | `supabase` (anon key, `src/integrations/supabase/client.ts`), RLS-enforced                                        | Low-risk, RLS-safe CRUD: own profile/links/products, public reads, likes/saves/follows, mark-notification-read | Browser session (JWT) + RLS                                   |
| **T2 — Server action** | TanStack Start server function guarded by `requireSupabaseAuth` (`auth-middleware.ts`), or Supabase Edge Function | Money, entitlements, signed URLs, admin, provider integrations, anything that must not trust client input      | Bearer token validated server-side → scoped client + `userId` |
| **T3 — Service role**  | `supabaseAdmin` (`client.server.ts`, bypasses RLS)                                                                | Inside T2 only, for trusted writes (ledger, audit, webhooks). **Never imported into client code.**             | Server process only                                           |

> **Update (Phase 2C):** T2 now covers account and relationship actions.
> `attachSupabaseToken` sends the caller token and `requireSupabaseAuth` validates it before every
> action. `account-actions.ts` and `relationship-actions.ts` use the caller's scoped client; T3
> (`client.server.ts`) still has no callers.

**Every state-changing T2/T3 action must:** validate input (shared Zod schema), authorize on the server, use an idempotency key where money or duplicates are possible, and append an `audit_logs` row for privileged actions.

## 2. Currently Implemented (T1)

These exist today in `src/lib/`:

| Function                                                | File                | Contract                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cabanaAuth.signup({name,email,password,accountType?})` | cabana-auth.ts      | → `{ok:true,user,accountType}` \| `{ok:false,error}`; validates name/email/≥6-char pw; `accountType` defaults to `creator`, passed as `raw_user_meta_data.account_type`; `emailRedirectTo` = `/dashboard` (creator) or `/account` (member) |
| `cabanaAuth.login({email,password})`                    | cabana-auth.ts      | → `{ok,user}` \| `{ok:false,error}`                                                                                                                                                                                                        |
| `cabanaAuth.logout()`                                   | cabana-auth.ts      | `signOut()`                                                                                                                                                                                                                                |
| `cabanaAuth.requestPasswordReset(email)`                | cabana-auth.ts      | sends recovery email → `/reset-password`                                                                                                                                                                                                   |
| `cabanaAuth.updatePassword(pw)`                         | cabana-auth.ts      | ≥6 chars; updates user                                                                                                                                                                                                                     |
| `useAuthSession()` / `useCabanaUser()`                  | cabana-auth.ts      | `{user, loading}` from `onAuthStateChange`                                                                                                                                                                                                 |
| `useHasRole(role)`                                      | cabana-roles.ts     | `{loading, hasRole, signedIn}` from `user_roles`                                                                                                                                                                                           |
| `useCreatorByHandle(handle)`                            | cabana-store.ts     | public read of `creator_profiles`+`links`+`products` bundle                                                                                                                                                                                |
| `useCabana()`                                           | cabana-store.ts     | owner's creator bundle                                                                                                                                                                                                                     |
| `useCabanaMutations()`                                  | cabana-store.ts     | `setProfile`, `addLink/updateLink/removeLink/setLinks`, `addProduct/updateProduct/removeProduct`, `uploadAvatar`, `uploadProductImage` — toast-wrapped, invalidate `my-creator`/`creator-by-handle`                                        |
| `trackPageView/trackLinkClick/trackProductClick`        | cabana-analytics.ts | fire-and-forget insert into `analytics_events`                                                                                                                                                                                             |

## 2b. Implemented Server Actions (T2 — Phase 2B)

The first protected server-action tier. Each `createServerFn` composes two
function middlewares: `attachSupabaseToken` (client — attaches the session
`Authorization: Bearer` header) then `requireSupabaseAuth` (server — validates
it and yields an RLS-scoped per-request client + `userId`). All access runs
under the caller's RLS, never the service role. Handlers stay thin and delegate
to the pure `src/lib/cabana-account.ts` module; React Query hooks live in
`src/lib/use-account.ts`.

| Action                                   | File               | Contract                                                                                                            |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `getAccountContext()`                    | account-actions.ts | [auth] → `{userId, accountType, roles[], name, email}` (reads `profiles` + `user_roles`)                            |
| `getMemberProfile()`                     | account-actions.ts | [auth] → `MemberProfile \| null` (reads own `member_profiles` row)                                                  |
| `updateMemberProfile({displayName,bio})` | account-actions.ts | [auth] → `MemberProfile`; input normalized/length-capped (`normalizeMemberProfileInput`); upsert keyed on `user_id` |

Client hooks: `useAccountType()` (lightweight direct read used by the
`/dashboard` + `/account` guards/redirects), `useAccountContext()`,
`useMemberProfile()`, `useUpdateMemberProfile()`.

> **Bundler note:** `createServerFn` modules are client-importable (they compile
> to an RPC bridge), so they must NOT live under a `**/server/**` path — the
> start import-protection plugin blocks those from client bundles.

## 2c. Implemented Relationship Actions (T2 — Phase 2C)

`src/lib/relationship-actions.ts` uses the same middleware pair as account actions. Creator inputs
are normalized public usernames. Narrow database RPCs derive the actor from `auth.uid()`, expose no
UUIDs, and enforce self-follow/block rules; block actions accept a target UUID intended for future
authenticated/private contexts.

| Action                              | Contract                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `followCreator({username})`         | [auth] idempotently follows a creator; rejects self-follow or an actor-owned block |
| `unfollowCreator({username})`       | [auth] idempotently removes the caller's follow                                    |
| `blockUser({targetUserId,reason?})` | [auth] creates the caller's private block; reason capped at 280 characters         |
| `unblockUser({targetUserId})`       | [auth] removes the caller's private block                                          |
| `getRelationshipState({username})`  | [auth] → following/blocked/self flags plus follower and caller-following counts    |
| `getFollowerCount({username})`      | [auth] → aggregate count from `public_creator_profiles`                            |
| `getFollowingCount()`               | [auth] → caller's RLS-scoped follow count                                          |

Hooks in `use-relationships.ts`: `useRelationship(username)` and `useFollow(username)`. The public
creator page uses `useFollow` for the minimal persistent Follow/Following proof.

## 2d. Implemented Post Actions (T2 — Phase 3)

`src/lib/post-actions.ts`. Creator writes use `attachSupabaseToken` + `requireSupabaseAuth`; feed/detail
reads use `attachSupabaseToken` + **`optionalSupabaseAuth`** (guest-callable, resolves `auth.uid()` when
present). `getPostMediaUrls` is the only service-role storage touch, gated by `can_view_post`.

| Action                                                      | Contract                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `createPost({caption,visibility})`                          | [auth, creator] creates a draft post (`public`/`followers` only)    |
| `updatePost({postId,caption?,visibility?})`                 | [auth, owner] edits caption/visibility                              |
| `publishPost({postId})`                                     | [auth, owner] draft/scheduled → published (stamps `published_at`)   |
| `archivePost({postId})` / `deletePost({postId})`            | [auth, owner] archive or delete (+ best-effort media cleanup)       |
| `addPostMedia({postId,...})` / `deletePostMedia({mediaId})` | [auth, owner] record/remove image media                             |
| `getOwnPosts()`                                             | [auth, creator] → the caller's posts (all statuses)                 |
| `getCreatorFeed({username,cursor?})`                        | [public] → safe feed rows; followers posts locked for non-followers |
| `getHomeFeed({cursor?})`                                    | [auth] → published posts from followed creators                     |
| `getPostMediaUrls({postId})`                                | [public] → expiring signed URLs, only after `can_view_post`         |

Hooks in `use-posts.ts`: `useCreatorFeed`, `useHomeFeed`, `useOwnPosts`, `usePostMediaUrls`, and composer
mutations.

## 2e. Implemented Engagement Actions (T2 — Phase 3.2)

`src/lib/engagement-actions.ts`. Writes use `requireSupabaseAuth`; reads use `optionalSupabaseAuth`.
Viewability and block enforcement live entirely in RLS (`can_view_post`, `is_engagement_blocked`) — no
service role.

| Action                              | Contract                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `addComment({postId,body})`         | [auth] comments on a viewable post (1–2000 chars); denied across a block |
| `editComment({commentId,body})`     | [auth, author] edits own visible comment                                 |
| `deleteComment({commentId})`        | [auth, author] soft-deletes own comment (status → `deleted`)             |
| `hideComment({commentId})`          | [auth, post owner] hides a comment on own post (status → `hidden`)       |
| `likePost` / `unlikePost({postId})` | [auth] toggle like → returns fresh `EngagementState`                     |
| `savePost` / `unsavePost({postId})` | [auth] toggle private save → returns fresh `EngagementState`             |
| `getPostEngagementState({postId})`  | [public] → like/comment counts + caller's liked/saved/can-engage flags   |
| `getPostComments({postId,cursor?})` | [public] → visible comments with safe author identity                    |
| `getPost({postId})`                 | [public] → single locked-aware post card for the detail page             |

Hooks in `use-engagement.ts`: `usePostEngagementState`, `usePostComments`, `usePost`, `usePostLike`,
`usePostSave`, and comment mutations (`useAddComment`/`useEditComment`/`useDeleteComment`/`useHideComment`).

## 2f. Implemented Subscription Actions (T2 — Phase 4, DEMO-ONLY)

`src/lib/subscription-actions.ts`. **No real money** — `subscribeToCreator` calls a SECURITY DEFINER RPC
that copies the price from a creator tier and stamps a `mock_*` reference; there is no payment provider,
charge, or payout. Writes use `requireSupabaseAuth`; public reads use `optionalSupabaseAuth`.

| Action                                            | Contract                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `upsertTier({tierId?,name,priceCents,currency?})` | [auth, creator] create/update a demo tier (integer cents)                     |
| `setTierActive({tierId,isActive})`                | [auth, creator] activate/deactivate a tier                                    |
| `getMyTiers()`                                    | [auth, creator] → the caller's tiers (all)                                    |
| `getCreatorTiers({username})`                     | [public] → a creator's ACTIVE tiers                                           |
| `subscribeToCreator({username,tierId})`           | [auth] demo subscribe (mock ref, no charge); idempotent → `SubscriptionState` |
| `cancelSubscription({username})`                  | [auth] cancel the caller's live subscription → `SubscriptionState`            |
| `getSubscriptionState({username})`                | [public] → subscribed/status/tier/price/period/self (anon → not subscribed)   |
| `getCreatorSubscribers()`                         | [auth, creator] → the caller's active subscribers (safe identity)             |

Hooks in `use-subscriptions.ts`: `useCreatorTiers`, `useMyTiers`, `useSubscriptionState`,
`useCreatorSubscribers`, `useSubscribe`, `useUpsertTier`, `useSetTierActive`.

## 2g. Implemented Messaging Actions (T2 — Phase 5)

`src/lib/messaging-actions.ts`. All run under the caller's RLS (`requireSupabaseAuth`); participant
scoping + block enforcement live in SQL (RLS + SECURITY DEFINER RPCs). No service role. Conversation
creation, reads, and unread all go through ID-free RPCs.

| Action                                      | Contract                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `createConversation({otherUserId})`         | [auth] find-or-create a 1:1 conversation; rejects self / block → `{conversationId}` |
| `startConversationWithUsername({username})` | [auth] same, by creator handle / member username (public-page entry)                |
| `getConversations()`                        | [auth] → inbox rows (other party, last-message preview, unread count)               |
| `getConversation({conversationId})`         | [auth] → the other party's safe identity (participant-gated)                        |
| `getMessages({conversationId,cursor?})`     | [auth] → messages oldest-first (deleted ones blanked)                               |
| `sendMessage({conversationId,body})`        | [auth] send a `text` message; denied across a block                                 |
| `editMessage({messageId,body})`             | [auth, sender] edit own non-deleted message                                         |
| `deleteMessage({messageId})`                | [auth, sender] soft-delete own message                                              |
| `markConversationRead({conversationId})`    | [auth] receipt all of the other party's undeleted messages                          |
| `getUnreadCount()`                          | [auth] → total unread across conversations                                          |

Hooks in `use-messaging.ts`: `useConversations`, `useConversation`, `useMessages`, `useSendMessage`,
`useUnreadMessages`, `useCreateConversation`, `useStartConversationWithUsername`, `useEditMessage`,
`useDeleteMessage`, `useMarkConversationRead`. **Realtime:** `useConversations`/`useMessages`/
`useUnreadMessages` subscribe to `postgres_changes` on `messages` + `message_read_receipts` (RLS-filtered)
for live delivery, receipts, and inbox ordering; supabase-js auto-reconnects.

## 2h. Implemented Monetization Actions (T2 — Phase 6, DEMO-ONLY)

`src/lib/money-actions.ts`. All run under the caller's RLS (`requireSupabaseAuth`); writes go through
SECURITY DEFINER RPCs that record integer-cent amounts with a `mock_*` reference. **No payment processor,
cards, webhooks, or real money.** Reads are creator-scoped except `getEntitlements` (caller-scoped).

| Action                                        | Contract                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `createMockPurchase({postId})`                | [auth] unlock a `purchase` post; idempotent; records transaction + purchase + entitlement |
| `createMockTip({username,amountCents,note?})` | [auth] tip a creator (min $1); rejects self → `{ok}`                                      |
| `requestPayout({amountCents,note?})`          | [creator] request a mock payout (min $10, ≤ available) → refreshed balance                |
| `getCreatorBalance()`                         | [creator] → balance projection (pending/available/lifetime/withdrawn), recomputed on read |
| `getTransactions()`                           | [creator] → up to 100 ledger transactions received, newest first                          |
| `getPayoutHistory()`                          | [creator] → mock payout history                                                           |
| `getTips()`                                   | [creator] → tips received                                                                 |
| `getPurchases()`                              | [creator] → sales (unlocks of own content)                                                |
| `getEntitlements()`                           | [auth] → the caller's own permanent content entitlements                                  |

Fee model = 10% platform + 3% processor (rounded; creator net is the remainder), mirroring `cabana-money`.
Hooks in `use-money.ts`: `useBalance`, `useTransactions`, `usePayouts`, `usePurchases`, `useTips`,
`useEntitlements`, `useRequestPayout`, `useSendTip`, `usePurchaseUnlock`. Pure validation helpers
(`evaluatePayoutEligibility`, `evaluatePurchase`, `entitlementFromPurchase`) live in `cabana-money.ts`.

## 2i. Implemented Notification Actions (T2 — Phase 7, internal only)

`src/lib/notification-actions.ts`. All run under the caller's RLS (`requireSupabaseAuth`): a user reads
only their own notifications/activity and manages only their own preferences. **Notifications are
SYSTEM-WRITTEN** by the Phase 7 DB triggers (`emit_notification`) — there is no create action; clients may
only flip `read_at`. No email/push provider exists (the outbox is inert and admin-only).

| Action                                                 | Contract                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `getNotifications()`                                   | [auth] → the caller's notifications, newest first (≤50)          |
| `getUnreadNotificationCount()`                         | [auth] → count of the caller's unread notifications              |
| `getActivityFeed()`                                    | [auth] → activity events about/by the caller, newest first (≤50) |
| `getNotificationPreferences()`                         | [auth] → the caller's prefs (defaults if no row)                 |
| `markNotificationRead({notificationId})`               | [auth] set `read_at` on the caller's own notification            |
| `markAllNotificationsRead()`                           | [auth] set `read_at` on all of the caller's unread notifications |
| `updateNotificationPreferences({inApp?,email?,push?})` | [auth] upsert the caller's preferences → updated prefs           |

Hooks in `use-notifications.ts`: `useNotifications`, `useUnreadNotificationCount`, `useActivityFeed`,
`useNotificationPreferences`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`,
`useUpdateNotificationPreferences`. **Realtime:** `useNotifications` / `useUnreadNotificationCount`
subscribe to `postgres_changes` on `notifications` filtered to the recipient (RLS-filtered) for live list +
unread updates; the channel is removed on unmount. Pure helpers (`formatNotification`,
`groupNotificationsByDay`, `countUnread`, `evaluatePreference`, `isOutboxEligible`, `notificationDedupeKey`,
`activityLabel`) live in `cabana-notifications.ts`.

## 3. Planned Server Actions (T2)

Grouped by domain. Each entry: **name** — input → output [auth]. "Owner" = authenticated owner of the resource; "Server" = service-role inside a guarded action.

### Auth & account

- ~~`signUpMember(input)`~~ ✅ **done (Phase 2B)** — implemented via `cabanaAuth.signup({…, accountType:"member"})`; the `handle_new_user` trigger branches on `account_type` to provision a `member_profiles` row instead of a creator profile.
- `signUpCreator(input)` → `{user, creatorProfile}` [public] — or `upgradeToCreator()` [member] for member→creator.
- `signIn` / `signOut` / `requestPasswordReset` / `updatePassword` — wrap existing T1.
- `deleteAccount()` [owner] · `listSessions()` / `revokeSession(id)` [owner].

### Profiles

- `getPublicCreator(handle)` → public-safe creator view (**omits `user_id`**) [public].
- `getMyProfile()` [owner] · `updateMyProfile(patch)` [owner].
- `claimHandle(handle)` → `{ok}` [owner] — checks `reserved_handles` + ci-unique.
- `submitCreatorVerification(payload)` [creator] · `setCreatorTheme(theme)` [creator].

### Posts

- `createPost(input)` · `updatePost(id,patch)` · `publishPost(id)` · `schedulePost(id,at)` · `archivePost(id)` [creator, owner].
- `getCreatorFeed(creatorId,cursor)` [public/entitled] · `getMemberFeed(cursor)` [member].
- `getPostWithEntitlement(postId)` → post + `{entitled:boolean, reason}` [auth] — **server resolves `content_entitlements`, never client flags**.

### Comments / likes / saves / follows

- `toggleLike(postId)` · `toggleSave(postId)` [auth, T1] · `listSavedPosts(cursor)` [owner].
- ~~`followCreator` / `unfollowCreator` / `blockUser` / `unblockUser` / relationship counts~~ ✅
  Phase 2C. `listFollowers` / `listFollowing` cursor APIs remain planned.
- `createComment` · `updateOwnComment` · `deleteOwnComment` [author] · `hideCommentAsCreator(id)` [creator] · `listCommentsCursor(postId,cursor)`.

### Subscriptions & entitlements (T2 — server writes status)

- `createCreatorSubscriptionCheckout(creatorId,tierId)` → checkout session (mock first) [member].
- `createPlatformPlanCheckout(plan)` → CABANA SaaS checkout [creator].
- `openBillingPortal()` · `cancelSubscription(id)` · `resumeSubscription(id)` [owner].
- `getEntitlement(userId,postId|creatorId)` → `{entitled, source}` [server/auth].

### Tips & purchases (T2)

- `createTipPayment(creatorId,amountCents,message)` [member].
- `createProductCheckout(productId,qty)` → order [member].
- `unlockPost(postId)` · `unlockPaidMessage(messageId)` → entitlement + transaction [member].
- `requestRefund(transactionId,reason)` [owner].

### Messages (T2 + Realtime)

- `createConversation(participantUserIds)` [auth] · `listConversationsCursor(cursor)` [participant].
- `listMessagesCursor(conversationId,cursor)` [participant] · `sendMessage(conversationId,body|mediaId)` [participant].
- `sendPaidMessage(conversationId, body, priceCents)` [creator] · `markConversationRead(conversationId,messageId)` [participant].
- `getAttachmentSignedUrl(messageId)` → short-lived signed URL after participant + unlock check [participant].

### Notifications (mostly T1 reads)

- `listNotificationsCursor(cursor)` · `getUnreadNotificationCount()` [recipient].
- `markNotificationRead(id)` · `markAllNotificationsRead()` [recipient].
- Generation is **server-side** from event handlers, not a client action.

### Uploads / media (T2)

- `createUploadIntent({kind,mime,bytes})` → signed upload URL + media row (`uploaded`) [owner].
- `completeUpload(mediaId)` → enqueue processing [owner].
- `deleteMedia(mediaId)` [owner] · `getPublicVariant(mediaId)` [public] · `getEntitledSignedUrl(mediaId)` [entitled].
- `processMediaWebhook(payload)` [webhook] — see §6.

### Reports & moderation (T2)

- `createReport(subjectType,subjectId,reason,details)` [auth] · `listMyReports()` [owner].
- `adminListReports(filter,cursor)` · `adminResolveReport(id,resolution)` [moderator].
- `adminSuspendUser(userId)` · `adminRestoreUser(userId)` · `adminRemoveContent(type,id)` [moderator/admin].

### Admin (T2, capability-scoped)

- `adminSearchUsers(query)` · `adminSetRole(userId,role)` [admin].
- `adminReviewVerification(id,decision)` [admin] · `adminReviewTransaction(id)` [finance].
- `adminRetryPayout(id)` [finance] · `adminFeatureCreator(creatorId)` [admin] · `adminGetMetrics()` [admin].

## 4. Input / Output Contracts

- **Validation:** one shared Zod schema per action, used by both client form and server handler. Normalize/validate handles, URLs, currency (3-char), money (non-negative integer cents), text length, MIME type, enum values. Validate file **signatures**, not extensions.
- **Success shape:** prefer the existing `{ ok: true, ... } | { ok: false, error: string }` discriminated union already used in `cabana-auth.ts`. Server actions may additionally throw typed `Response` errors (the middleware pattern) for auth failures.
- **Money:** every money field is `*_cents: number` (integer) + `currency: string`. Outputs never return floats for money.
- **Pagination:** cursor-based on `(created_at, id)` — return `{ items, nextCursor }`. No deep offsets.
- **Idempotency:** money-moving actions accept an `idempotencyKey`; server dedupes via unique constraint (`transactions` provider ref, `webhook_events`).

## 5. Error Handling

| Layer             | Pattern                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1 mutations      | `useCabanaMutations` already wraps each op in try/catch → `toast.error("<label>: <msg>")` and returns `null`; keep this convention                     |
| Analytics         | **Swallow silently** — analytics must never break UX (`cabana-analytics.ts` already does this)                                                         |
| T2 auth failures  | Throw `Response(msg, {status:401/403})` from middleware (see `requireSupabaseAuth`)                                                                    |
| T2 validation     | Return `{ok:false,error}` with field-level detail; 400-class                                                                                           |
| T2 money/webhooks | Never partial-commit; wrap ledger writes in a DB transaction; keep external API calls **outside** the DB transaction (don't hold locks across network) |
| SSR catastrophic  | `src/server.ts` already catches thrown + h3-swallowed 500s and renders a branded error page — preserve                                                 |
| Route-level       | `__root.tsx` `errorComponent` / `notFoundComponent`                                                                                                    |

**Standard error envelope (T2):** `{ ok:false, error:{ code, message, field? } }`. Codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `RATE_LIMITED`, `ENTITLEMENT_REQUIRED`, `PAYMENT_FAILED`, `INTERNAL`.

## 6. Webhook Architecture

Webhooks are the **source of truth** for money. CABANA never trusts a client to report a payment succeeded.

```
Provider (Stripe/payout/media)  ──signed event──▶  /api/webhooks/$provider  (T2/Edge)
   1. Verify signature (reject if invalid)
   2. Idempotency: upsert into `webhook_events` by provider_event_id
        ↳ already processed?  → 200 OK, no-op
   3. Persist raw payload, mark received
   4. Enqueue handler in `outbox_jobs` (do NOT do slow work inline)  → 200 OK fast
   5. Worker drains outbox:
        - payment.succeeded → write immutable `transactions` row, update `content_entitlements`,
          recompute `creator_balances`, create `notifications`, append `audit_logs`
        - subscription.updated → transition `creator_subscriptions.status`
        - payout.paid/failed → update `payouts`, recompute balance
        - media.processed → update `media.processing_status` / variants
   6. Retries with backoff; dead-letter after N attempts; alert finance on reconciliation gaps
```

**Rules:** verify every signature; dedupe by provider event id (unique index); keep the webhook handler fast (ack then process via outbox); reconcile provider balances/transactions/refunds/disputes/payouts on a schedule; never log full signed URLs or card data (use provider-hosted card collection — CABANA never stores raw card data).

**Demo phase:** there is no provider. "Webhooks" are simulated by deterministic client/server actions that create `mock_`-prefixed records and follow the same immutability rules (a succeeded mock transaction is never edited in place). The outbox/idempotency structure should still be modeled so the real provider drops in without reshaping the ledger.
