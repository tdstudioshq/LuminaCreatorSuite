# CABANA Product Specification

> Master product specification — the canonical description of what CABANA is, who it serves, and what it will become.
>
> Companion documents: [`CABANA_DATABASE.md`](./CABANA_DATABASE.md), [`CABANA_API.md`](./CABANA_API.md), [`CABANA_COMPONENT_MAP.md`](./CABANA_COMPONENT_MAP.md), [`CABANA_ROUTE_MAP.md`](./CABANA_ROUTE_MAP.md), [`CABANA_BUILD_PHASES.md`](./CABANA_BUILD_PHASES.md), [`CABANA_TECH_DEBT.md`](./CABANA_TECH_DEBT.md).
>
> Source of truth for current state: [`../CABANA_ARCHITECTURE.md`](../CABANA_ARCHITECTURE.md). This document is descriptive and forward-looking; it does not authorize building anything by itself.

---

## 0. Product Boundary Decision Record (opened July 11, 2026 — awaiting Tyler's rulings)

> **Status: OPEN.** Backlog item 19 found that the product boundary has been _executed in code_ (both a
> link-in-bio creator OS **and** a demo-money subscription platform shipped) but never _recorded as
> decided_ — and the three "source of truth" docs disagree with each other and with the tree. This record
> exists to capture Tyler's explicit ruling on each open question so downstream code items (microsite
> fate, the `subscriptions`→`platform_subscriptions` rename, `products.price`→`price_cents`, and every
> "M8"-gated row) have a decided boundary to build against. **No code/schema changes here** — each ruling
> that mandates work becomes its own gated backlog item. Fill in each **Ruling** line; recommended
> defaults are marked but non-binding.

**D1 — Link-in-bio pillar: permanent product pillar, or legacy/maintenance-only?**
Evidence both ways: §1 sells the unified four-vendor bundle (pillar), but the Batch 2 "two-homes" IA
demoted `DashHome` to `/dashboard/link-in-bio` ("My Page") and a legacy `/dashboard/analytics`
(page-view/click) coexists with the subscription `/dashboard/performance`. The ruling drives whether the
legacy link-in-bio + its analytics get continued investment or a documented sunset path.
- _Recommended:_ keep as a permanent pillar (it is core to the "unified creator OS" thesis), but freeze
  new investment in the **legacy** page-view analytics surface.
- **Ruling:** _(pending Tyler)_

**D2 — Bespoke microsites (`/td`, `/thetejeda`, `/eldondolla`, `/danielasanchez`) + `/demo`→aurora.**
~975 hardcoded lines, zero DB reads; marked "optional" in two tech-debt sections. Keep as white-glove
bespoke pages, migrate to a templated `$username` variant system, or delete?
- _Recommended:_ keep the four real microsites (they are live client pages); migrating to a shared
  renderer is an optional G-release refactor. Delete `/demo` (public aurora alias) as a dead surface.
- **Ruling:** _(pending Tyler)_

**D3 — SaaS platform billing (Atelier/Studio/Maison/Empire).**
The baseline still provisions a free-plan `subscriptions` row per signup and stamps `profiles.plan`
(shown in the Sidebar), but **no app code queries the `subscriptions` table** and there is no
pricing/upgrade surface. Real future second revenue system, or shelved?
- _Recommended:_ shelve for now; keep the provisioning + plan display (harmless, owner-read-only). Revisit
  as part of/after M8. If shelved, the `subscriptions`→`platform_subscriptions` rename stays deferred.
- **Ruling:** _(pending Tyler)_

**D4 — "Invitation-led" positioning.**
§1 calls CABANA "invitation-led", but signup is fully open (creator/member choice, no invite/access
code). Real launch gate to build, or wording to drop?
- _Recommended:_ drop the "invitation-led" wording until/unless an invite gate is a funded feature.
- **Ruling:** _(pending Tyler)_

**D5 — The real-money milestone currently called "M8".**
"M8" gates all real-money work in ~8 tech-debt rows but is **defined nowhere** (no M-milestone lineage
exists in this repo). Name it, scope it, and set entry criteria — consolidated in
[`CABANA_M8_READINESS.md`](./CABANA_M8_READINESS.md).
- _Recommended:_ adopt the existing "Phase 7 — Payments & Payouts (Real Money)" definition
  (`CABANA_BUILD_PHASES.md`) as the canonical M8 scope; ratify the readiness checklist.
- **Ruling:** _(pending Tyler)_

**D6 — Permanence of the no-adult-content constraint.**
Worded as a "current" non-goal in §2 while CLAUDE.md treats it as a hard constraint; Phase 8B added a
`sexual_content` **report** reason (a safety category, not adult functionality). A permanent ruling
materially changes the age-assurance/compliance/legal roadmap.
- _Recommended:_ make it a **permanent** hard constraint (keeps CLAUDE.md, compliance scope, and legal
  posture consistent; the report reason stays a safety tool).
