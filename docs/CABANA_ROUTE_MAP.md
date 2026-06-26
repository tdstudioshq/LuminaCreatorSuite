# CABANA Route Map

> Every route that exists today, every planned route, protection status, and navigation flow. Derived from `src/routes/` (file-based TanStack Router; `src/routeTree.gen.ts` is generated — never hand-edited).
>
> Companion: [`CABANA_COMPONENT_MAP.md`](./CABANA_COMPONENT_MAP.md), [`CABANA_PRODUCT_SPEC.md`](./CABANA_PRODUCT_SPEC.md). Plan only.

---

## 1. Routing Mechanics

- Flat dot-notation files map to nested paths: `dashboard.posts.tsx` → `/dashboard/posts`.
- `dashboard.tsx` is the **layout** route; all `dashboard.*` are children rendered in its `<Outlet/>`.
- `$username.tsx` is a **top-level dynamic** route. ⚠️ It matches arbitrary top-level slugs, so unknown paths like `/foo` render the creator "not claimed" state rather than the generic 404. Reserved/static top-level routes must be declared explicitly to win precedence.
- Protection today is **client-side only**: `dashboard.tsx` and `account.tsx` enforce session and
  account-type redirects; `admin.tsx` checks `useHasRole('admin')`. Protected account data itself
  uses RLS-scoped server actions, but no server route loaders guard pages yet. Hardening this remains
  a security item (see `CABANA_TECH_DEBT.md`).

## 2. Existing Routes (35 route files)

### Public / marketing

| Route              | File                | Protection                   | State                                      |
| ------------------ | ------------------- | ---------------------------- | ------------------------------------------ |
| `/`                | index.tsx           | Public                       | ✅ marketing (CTAs largely non-functional) |
| `/features/ai`     | features.ai.tsx     | Public                       | 🟡 AI marketing demo                       |
| `/pricing`         | pricing.tsx         | Public                       | 🟡 4 plans; no checkout                    |
| `/onboarding`      | onboarding.tsx      | Public (should require auth) | 🟡 7-step wizard; most data not persisted  |
| `/demo`            | demo.tsx            | Public                       | ✅ alias → `aurora`                        |
| `/docs/system`     | docs.system.tsx     | Public                       | 🟡 design-system landing                   |
| `/docs/data-model` | docs.data-model.tsx | Public                       | 🟡 **stale** vs real schema                |

### Auth

| Route              | File                | Protection            | State                                                                                        |
| ------------------ | ------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `/signup`          | signup.tsx          | Public                | ✅ Supabase signup; creator/member toggle → creators to `/onboarding`, members to `/account` |
| `/login`           | login.tsx           | Public (`?redirect=`) | ✅ Supabase login (members reaching `/dashboard` are bounced to `/account` by the guard)     |
| `/forgot-password` | forgot-password.tsx | Public                | ✅ sends reset email                                                                         |
| `/reset-password`  | reset-password.tsx  | Recovery session      | ✅ updates password                                                                          |

### Public creator surface

| Route           | File             | Protection              | State                                                                                    |
| --------------- | ---------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `/$username`    | $username.tsx    | Public                  | ✅ dynamic creator profile; Follow persists; shows public posts + locked follower teases |
| `/post/$postId` | post.$postId.tsx | Public (guest-callable) | ✅ post detail (locked-aware) + comments/likes/saves (Phase 3.2)                         |
| `/td`           | td.tsx           | Public                  | 🟡 bespoke static microsite                                                              |
| `/eldondolla`   | eldondolla.tsx   | Public                  | 🟡 bespoke static microsite                                                              |

### Member account (Phase 2B)

