# CABANA Component Map

> Inventory of the component tree under `src/components/` plus route-embedded components, and how they compose. Refreshed July 9, 2026 against the actual tree (post UI/UX audit Batches 1–2 + the July 9 cleanup, committed on `main`).
>
> Companion: [`CABANA_ROUTE_MAP.md`](./CABANA_ROUTE_MAP.md), [`CABANA_PRODUCT_SPEC.md`](./CABANA_PRODUCT_SPEC.md).

---

## 1. Layering Overview

```
App shell (__root.tsx)
 └─ QueryClientProvider + Sonner Toaster + HeadContent/Scripts
    ├─ / and /login            → cabana/auth/LoginCard (shared sign-in card)
    ├─ Social surfaces         → cabana/social/SocialShell (3-column: SocialNav · content · right rail)
    │    $username, /account, /feed, /post/$postId, /discover, /messages, /notifications
    ├─ Creator Studio (/dashboard) → DashSidebar + MobileTabs + cabana/dashboard/*
    ├─ Admin demo hub (/admin) → route-embedded labeled demo shell + links to real tools
    └─ Real admin subroutes    → ModerationShell (StaffGate) · FinanceShell (AdminGate)
```

**Styling convention (important):** CABANA screens mostly use **raw HTML + Tailwind + CABANA CSS utilities** (`.btn-luxury`, `.btn-ghost`, `.glass`, `.glass-strong`, `.field-luxury`, `.text-iridescent`, `.eyebrow`) and Framer Motion — **not** the scaffolded shadcn primitives. The `src/components/ui/*` set (47 files) is largely unused by CABANA screens; the exception is `ui/liquid-metal-button.tsx` (`LiquidMetalButton`, the unified chrome button used by LoginCard/signup/onboarding — the migration of the remaining raw buttons is deferred to Batch 5). Adopt Radix primitives deliberately where accessibility demands it (dialogs, popovers, menus).

**Error-state convention (Batch 1):** query failures must render `cabana/QueryErrorState.tsx` (inline glass error card + optional Retry), **never** fake business data (`$0.00`, "No X yet"). Wired into DashHome, LinkManager, StoreManager, AnalyticsPage, BalanceCard, HistoryCard, SubscribersDashboard (Batch 1) and ConversationListPane, ConversationView, CommentList, PostDetail, LedgerExplorer, FinanceOverview, PayoutQueue, ReportQueue, AuditLogTable (Batch 2).

## 2. Existing Components

### Cross-cutting (`cabana/`)

| Component             | File                                       | Role                                                                                                   |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `QueryErrorState`     | `cabana/QueryErrorState.tsx`               | Shared inline query-failure card (see convention above)                                                |
| `EmptyState`          | `cabana/EmptyState.tsx`                    | Shared success-with-zero-rows card (genuine empty, distinct from `QueryErrorState`)                    |
| `ScrollFadeRow`       | `cabana/ScrollFadeRow.tsx`                 | Overflow-fade horizontal scroller (edge gradients for horizontally-scrolling rows)                     |
| `GlobalNav`           | `cabana/GlobalNav.tsx`                     | Public top nav — now used only by `/docs/system` and `FoundationPage`                                  |
| `FoundationPage`      | `cabana/foundation/FoundationPage.tsx`     | "Demo foundation / coming soon" screen; sole remaining consumer is the guest state of `/notifications` |
| `ConfirmDeleteButton` | `cabana/dashboard/ConfirmDeleteButton.tsx` | Two-step inline delete confirm (arm → confirm, auto-disarm); used by LinkManager + StoreManager        |

### Layout & shell