- **Ruling:** _(pending Tyler)_

**Sign-off:** _(Tyler — date + initials once D1–D6 are ruled)_ ____________________

---

## 1. Vision

CABANA is a **premium, invitation-led creator subscription platform**. It combines the things creators currently buy from four different vendors — a link-in-bio page, a storefront, a media kit/analytics suite, and a fan subscription/messaging network — into one cinematic, mobile-first product with a luxury dark visual identity.

The strategic thesis: generic link-in-bio tools (Linktree) and mass-market subscription platforms (Patreon, OnlyFans, Fanhouse) treat the creator as a row in a database. CABANA treats the creator's page as a flagship brand surface and the fan relationship as a premium, high-trust membership. The product wins on **art direction, trust, and a unified creator OS**, not on being the cheapest tool.

The expansion is **strictly additive**: the working creator OS (profiles, links, storefront, analytics) is preserved and extended into social publishing, fan subscriptions, messaging, and creator payouts — never rebuilt.

## 2. Product Goals

| #   | Goal                                                                              | Success signal                                                                            |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| G1  | Preserve and harden the existing creator OS                                       | No regressions in profile/links/storefront/analytics; dead buttons and `#` links resolved |
| G2  | Introduce a true member/fan account type distinct from creators                   | A user can sign up as a fan, follow creators, and never see a creator dashboard           |
| G3  | Ship a social publishing layer (posts, media, comments, likes, saves)             | Creators publish posts with `public`/`followers`/`subscribers`/`purchase` visibility      |
| G4  | Enable fan-to-creator subscriptions with content entitlements                     | Locked content is gated by server-verified entitlement, not client flags                  |
| G5  | Add private messaging and a durable notification system                           | Realtime inbox + notification center scoped by RLS                                        |
| G6  | Add a real money system (transactions, balances, payouts) — demo first, then real | Immutable ledger; integer-cents money; webhook-sourced truth                              |
| G7  | Replace the hardcoded admin with server-gated moderation and operations           | Admin actions are server-authorized and audit-logged                                      |
| G8  | Reach a launch-ready posture: legal, compliance, security, observability          | Reproducible DB baseline, RLS audited, CSP, CI, monitoring                                |

**Non-goals (explicit, current):** no adult-content functionality; no real payment processor until mock flows are accepted; no KYC/payout provider until the ledger is proven; no native mobile app (responsive web only).

## 3. User Personas

### P1 — Independent Creator ("Aurora")

A visual artist / musician / model / coach with an established audience on other platforms. Wants a flagship page that looks expensive, a place to sell drops, and recurring income from superfans without giving away brand control. Cares about art direction, analytics, and getting paid reliably. **Primary revenue persona.**

### P2 — Creator-Management / Agency

Manages several creators. Referenced in marketing and pricing (Empire tier) but has **no working multi-seat product today**. Future need: team roles, multi-creator switching, consolidated finance. _Out of MVP scope; tracked as Long-term._

### P3 — Member / Fan ("Maya")

Follows creators, subscribes to the ones she loves, buys drops, tips, and messages. Wants a clean feed, a clear "what I'm paying for," and private, respectful access. **Does not exist as a role yet** — every signup currently becomes a creator. Creating this persona is the single biggest unlock (G2).

### P4 — Admin / Operator (internal)

Anthropic-of-CABANA: trust & safety, finance, support. Needs real user/role management, report queues, verification, payout exceptions, and audit history. Today the `/admin` route is role-gated but entirely hardcoded.

Sub-roles to separate over time: **moderator** (reports, content), **support** (account lookup), **finance** (transactions, payouts, refunds), **admin** (roles, policy), **super-admin** (capability administration).

## 4. Creator Journey

```
Discover CABANA (marketing/invite)
  → Sign up  → Onboarding wizard (creator type, theme, handle, socials, avatar)
  → Studio overview (/dashboard)
  → Build page: Profile editor · Link manager · Storefront
  → Publish: Posts composer (public → followers → subscribers → paid)   [Phase 2–3]
  → Grow: Analytics · Media kit · AI Studio · Discover placement
  → Monetize: Subscription tiers · Tips · Paid posts · Paid messages     [Phase 3, 5]
  → Operate: Subscribers · Messages · Notifications · Earnings ledger     [Phase 2–6]
  → Get paid: Connected account · KYC · Payouts                           [Phase 6]
```

Current reality: the journey is fully working only through "Build page." Everything from "Publish" onward is a luxury placeholder (`FoundationPage`) or demo data.

## 5. Member Journey

