# CABANA Route Map

> Every route that exists today, every planned route, protection status, and navigation flow. Derived from `src/routes/` (file-based TanStack Router; `src/routeTree.gen.ts` is generated — never hand-edited). Refreshed July 9, 2026 (post UI/UX audit Batches 1–2 + the July 9 cleanup, committed on `main`).
>
> Companion: [`CABANA_COMPONENT_MAP.md`](./CABANA_COMPONENT_MAP.md), [`CABANA_PRODUCT_SPEC.md`](./CABANA_PRODUCT_SPEC.md).

---

## 1. Routing Mechanics

- Flat dot-notation files map to nested paths: `dashboard.posts.tsx` → `/dashboard/posts`.
- `dashboard.tsx` is the **layout** route; all `dashboard.*` are children rendered in its `<Outlet/>`.
- `$username.tsx` is a **top-level dynamic** route. ⚠️ It matches arbitrary top-level slugs, so unknown paths like `/foo` render the creator "not claimed" state rather than the generic 404. Reserved/static top-level routes must be declared explicitly to win precedence.
- Protection today is **client-side only**: `dashboard.tsx` and `account.tsx` enforce session and
  account-type redirects; `admin.tsx` checks `useHasRole('admin')`; the real admin subroutes wrap
  their content in `StaffGate` (admin or moderator) or `AdminGate` (admin only). Protected data
  itself is server-enforced via RLS-scoped server actions and SECURITY DEFINER RPCs, but no server
  route loaders guard pages yet. Hardening this remains a security item (see `CABANA_TECH_DEBT.md`).

## 2. Existing Routes (46 route files + `__root.tsx`)

### Public / marketing

| Route              | File                | Protection                   | State                                                                                                                     |
| ------------------ | ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/`                | index.tsx           | Public                       | ✅ sign-in (`LoginCard`); signed-in users redirected to `/dashboard` — no marketing landing today                         |
| `/pricing`         | pricing.tsx         | Public                       | ↪ `beforeLoad` redirect to `/signup` (no pricing page)                                                                    |
| `/onboarding`      | onboarding.tsx      | Public (should require auth) | ✅ profile-first 4-step builder (Identity · Links · Look · Preview) persisting real data; **no auth guard yet** (Batch 2) |
| `/demo`            | demo.tsx            | Public                       | ✅ alias → `aurora`                                                                                                       |
| `/docs/system`     | docs.system.tsx     | Public                       | 🟡 design-system landing                                                                                                  |
| `/docs/data-model` | docs.data-model.tsx | Public                       | 🟡 **stale** vs real schema                                                                                               |

> `features.ai.tsx` and `dashboard.ai.tsx` have been deleted — there are no AI routes.

### Auth

| Route              | File                | Protection            | State                                                                                                    |
| ------------------ | ------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `/signup`          | signup.tsx          | Public                | ✅ Supabase signup; creator/member toggle → creators to `/onboarding`, members to `/account`             |
| `/login`           | login.tsx           | Public (`?redirect=`) | ✅ `LoginCard` (password + Google OAuth); signed-in users redirected to `/dashboard`; same card as `/`   |
| `/auth/callback`   | auth.callback.tsx   | Public (noindex)      | ✅ OAuth landing — members → `/account`, brand-new users → `/onboarding`, returning users → `/dashboard` |
| `/forgot-password` | forgot-password.tsx | Public                | ✅ sends reset email                                                                                     |
| `/reset-password`  | reset-password.tsx  | Recovery session      | ✅ updates password                                                                                      |

### Public creator surface

| Route                       | File                         | Protection              | State                                                                                           |
| --------------------------- | ---------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `/$username`                | $username.tsx                | Public                  | ✅ dynamic creator profile; Follow persists; shows public posts + locked follower teases        |
| `/post/$postId`             | post.$postId.tsx             | Public (guest-callable) | ✅ post detail (locked-aware) + comments/likes/saves (Phase 3.2)                                |
| `/messages/$conversationId` | messages.$conversationId.tsx | Client auth gate        | ✅ conversation thread + composer + realtime (Phase 5)                                          |
| `/td`                       | td.tsx                       | Public                  | 🟡 bespoke static microsite (Batch 1: real "Follow on Instagram" link, not a fake local follow) |
| `/eldondolla`               | eldondolla.tsx               | Public                  | 🟡 bespoke static microsite                                                                     |
| `/thetejeda`                | thetejeda.tsx                | Public                  | 🟡 bespoke static microsite                                                                     |
| `/danielasanchez`           | danielasanchez.tsx           | Public                  | 🟡 bespoke static microsite                                                                     |

### Member account (Phase 2B)

| Route      | File        | Protection                                                  | State                                                                     |
| ---------- | ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/account` | account.tsx | Client auth gate; **member-only** (creators → `/dashboard`) | ✅ member profile foundation (username, display name, bio) via T2 actions |

