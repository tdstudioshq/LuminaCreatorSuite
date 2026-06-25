# CABANA Component Map

> Inventory of every existing component, the planned components, and how they compose. Reflects the tree under `src/components/` plus route-embedded components.
>
> Companion: [`CABANA_ROUTE_MAP.md`](./CABANA_ROUTE_MAP.md), [`CABANA_PRODUCT_SPEC.md`](./CABANA_PRODUCT_SPEC.md). Plan only.

---

## 1. Layering Overview

```
App shell (__root.tsx)
 └─ QueryClientProvider + Sonner Toaster + HeadContent/Scripts
    ├─ Public/marketing pages  → cabana/* marketing + GlobalNav + Footer
    ├─ Auth pages              → cabana/auth/AuthShell
    ├─ Public creator surface  → route-embedded CreatorProfile (in $username.tsx)
    ├─ Creator Studio (/dashboard) → DashSidebar + MobileTabs + cabana/dashboard/*
    ├─ Foundation routes       → cabana/foundation/FoundationPage
    └─ Admin (/admin)          → route-embedded admin shell
```

**Styling convention (important):** CABANA screens mostly use **raw HTML + Tailwind + CABANA CSS utilities** (`.btn-luxury`, `.btn-ghost`, `.glass`, `.glass-strong`, `.field-luxury`, `.text-iridescent`, `.eyebrow`) and Framer Motion — **not** the scaffolded shadcn primitives. The `src/components/ui/*` set (46 files) is largely unused by CABANA screens today. New components should follow the CABANA-utility idiom unless a Radix primitive is clearly the right call (dialogs, popovers, accessible menus).

## 2. Existing Components

### Layout & shell

| Component        | File                        | Role                                                            | Reuse                                   |
| ---------------- | --------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| Root shell       | `routes/__root.tsx`         | HTML/head/scripts, Query provider, toaster, 404 + error UI      | Global                                  |
| `AuthShell`      | `cabana/auth/AuthShell.tsx` | Centered branded auth card (eyebrow/title/subtitle/body/footer) | Reusable (login, signup, forgot, reset) |
| Dashboard layout | `routes/dashboard.tsx`      | Client auth gate → sidebar + mobile tabs + `<Outlet/>`          | Layout for all creator routes           |
| Admin shell      | `routes/admin.tsx`          | Role gate + local-tab admin UI                                  | Page-specific                           |

### Navigation

| Component     | File                           | State                         | Notes                                                                    |
| ------------- | ------------------------------ | ----------------------------- | ------------------------------------------------------------------------ |
| `GlobalNav`   | `cabana/GlobalNav.tsx`         | mobile-open, route, auth user | Public pages; mobile sheet exposes Studio/Admin (destinations self-gate) |
| `DashSidebar` | `cabana/dashboard/Sidebar.tsx` | route, profile, auth user     | Creator desktop nav; now scrollable (item count grew)                    |
| `MobileTabs`  | `cabana/dashboard/Sidebar.tsx` | route                         | Creator mobile nav (horizontal strip, not bottom-fixed)                  |

### Marketing (landing composition only — content is module-level constants, buttons mostly visual)

`Hero`, `Features`, `CreatorShowcase`, `Analytics`, `AISection`, `BrandShowcase`, `Pricing`, `LogoMarquee`, `FinalCTA`, `Footer` — all in `cabana/`.

### Creator dashboard (functional unless noted)

| Component       | File                                 | Status                                                                         |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| `DashHome`      | `cabana/dashboard/DashHome.tsx`      | ✅ overview (no revenue/subscriber summary yet)                                |
| `ProfileEditor` | `cabana/dashboard/ProfileEditor.tsx` | ✅ writes on every input change (no debounce); no banner upload                |
| `LinkManager`   | `cabana/dashboard/LinkManager.tsx`   | ✅ CRUD/feature/reorder (non-atomic reorder, no URL validation/delete confirm) |
| `StoreManager`  | `cabana/dashboard/StoreManager.tsx`  | ✅ product CRUD + image upload (no checkout/orders)                            |
| `AnalyticsPage` | `cabana/dashboard/AnalyticsPage.tsx` | ✅ event aggregation (no unique visitors/geo/export)                           |
| `MediaKit`      | `cabana/dashboard/MediaKit.tsx`      | 🟡 hardcoded Aurora; export buttons dead                                       |
| `AIStudio`      | `cabana/dashboard/AIStudio.tsx`      | 🟡 simulated generation; Copy/Use dead                                         |
| `SettingsPanel` | `cabana/dashboard/SettingsPanel.tsx` | 🟡 hardcoded integrations; actions dead                                        |

### Public profile (route-embedded)

- `CreatorProfile` (in `routes/$username.tsx`) — reusable, reused by `/demo`. Fetches creator bundle, emits analytics, owns **temporary** follow state. Theme is read but **not applied**.
- `/td`, `/eldondolla` — bespoke static profiles that bypass the shared data model (intentional microsites).