```
Discover a creator (public /$username, /discover, share link)
  → Sign up as a member (role choice — does not exist yet)                [Phase 1/2]
  → Member home: Feed of followed/subscribed creators                     [Phase 2–3]
  → Follow creators (persistent)                                          [Phase 2]
  → Engage: like · comment · save                                         [Phase 2]
  → Subscribe to a creator tier (mock checkout → real)                    [Phase 3, 6]
  → Unlock: subscriber posts · paid posts · paid messages                 [Phase 3–5]
  → Communicate: DM subscribed creators                                   [Phase 4]
  → Manage: billing · purchase history · notifications · privacy · blocks [Phase 3–9]
```

Current reality: members can only browse public creator pages and open external links. Follow state is local React state that resets on refresh. `/feed`, `/discover`, `/messages`, `/notifications` are public placeholders that must never render private data.

## 6. Admin Journey

```
Admin signs in → role gate (server-validated)                            [Phase 7]
  → Operations overview (real metrics)
  → Users & roles: search, set role, restrict/suspend/restore
  → Verification: review creator KYC/identity requests
  → Moderation: report queue → triage → action → appeal → audit          [Phase 8]
  → Finance: transactions, balances, payout review, refunds, disputes     [Phase 6–7]
  → Curation: featured creators, discovery placement
  → Audit: immutable log viewer
```

Current reality: `/admin` gates on `user_roles.role = 'admin'` (client-side) and shows eight hardcoded panels with no real queries or actions.

## 7. Monetization Model

**Two distinct revenue systems that must never be conflated:**

1. **Platform (SaaS) billing — CABANA charges creators.** Plans: Atelier, Studio, Maison, Empire (today the `subscriptions` table holds this; it should be renamed `platform_subscriptions`). The `profiles.plan` / `creator_profiles.plan` string and pricing page describe this.
2. **Marketplace billing — fans pay creators, CABANA takes a fee.** Fan-to-creator subscriptions, paid posts/unlocks, tips, paid messages, and product orders. This is the `creator_subscriptions` + `transactions` + `creator_balances` + `payouts` world.

**Revenue primitives (marketplace):**

| Primitive            | Fan pays for                                      | Recurrence | Entitlement granted                                   |
| -------------------- | ------------------------------------------------- | ---------- | ----------------------------------------------------- |
| Creator subscription | A tier (e.g. "Inner Circle" $19, "Backstage" $39) | Recurring  | All `subscribers`-visibility content for that creator |
| Paid post / unlock   | A single locked post                              | One-time   | That post only                                        |
| Tip                  | Appreciation                                      | One-time   | None (optional thank-you)                             |
| Paid message         | A locked message/attachment                       | One-time   | That message                                          |
| Product order        | A physical/download/membership item               | One-time   | The product / download                                |

**Money rules (non-negotiable, apply in demo and production):**

- All amounts are **integer minor units (cents)** plus an explicit currency. Never floats, never display strings for math.
- Creator balance is **derived** from succeeded transactions minus platform fee, processor fee, refunds, and payouts — never independently stored as truth.
- Settled (`succeeded`) transaction amounts are **immutable**.
- Mock provider references are prefixed `mock_`; every demo monetization surface carries a visible "Demo" label.
- Production financial state is written only by trusted server functions / verified webhooks, never by browser mutations.
- Fee model (demo default, see `cabana-demo-data.ts`): platform fee 10%, processor fee 3%, creator net = gross − both.

## 8. Information Architecture

```
CABANA
├── Public / Marketing
│   ├── Landing (/)
│   ├── AI marketing (/features/ai)
│   ├── Pricing (/pricing)
│   ├── Onboarding (/onboarding)
│   └── Internal docs (/docs/system, /docs/data-model)
├── Auth
│   └── /signup · /login · /forgot-password · /reset-password
├── Public Creator Surface
│   ├── /$username (dynamic profile)
│   ├── /demo (alias → aurora)
│   └── /td · /eldondolla (bespoke microsites)
├── Member App (authenticated fan)            [mostly future]
│   ├── /feed · /discover
│   ├── /messages · /notifications
│   └── future: /post/$id · /settings/member · /settings/billing
├── Creator Studio (/dashboard, auth-gated)
│   ├── index · profile · links · storefront · analytics
│   ├── media-kit · ai · settings
│   └── posts · subscribers · messages · earnings · notifications   [foundations]
└── Admin (/admin, role-gated)                [hardcoded today]
    └── future: /admin/reports · /admin/audit · users · finance
```

Two app shells will emerge: an **authenticated member layout** (for fan routes) and the existing **`/dashboard` creator layout**. Admin should migrate from local tabs to URL-backed subroutes.

## 9. Feature Matrix

Status legend: ✅ Implemented · 🟡 Demo/placeholder · ⬜ Not built