> The `/dashboard` guard is account-aware: a signed-in **member** is
> redirected to `/account`, and `/account` redirects a **creator** back to
> `/dashboard`. `account` + `member` are added to `reserved_handles` so the
> slugs can't be claimed as creator handles.

### Creator Studio (`/dashboard/*`, client auth gate)

| Route                      | File                                         | State                                                                                                                |
| -------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`               | dashboard.tsx (layout) + dashboard.index.tsx | ✅ creator business home — WelcomeLive banner + KPIs, revenue/subscriber summaries (Batch 2 IA fix)                  |
| `/dashboard/home`          | dashboard.home.tsx                           | ✅ redirect → `/dashboard` (legacy deep links preserved; Batch 2)                                                    |
| `/dashboard/link-in-bio`   | dashboard.link-in-bio.tsx                    | ✅ "My Page" — link-in-bio overview (`DashHome`: traffic stats, 14-day chart, quick links; Batch 2)                  |
| `/dashboard/profile`       | dashboard.profile.tsx                        | ✅                                                                                                                   |
| `/dashboard/links`         | dashboard.links.tsx                          | ✅                                                                                                                   |
| `/dashboard/storefront`    | dashboard.storefront.tsx                     | ✅                                                                                                                   |
| `/dashboard/analytics`     | dashboard.analytics.tsx                      | ✅ legacy link-in-bio page-view/click analytics                                                                      |
| `/dashboard/performance`   | dashboard.performance.tsx                    | ✅ creator analytics — revenue over time, subscriber growth, top content (Phase 11B, demo money)                     |
| `/dashboard/media-kit`     | dashboard.media-kit.tsx                      | 🟡 sample-data demo, honestly labeled (Batch 1); hero bound to the real profile                                      |
| `/dashboard/settings`      | dashboard.settings.tsx                       | 🟡 sample-data demo, honestly labeled (Batch 1); integrations rest as "coming soon", no fake states                  |
| `/dashboard/posts`         | dashboard.posts.tsx                          | ✅ real composer + post manager (Phase 3)                                                                            |
| `/dashboard/subscribers`   | dashboard.subscribers.tsx                    | ✅ real tier manager + subscriber roster (Phase 4/11A, demo)                                                         |
| `/dashboard/messages`      | dashboard.messages.tsx                       | ✅ redirect → `/messages` (real inbox; sidebar item repointed + unread badge; Batch 2)                               |
| `/dashboard/earnings`      | dashboard.earnings.tsx                       | ✅ real earnings dashboard — balance, ledger, tips, sales, payouts (Phase 6, demo)                                   |
| `/dashboard/notifications` | dashboard.notifications.tsx                  | ✅ real notifications center — unread/type filters, click-through mark-read, mark all, activity, settings (Phase 9B) |

### Member / social surfaces

| Route            | File              | Protection                                    | State                                                                 |
| ---------------- | ----------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `/feed`          | feed.tsx          | Public route; signed-in feed, guests prompted | ✅ real home feed (RLS-filtered feed RPCs)                            |
| `/discover`      | discover.tsx      | Public (noindex, guest-callable)              | ✅ real discovery + global search (Phase 10); public projections only |
| `/messages`      | messages.tsx      | Client auth gate                              | ✅ real inbox (Phase 5)                                               |
| `/notifications` | notifications.tsx | Client auth gate (guest → foundation)         | ✅ member notifications center + preferences (Phase 9B)               |

### Admin

| Route                               | File                                 | Protection                 | State                                                                                                                                        |
| ----------------------------------- | ------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin`                            | admin.tsx                            | Client role gate (`admin`) | 🟡 labeled demo shell (Batch 1: hub-wide "Demo preview" pill, non-functional controls disabled, real-tools grid linking the five live tools) |
| `/admin/reports`                    | admin.reports.tsx                    | Client `StaffGate` (staff) | ✅ real moderation queue (Phase 8)                                                                                                           |
| `/admin/audit`                      | admin.audit.tsx                      | Client `StaffGate` (staff) | ✅ real append-only audit log (Phase 8)                                                                                                      |
| `/admin/finance`                    | admin.finance.tsx                    | Client `AdminGate` (admin) | ✅ real finance overview over the mock ledger (Phase 8C.1, read-only)                                                                        |
| `/admin/ledger`                     | admin.ledger.tsx                     | Client `AdminGate` (admin) | ✅ real ledger explorer + CSV export (Phase 8C.1)                                                                                            |
| `/admin/ledger/$transactionId`      | admin.ledger.$transactionId.tsx      | Client `AdminGate` (admin) | ✅ transaction detail (Phase 8C.1)                                                                                                           |
| `/admin/payouts`                    | admin.payouts.tsx                    | Client `AdminGate` (admin) | ✅ real payout review queue — approve/hold/release/reject/mark-paid (Phase 8C.2, demo money)                                                 |
| `/admin/creators`                   | admin.creators.tsx                   | Client `AdminGate` (admin) | ✅ live creator directory over real `creator_profiles` (Phase 2A; paginated; `user_id`/email never wired to the browser)                     |
| `/admin/creators/new`               | admin.creators.new.tsx               | Client `AdminGate` (admin) | ✅ admin creator-page create form (Phase 2A; audited SECURITY DEFINER RPC)                                                                   |
| `/admin/creators/$creatorProfileId` | admin.creators.$creatorProfileId.tsx | Client `AdminGate` (admin) | ✅ admin creator-page editor — identity/appearance/links/lifecycle/ownership/preview/audit (Phase 2A; cloud `20260540`, prod July 15 2026)   |