| Component         | File                                    | Role                                                                                                                                                  |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root shell        | `routes/__root.tsx`                     | HTML/head/scripts, Query provider, toaster, 404 + error UI                                                                                            |
| `SocialShell`     | `cabana/social/SocialShell.tsx`         | Three-column social scaffold (`SocialNav` · content · `SocialRightRail`); nav → bottom tabs below `lg`, rail hides below `xl`                         |
| Dashboard layout  | `routes/dashboard.tsx`                  | Client auth gate → `DashSidebar` + `MobileTabs` + `<Outlet/>`                                                                                         |
| Admin demo hub    | `routes/admin.tsx`                      | Role-gated, **labeled demo shell** (amber "Demo preview — sample data" pill on every tab, dead controls disabled, Batch 1); links to the 5 real tools |
| `ModerationShell` | `cabana/moderation/ModerationShell.tsx` | Staff shell for `/admin/reports` + `/admin/audit`, behind `StaffGate`                                                                                 |
| `FinanceShell`    | `cabana/admin-finance/FinanceShell.tsx` | Admin shell for `/admin/finance`, `/admin/ledger(/$transactionId)`, `/admin/payouts`, behind `AdminGate`                                              |
| `MessagesShell`   | `cabana/messaging/MessagesShell.tsx`    | Two-pane DM layout inside SocialShell for `/messages(/$conversationId)`                                                                               |

### Auth (`cabana/auth/`)

- `LoginCard` — the CABANA sign-in card (marble backdrop, glass card, chrome ENTER via `LiquidMetalButton`, Google OAuth). Shared by `/` and `/login` so they never drift.
- `AuthShell` — centered branded auth card (eyebrow/title/subtitle/body/footer); still used by signup/forgot/reset.

### Creator dashboard (`cabana/dashboard/`)