| Domain        | Feature                                                         | Status                      | Target phase |
| ------------- | --------------------------------------------------------------- | --------------------------- | ------------ |
| Auth          | Email/password signup, login, password reset                    | ✅                          | —            |
| Auth          | Member vs creator role choice / upgrade                         | ⬜                          | P1–P2        |
| Auth          | OAuth, MFA, CAPTCHA, email-verify branch                        | ⬜                          | P7           |
| Profile       | Creator profile CRUD (name/handle/bio/avatar/theme)             | ✅                          | —            |
| Profile       | Banner upload                                                   | ⬜                          | P1           |
| Profile       | Apply saved theme to public page                                | ⬜ (stored, unused)         | P1           |
| Profile       | Member profiles + privacy                                       | ⬜                          | P2           |
| Links         | Link CRUD, feature, reorder, click analytics                    | ✅                          | —            |
| Links         | URL validation, atomic reorder, true scheduling                 | 🟡                          | P1           |
| Storefront    | Product CRUD + image upload                                     | ✅                          | —            |
| Storefront    | Checkout, orders, digital delivery, inventory                   | ⬜                          | P6           |
| Analytics     | Page/link/product event capture + dashboard                     | ✅                          | —            |
| Analytics     | Unique visitors, geo/device/referrer, export                    | ⬜                          | P10          |
| Social        | Posts (composer, visibility, schedule)                          | ⬜ (types only)             | P2           |
| Social        | Comments, likes, saves                                          | ⬜ (types only)             | P2           |
| Social        | Persistent follows                                              | ⬜ (local only)             | P2           |
| Social        | Member feed + discovery/search                                  | 🟡 placeholder              | P2           |
| Monetization  | Fan subscriptions + entitlements                                | ⬜ (types/demo)             | P3           |
| Monetization  | Tips, paid posts, paid messages                                 | ⬜ (types/demo)             | P3–P5        |
| Monetization  | Mock checkout flow                                              | ⬜                          | P3           |
| Payments      | Real processor, billing portal, refunds, disputes               | ⬜                          | P6           |
| Payouts       | Connected accounts, KYC, ledger, payout scheduling              | ⬜                          | P6           |
| Messaging     | Conversations, messages, realtime, read state, attachments      | 🟡 placeholder (types/demo) | P4           |
| Notifications | Notification center, unread counts, email/push                  | 🟡 placeholder (types/demo) | P9           |
| Admin         | User/role mgmt, real metrics                                    | 🟡 hardcoded                | P7           |
| Moderation    | Reports, blocks, suspensions, takedowns, appeals                | ⬜ (types only)             | P8           |
| Media         | Private buckets, signed URLs, video/audio, processing           | ⬜                          | P5–P6        |
| AI Studio     | Bio/CTA/caption/theme generation                                | 🟡 simulated                | Long-term    |
| Media kit     | Sponsorship kit + export                                        | 🟡 hardcoded                | Long-term    |
| Settings      | Integrations (Stripe/Mailchimp/Shopify/Calendly), custom domain | 🟡 hardcoded                | Long-term    |
| Compliance    | Legal pages, acceptance records, DMCA, tax                      | ⬜                          | P10          |
| Platform      | Reproducible baseline migration, CI, observability              | ⬜                          | P1–P2        |

## 10. Roadmap — MVP / Phase 2 / Long-term

### MVP (the canonical V1 product boundary)

The decision the architecture doc demands: **CABANA V1 is the creator OS + a real member layer + public/free social publishing + fan subscriptions in demo (mock-money) mode.** Concretely:

- Harden existing creator OS (G1).
- Real member accounts, persistent follows, member feed (G2, G3 public scope).
- Posts/comments/likes/saves with `public`/`followers`/`subscribers` visibility.
- Fan subscriptions + entitlements with **mock checkout** (no real money).
- Reproducible DB baseline + audited RLS + private media buckets.

This corresponds to Build Phases 1–3 (+ the platform foundation work threaded through them).

### Phase 2 (post-MVP, depth)

- Messaging (conversations, realtime, paid messages) — Build Phase 4.
- Durable notifications + email outbox — Build Phase 9.
- Admin operations + moderation on real data — Build Phases 7–8.
- Real payments + payouts (processor, KYC, ledger reconciliation) — Build Phase 6.

### Long-term (12-month horizon)

- Agency / multi-seat product (P2 persona).
- Real AI generation service replacing simulated AI Studio.
- Live media-kit export and real integration connectors (Stripe/Mailchimp/Shopify/Calendly, custom domains, social import).
- Advanced analytics (sessions, attribution, cohorts), discovery/search service.
- Compliance & launch hardening: legal pages, DMCA, tax, age assurance, pen-test, performance, DR runbook — Build Phase 10.

> Note on numbering: the **Product** roadmap above (MVP / Phase 2 / Long-term) groups outcomes for stakeholders. The **engineering** sequence is the 10 ordered phases in [`CABANA_BUILD_PHASES.md`](./CABANA_BUILD_PHASES.md). Where they differ, build phases are authoritative for sequencing.