### System

- 404 / error → handled in `__root.tsx` (`notFoundComponent`, `errorComponent`).
- `/api/webhooks/stream` (`api.webhooks.stream.ts`) — **server route, POST only**: the Cloudflare
  Stream lifecycle webhook. No component; the handler (dynamically imported
  `stream-webhook.server.ts`) verifies the `Webhook-Signature` HMAC before touching anything,
  then applies a compare-and-set lifecycle update to `stream_videos` + linked `post_media`.
  Unsigned/invalid → 401; malformed payload → 400; unknown UID → 200 no-op. Not yet registered
  with Cloudflare (registration is a separate, approval-gated step).

## 3. Planned Routes

From `CABANA_BUILD_ROADMAP.md` §6 and the product spec. `$param` = dynamic. (Shipped rows have been
removed: `/post/$postId`, `/messages/$conversationId`, `/admin/reports`, `/admin/audit`,
`/admin/finance` — plus `/admin/ledger` and `/admin/payouts` — all exist above.)

| Route                                                                                     | Audience | Protection       | Phase         |
| ----------------------------------------------------------------------------------------- | -------- | ---------------- | ------------- |
| `/creator/$username/subscribe`                                                            | Member   | Member-auth      | P3            |
| `/settings/member`                                                                        | Member   | Member-auth      | P3            |
| `/settings/billing`                                                                       | Member   | Member-auth      | P3/P6         |
| `/dashboard/posts/new`                                                                    | Creator  | Creator-auth     | P2            |
| `/dashboard/posts/$postId/edit`                                                           | Creator  | Creator-auth     | P2            |
| `/dashboard/subscribers/$subscriptionId`                                                  | Creator  | Creator-auth     | P3            |
| `/dashboard/earnings/transactions`                                                        | Creator  | Creator-auth     | P5–P6         |
| `/dashboard/earnings/payouts`                                                             | Creator  | Creator-auth     | P6            |
| `/admin/users`                                                                            | Admin    | Server role gate | P7            |
| Legal: `/terms`, `/privacy`, `/creator-agreement`, `/dmca`, `/refunds`, `/content-policy` | Public   | Public           | Batch 6 / P10 |