| Route      | File        | Protection                                                  | State                                                                     |
| ---------- | ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/account` | account.tsx | Client auth gate; **member-only** (creators → `/dashboard`) | ✅ member profile foundation (username, display name, bio) via T2 actions |

> The `/dashboard` guard is now account-aware: a signed-in **member** is
> redirected to `/account`, and `/account` redirects a **creator** back to
> `/dashboard`. `account` + `member` are added to `reserved_handles` so the
> slugs can't be claimed as creator handles.

### Creator Studio (`/dashboard/*`, client auth gate)

| Route                      | File                                         | State                                                  |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `/dashboard`               | dashboard.tsx (layout) + dashboard.index.tsx | ✅ overview                                            |
| `/dashboard/profile`       | dashboard.profile.tsx                        | ✅                                                     |
| `/dashboard/links`         | dashboard.links.tsx                          | ✅                                                     |
| `/dashboard/storefront`    | dashboard.storefront.tsx                     | ✅                                                     |
| `/dashboard/analytics`     | dashboard.analytics.tsx                      | ✅                                                     |
| `/dashboard/media-kit`     | dashboard.media-kit.tsx                      | 🟡 hardcoded                                           |
| `/dashboard/ai`            | dashboard.ai.tsx                             | 🟡 simulated                                           |
| `/dashboard/settings`      | dashboard.settings.tsx                       | 🟡 hardcoded                                           |
| `/dashboard/posts`         | dashboard.posts.tsx                          | ✅ real composer + post manager (Phase 3)              |
| `/dashboard/subscribers`   | dashboard.subscribers.tsx                    | ✅ real tier manager + subscriber list (Phase 4, demo) |
| `/dashboard/messages`      | dashboard.messages.tsx                       | 🟡 FoundationPage                                      |
| `/dashboard/earnings`      | dashboard.earnings.tsx                       | 🟡 FoundationPage                                      |
| `/dashboard/notifications` | dashboard.notifications.tsx                  | 🟡 FoundationPage                                      |

### Member foundation (public placeholders — must not render private data)

| Route            | File              | Protection today                               | Target               |
| ---------------- | ----------------- | ---------------------------------------------- | -------------------- |
| `/feed`          | feed.tsx          | ✅ real home feed (signed-in; guests prompted) | Member-auth (P2)     |
| `/discover`      | discover.tsx      | Public placeholder                             | Public + member (P2) |
| `/messages`      | messages.tsx      | Public placeholder                             | Member-auth (P4)     |
| `/notifications` | notifications.tsx | Public placeholder                             | Member-auth (P9)     |

### Admin

| Route    | File      | Protection                 | State                             |
| -------- | --------- | -------------------------- | --------------------------------- |
| `/admin` | admin.tsx | Client role gate (`admin`) | 🟡 8 hardcoded panels, local tabs |

### System

- 404 / error → handled in `__root.tsx` (`notFoundComponent`, `errorComponent`).

## 3. Planned Routes

From `CABANA_BUILD_ROADMAP.md` §6 and the product spec. `$param` = dynamic.

| Route                                                                                     | Audience        | Protection             | Phase |
| ----------------------------------------------------------------------------------------- | --------------- | ---------------------- | ----- |
| `/post/$postId`                                                                           | Public/entitled | Entitlement-gated read | P2–P3 |
| `/creator/$username/subscribe`                                                            | Member          | Member-auth            | P3    |
| `/settings/member`                                                                        | Member          | Member-auth            | P3    |
| `/settings/billing`                                                                       | Member          | Member-auth            | P3/P6 |
| `/messages/$conversationId`                                                               | Member          | Participant-only       | P4    |
| `/dashboard/posts/new`                                                                    | Creator         | Creator-auth           | P2    |
| `/dashboard/posts/$postId/edit`                                                           | Creator         | Creator-auth           | P2    |
| `/dashboard/subscribers/$subscriptionId`                                                  | Creator         | Creator-auth           | P3    |
| `/dashboard/messages/$conversationId`                                                     | Creator         | Participant-only       | P4    |
| `/dashboard/earnings/transactions`                                                        | Creator         | Creator-auth           | P5–P6 |
| `/dashboard/earnings/payouts`                                                             | Creator         | Creator-auth           | P6    |
| `/admin/reports`                                                                          | Moderator       | Server role gate       | P8    |
| `/admin/audit`                                                                            | Admin           | Server role gate       | P7    |
| `/admin/users`, `/admin/finance`                                                          | Admin/finance   | Server role gate       | P7    |
| Legal: `/terms`, `/privacy`, `/creator-agreement`, `/dmca`, `/refunds`, `/content-policy` | Public          | Public                 | P10   |

## 4. Protected vs Public Summary

**Public:** `/`, `/features/ai`, `/pricing`, `/demo`, `/docs/*`, `/$username`, `/td`, `/eldondolla`, all auth routes, future legal pages, `/discover` (public-safe), `/post/$postId` (public posts; gated for restricted).

**Member-auth:** `/account` is implemented with a client account-type gate and protected profile
actions. Future member shell: `/feed`, `/messages`, `/notifications`, `/settings/member`,
`/settings/billing`, `/creator/$username/subscribe`. _Today those placeholders are public and must
render nothing private until the member layout + server gates land._

**Creator-auth (`/dashboard/*`):** all Studio routes. Gate today is client-side; add server loaders.

**Role-gated (admin):** `/admin/*`. Migrate from one client-gated page with local tabs → URL-backed subroutes with **server-validated** capability scopes (moderator/support/finance/admin).

## 5. Navigation Flows

### Auth

```
/signup → choose creator/member → Supabase signUp
        ├─ creator trigger → profile + creator_profile + subscription + role → /onboarding
        └─ member trigger  → profile + member_profile + role → /account
/login  → signInWithPassword → ?redirect or /dashboard
/dashboard (member) → /account
/account (creator) → /dashboard
/dashboard (no session) → /login?redirect=<path>
/forgot-password → email → /reset-password → /dashboard
```

**Known gap:** if email confirmation is required, `signUp` returns no session; onboarding uploads can fail and the dashboard redirects to login. Needs an explicit "verify your email" branch (P7).

### Creator

```
/dashboard ─┬─ /profile ── public preview (/$username)
            ├─ /links ── public links
            ├─ /storefront ── public product cards
            ├─ /analytics · /media-kit · /ai · /settings
            └─ (future) /posts · /subscribers · /messages · /earnings · /notifications
```

### Member (current + target)

```
/account → edit private member display name + bio
/discover → /$username → persistent follow/unfollow
/discover → /$username → /creator/$username/subscribe → mock checkout → entitlement
/feed → /post/$postId → comments/likes/saves
/messages → /messages/$conversationId
/notifications → deep-link to entity (post/conversation/creator)
```

### Admin (target)

```
/admin → /admin/reports → report detail → action (audit-logged) → appeal
       → /admin/users · /admin/finance · /admin/audit
```

## 6. Route Hardening Backlog

- Keep static top-level routes synchronized with `reserved_handles` (`account` and `member` were
  added in Phase 2B) so `/$username` cannot shadow real pages.
- Add server-side route loaders / guards for `/dashboard/*` and `/admin/*` (don't rely on client gates).
- Introduce the member layout so member routes can require auth and stop being public placeholders.
- Move admin from local tabs to URL-backed subroutes.
- Allow-list the `?redirect=` target (currently consumed directly).