| Component                    | File                | Status                                                                                                                                           |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DashSidebar` / `MobileTabs` | `Sidebar.tsx`       | ✅ creator nav; live unread badge; "Preview public page" disables until a handle is set (Batch 1)                                                |
| `DashHome`                   | `DashHome.tsx`      | ✅ "My Page" link-in-bio overview at `/dashboard/link-in-bio` (Batch 2 IA; error-honest stats/chart)                                             |
| `WelcomeLive`                | `WelcomeLive.tsx`   | ✅ post-onboarding "Your CABANA is live" banner (sessionStorage-gated) — renders on `/dashboard` above `CreatorDashboard`                        |
| `ProfileEditor`              | `ProfileEditor.tsx` | ✅ profile CRUD incl. headline/accent/button-style; preview link handle-gated (Batch 1)                                                          |
| `LinkManager`                | `LinkManager.tsx`   | ✅ CRUD/feature/reorder + `ConfirmDeleteButton`; "Schedule for later" promise removed (Batch 1)                                                  |
| `StoreManager`               | `StoreManager.tsx`  | ✅ product CRUD + image upload (no checkout/orders)                                                                                              |
| `AnalyticsPage`              | `AnalyticsPage.tsx` | ✅ legacy link-in-bio event aggregation (`/dashboard/analytics`) — distinct from `analytics/` below                                              |
| `MediaKit`                   | `MediaKit.tsx`      | 🟡 hero bound to real profile (Batch 1); metrics remain sample data, explicitly labeled ("Sample data — demo preview" pill, "· sample" markers)  |
| `SettingsPanel`              | `SettingsPanel.tsx` | 🟡 real handle-derived domain input; integrations honestly labeled "Coming soon" / "After payments launch" — no fake connection states (Batch 1) |

(`AIStudio` was removed — no longer in the tree.)

**`dashboard/overview/`** (Phase 11A, `/dashboard/home`): `CreatorDashboard`, `KpiCards`, `RevenueSummary`, `SubscriberSummary`, `RecentActivity`, `QuickActions` — the signed-in creator home view model over RLS-scoped data.

**`dashboard/analytics/`** (Phase 11B, `/dashboard/performance`): `AnalyticsDashboard`, `RevenueAnalytics`, `SubscriberAnalytics`, `ContentAnalytics`, `EngagementSummary`, `DateRangeFilter`, `ChartEmpty` (all-zero chart placeholder) — creator analytics with date-range filtering.

### Posts & feed (`cabana/posts/`)

`PostsDashboard` (creator manage view), `PostComposer` (visibility + price authoring), `PostCard`, `PostMediaGallery`, `PostVisibilityBadge`, `LockedContentGate` (entitlement-driven, purchase-unlock CTA), `EngagementBar` (like/save/comment), `CommentList`, `CommentComposer`, `HomeFeed` (`/feed`), `PostDetail` (`/post/$postId`), `FeedBatchScope` (H-08 batched media/engagement prefetch — pairs with `src/lib/feed-batch-context.ts`).

### Messaging (`cabana/messaging/`)

`MessagesShell`, `ConversationListPane`, `ConversationView`, `MessageBubble`, `MessageComposer`, `Inbox` — real Realtime DMs at `/messages`. (Batch 2 repointed the dashboard "Messages" nav item to the real `/messages` inbox with a live unread badge; the old `/dashboard/messages` route now redirects there.)

### Notifications (`cabana/notifications/`)

`NotificationsDashboard` (`/dashboard/notifications`), `NotificationsCenter` (Phase 9B: day groups, All/Unread + type filters served server-side within the H-08 clamp, load-more to 200, click-through marks read, `QueryErrorState`/`EmptyState`, in-app-paused state), `ActivityFeed`, `NotificationSettings` (in_app functional — gates center + badges; email/push persist with honest "takes effect at 9C launch" labels), `NotificationBadge` (preference-gated via `useInAppNotificationsEnabled`), `UnreadBadge` (shared unread-count pill; also drives the sidebar Messages badge), `MemberNotificationsPage` (`/notifications`; guest state renders `FoundationPage`; signed-in adds the preferences card), `notification-icons`.

### Earnings (`cabana/earnings/`) — DEMO-ONLY money

`EarningsDashboard` (`/dashboard/earnings`), `BalanceCard` (skeleton loading + error card, payout dialog suppressed on error — Batch 1), `HistoryCard` (shared list frame w/ isError/onRetry), `TransactionHistory`, `TipHistory`, `PurchaseHistory`, `PayoutHistory`, `PayoutRequestDialog`.

### Subscriptions (`cabana/subscriptions/`) — DEMO-ONLY money

`CreatorSubscribePanel`, `SubscriptionTierCard` (public profile), `SubscribersDashboard` (roster at `/dashboard/subscribers`, error-honest tiers + roster — Batch 1).

### Discovery (`cabana/discovery/`)

`DiscoveryPage` — the real public `/discover` surface (noindex; public projections only) inside SocialShell.

### Moderation (`cabana/moderation/`) — staff only

`StaffGate`, `ModerationShell`, `ReportQueue`, `ReportRow`, `ReportDetail`, `ReportStatusBadge`, `ModerationActionDialog`, `AuditLogTable` — `/admin/reports` + `/admin/audit`.

### Admin finance (`cabana/admin-finance/`) — admin only

`AdminGate`, `FinanceShell`, `FinanceOverview`, `LedgerExplorer` (CSV export), `TransactionDetail`, `PayoutQueue`, `PayoutActionDialog` — `/admin/finance`, `/admin/ledger(/$transactionId)`, `/admin/payouts`.

### Reporting (`cabana/reporting/`)

`ReportButton` → `ReportDialog` → `ReportReasonSelect` — member-facing report flow (Phase 8B), wired into posts, comments, creator profiles, and DMs; hidden for guests / own content.

### Demo (`cabana/demo/`)

`DemoShell` (`DemoBadge`/`DemoNotice`/`DemoPageHeader`/`StatusPill` — visible "Demo data" labeling; StatusPill is also used by the real earnings/admin lists). `DemoMessages` was deleted in Batch 2 — `/dashboard/messages` now redirects to the real `/messages`.

### Public profile (route-embedded)

- `CreatorProfile` (exported from `routes/$username.tsx`) — the shared public creator page inside SocialShell; reused by `/demo`.
- `/td`, `/thetejeda`, `/danielasanchez`, `/eldondolla` — bespoke static microsites that bypass the shared data model (intentional). `/td`'s follow button is now a real "Follow on Instagram" link (Batch 1).

### Social link icons (`src/components/social/`)

`SocialButton`, `SocialIcon`, `SocialLinks` (+ `social-icons.ts`, `social-types.ts`) — brand-icon link rows used by the bespoke microsites and `SettingsPanel`. Distinct from `cabana/social/` (the shell).

### Marketing (deleted)

The orphaned marketing suite — `Hero`, `Features`, `BrandShowcase`, `Analytics`, `LogoMarquee`, `FinalCTA`, `Footer` (formerly in `cabana/`) — was **deleted in the July 9, 2026 cleanup** (it was imported nowhere; `/` renders `LoginCard` and `/pricing` redirects). No marketing landing exists today; a future landing page is a Batch 6 rebuild, not a revival of these files.

### UI primitives (`src/components/ui/`, 47 files, shadcn/new-york)

accordion, alert(-dialog), aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input(-otp), label, **liquid-metal-button**, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle(-group), tooltip. Mostly unused scaffold except `liquid-metal-button`; adopt deliberately for accessible interactive surfaces.

## 3. Reusable Components & Gaps

Truly reusable today: `QueryErrorState`, `EmptyState`, `ScrollFadeRow`, `ConfirmDeleteButton`, `LiquidMetalButton`, `SocialShell`, `AuthShell`/`LoginCard`, `HistoryCard`, `ReportButton`, `UnreadBadge`, `CreatorProfile`, `StaffGate`/`AdminGate`, `DemoShell`.

**Gaps (deferred to Batches 2–6 of the approved audit plan — do not start unprompted):**

- Batch 2 (Core UX): pagination/load-more for capped lists, retry affordances on messaging/comments/post-detail/admin, autosave flush-on-unmount, Home-vs-Overview IA (+ sidebar Messages → real DMs), onboarding resilience.
- Batch 3 (A11y): MotionConfig reducedMotion, aria labels/pressed/current, skip link, focus management, dialog a11y, touch targets, post-media alt text.
- Batch 4 (Creator workflow): post edit, delete confirms elsewhere, upload progress, messaging UX polish, price validation, "Saved" indicator. (notifications open≠read was resolved by Phase 9B — click-through now marks read.)
- Batch 5 (Design system): migrate ~117 raw buttons onto the unified button system; segmented-control/status-chip/shadow/radius unification.
- Batch 6 (Marketing & polish): landing-page rebuild (the orphaned marketing suite was deleted in the July 9 cleanup), per-route `<title>`s, terms/privacy, image optimization, 404 CTA.

**Component contract:** accept typed records + callbacks; do **not** import Supabase directly unless an explicit data-bound container. Keep presentational components pure for testability.

## 4. Component Hierarchy (current)

```
__root (QueryClient, Toaster, 404/error UI)
├─ LoginCard (/, /login) · AuthShell (signup/forgot/reset)
├─ SocialShell (SocialNav · content · SocialRightRail)
│   ├─ CreatorProfile ($username, /demo) → SubscriptionTierCard · CreatorSubscribePanel
│   │   · PostCard → LockedContentGate · EngagementBar · ReportButton
│   ├─ HomeFeed (/feed) → PostCard
│   ├─ PostDetail (/post/$postId) → PostCard · CommentList → CommentComposer
│   ├─ DiscoveryPage (/discover)
│   ├─ MessagesShell (/messages) → ConversationListPane · ConversationView → MessageBubble · MessageComposer
│   └─ MemberNotificationsPage (/notifications) → NotificationsCenter · NotificationSettings (guest → FoundationPage)
├─ DashboardLayout (DashSidebar · MobileTabs)
│   ├─ CreatorDashboard + WelcomeLive (/dashboard) · DashHome "My Page" (/dashboard/link-in-bio)
│   ├─ ProfileEditor · LinkManager · StoreManager · MediaKit · SettingsPanel
│   ├─ AnalyticsPage (/dashboard/analytics) · AnalyticsDashboard (/dashboard/performance → analytics/*)
│   ├─ PostsDashboard (/dashboard/posts) → PostComposer · PostCard
│   ├─ SubscribersDashboard (/dashboard/subscribers)
│   ├─ EarningsDashboard (/dashboard/earnings) → BalanceCard · HistoryCard → *History · PayoutRequestDialog
│   ├─ NotificationsDashboard (/dashboard/notifications) → NotificationsCenter · ActivityFeed · NotificationSettings
│   └─ (/dashboard/messages + /dashboard/home → redirects)
├─ Admin demo hub (/admin, labeled demo shell)
├─ ModerationShell (StaffGate) → ReportQueue → ReportDetail · ModerationActionDialog · AuditLogTable
└─ FinanceShell (AdminGate) → FinanceOverview · LedgerExplorer → TransactionDetail · PayoutQueue → PayoutActionDialog
```