## 4. Protected vs Public Summary

**Public:** `/` and `/login` (sign-in card; signed-in → `/dashboard`), `/signup`, `/auth/callback`,
`/forgot-password`, `/reset-password`, `/demo`, `/docs/*`, `/$username`, `/td`, `/eldondolla`,
`/thetejeda`, `/danielasanchez`, `/discover` (real but noindex; public projections only),
`/post/$postId` (public posts; gated for restricted), future legal pages. `/pricing` redirects to
`/signup`.

**Member-auth (client-gated):** `/account` (account-type gate + protected profile actions),
`/messages` + `/messages/$conversationId`, `/notifications` (guest → foundation). `/feed` renders
signed-in data and prompts guests. Data on all of these is server-enforced via RLS / feed RPCs;
the route gates themselves are client-side. Future member shell: `/settings/member`,
`/settings/billing`, `/creator/$username/subscribe`.

**Creator-auth (`/dashboard/*`):** all Studio routes. Gate today is client-side; add server loaders.

**Role-gated (admin):** `/admin` (labeled demo shell) plus the real URL-backed subroutes
`/admin/reports`, `/admin/audit` (StaffGate: admin or moderator) and `/admin/finance`,
`/admin/ledger`, `/admin/ledger/$transactionId`, `/admin/payouts` (AdminGate: admin only). Gates
are client components; the underlying reads/writes are server-validated (RLS +
`is_current_user_staff` / `is_current_user_admin`). Server route guards remain a hardening item.

## 5. Navigation Flows

### Auth

```
/ or /login → LoginCard → signInWithPassword or Google OAuth
        ├─ password → ?redirect or /dashboard
        └─ Google  → /auth/callback → member → /account · new user → /onboarding · returning → /dashboard
/signup → choose creator/member → Supabase signUp
        ├─ creator trigger → profile + creator_profile + subscription + role → /onboarding
        └─ member trigger  → profile + member_profile + role → /account
/dashboard (member) → /account
/account (creator) → /dashboard
/dashboard (no session) → /login?redirect=<path>
/forgot-password → email → /reset-password → /dashboard
```

**Known gap:** if email confirmation is required, `signUp` returns no session; onboarding uploads can fail and the dashboard redirects to login. Needs an explicit "verify your email" branch.

### Creator

```
/dashboard (creator business home) ─┬─ /posts · /subscribers · /earnings · /performance · /notifications
                                    ├─ /messages → redirects to the real /messages inbox
                                    ├─ /link-in-bio ("My Page") · /links · /storefront · /analytics · /media-kit
                                    └─ /profile ── public preview (/$username) · /settings
```

### Member

```
/account → edit private member display name + bio
/discover → /$username → persistent follow/unfollow
/discover → /$username → subscribe (mock checkout on the profile) → entitlement
/feed → /post/$postId → comments/likes/saves
/messages → /messages/$conversationId
/notifications → deep-link to entity (post/conversation/creator)
```

### Admin

```
/admin (demo shell + real-tools grid)
       → /admin/reports → report detail → triage (audit-logged)
       → /admin/audit · /admin/finance · /admin/ledger → /admin/ledger/$transactionId · /admin/payouts
       → (target) /admin/users
```

## 6. Route Hardening Backlog

- Keep static top-level routes synchronized with `reserved_handles` (`account` and `member` were
  added in Phase 2B) so `/$username` cannot shadow real pages — the bespoke microsites
  (`td`, `eldondolla`, `thetejeda`, `danielasanchez`) are top-level slugs too.
- Add server-side route loaders / guards for `/dashboard/*` and `/admin/*` (don't rely on client
  gates — `StaffGate`/`AdminGate` and the dashboard guard are all client components).
- Onboarding field validation (URL/email shape, username availability) — deferred to Batch 4
  (the auth guard + URL-backed steps + draft recovery landed in Batch 2).
- Allow-list the `?redirect=` target (currently consumed directly).