### Foundation

- `FoundationPage` (`cabana/foundation/FoundationPage.tsx`) — shared "demo foundation / coming soon" screen. Supports public mode (with `GlobalNav`) and dashboard mode (inside the auth layout); takes icon, title, description, capability list, return route; renders no backend reads and labels payments/messaging/entitlements/payouts inactive. Used by all 9 placeholder routes.

### UI primitives (`src/components/ui/`, 46 files, shadcn/new-york)

accordion, alert(-dialog), aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input(-otp), label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle(-group), tooltip. **Mostly unused scaffold.** Adopt deliberately for accessible interactive surfaces in new modules (tables, dialogs, command palettes).

## 3. Reusable Components (current + to standardize)

Truly reusable today: `AuthShell`, `FoundationPage`, `GlobalNav`, `DashSidebar`/`MobileTabs`, `CreatorProfile`. **Gaps worth standardizing** (tech debt): no typed CABANA `Button` (utility classes only), no shared modal/dialog wrapper (each screen hand-rolls one), no shared form field beyond `AuthField`, no shared profile renderer that `/td`/`/eldondolla` could adopt.

## 4. Future Components

Organized by business boundary (matches `CABANA_BUILD_ROADMAP.md` §7 and proposed `components/cabana/{posts,members,messaging,notifications,monetization,moderation}/`).

**Publishing** (`posts/`): `PostCard`, `PostMediaGallery`, `PostVisibilityBadge`, `PostComposer`, `PostSchedulePanel`, `CommentList`, `CommentComposer`, `EngagementActions` (like/save/share).

**Members & subscribers** (`members/`): `MemberAvatar`, `MemberProfileCard`, `FollowButton` (persistent), `SubscriberTable`, `SubscriptionStatusBadge`, `SubscriptionTierCard`, `LockedContentGate` (entitlement-driven).

**Messaging** (`messaging/`): `ConversationList`, `ConversationRow`, `MessageThread`, `MessageBubble`, `MessageComposer`, `PaidMessageGate`, `TypingIndicator`.

**Notifications** (`notifications/`): `NotificationList`, `NotificationRow`, `UnreadBadge`, `NotificationPreferences`.

**Monetization** (`monetization/`): `EarningsSummary`, `TransactionTable`, `CreatorBalanceCard`, `PayoutHistory`, `TipComposer`, `MockCheckoutDialog` (later `CheckoutDialog`).

**Moderation/admin** (`moderation/`): `ReportQueue`, `ReportDetail`, `ModerationActionDialog`, `AuditLogTable`.

**Cross-cutting to add:** member app shell (`MemberLayout` + member nav), typed `Button`, shared `Modal`/`Dialog` wrapper, shared `Field`, `EmptyState`, `LoadingState`, `ErrorState`, `Money` formatter component, `BannerUpload`.

**Component contract:** accept typed records + callbacks; do **not** import Supabase directly unless an explicit data-bound container. Keep presentational components pure for testability.

## 5. Component Hierarchy (target)

```
__root (QueryClient, Toaster)
├─ MarketingLayout
│   └─ GlobalNav · Hero/Features/CreatorShowcase/Analytics/AISection/
│      BrandShowcase/Pricing/LogoMarquee/FinalCTA · Footer
├─ AuthShell → AuthField
├─ PublicCreatorPage
│   └─ CreatorProfile → EngagementActions · FollowButton · PostCard*
│      · SubscriptionTierCard* · product cards
├─ MemberLayout*  (new authenticated fan shell)
│   ├─ FeedPage → PostCard → PostMediaGallery · CommentList → CommentComposer
│   ├─ DiscoverPage → MemberProfileCard / creator cards
│   ├─ MessagesPage → ConversationList → MessageThread → MessageBubble · MessageComposer
│   └─ NotificationsPage → NotificationList → NotificationRow · UnreadBadge
└─ DashboardLayout (DashSidebar · MobileTabs)
    ├─ DashHome · ProfileEditor · LinkManager · StoreManager · AnalyticsPage
    ├─ MediaKit · AIStudio · SettingsPanel
    ├─ PostsPage* → PostComposer · PostCard · PostSchedulePanel
    ├─ SubscribersPage* → SubscriberTable · SubscriptionStatusBadge
    ├─ CreatorMessagesPage* → ConversationList · MessageThread · PaidMessageGate
    ├─ EarningsPage* → EarningsSummary · TransactionTable · CreatorBalanceCard · PayoutHistory
    └─ CreatorNotificationsPage* → NotificationList
AdminLayout* (URL-backed, server-gated)
    └─ ReportQueue → ReportDetail → ModerationActionDialog · AuditLogTable · user/finance tools

(* = future)
```
