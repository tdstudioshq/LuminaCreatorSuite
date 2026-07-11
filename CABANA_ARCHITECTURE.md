# CABANA Architecture Document

> Current-state inspection completed June 25, 2026.
>
> Evidence used: the deployed Lovable URL, its redirect target at `https://www.cabanagrp.com`, the local source tree, generated route tree, package/configuration files, checked-in Supabase migrations and types, and read-only queries against the public Supabase API.
>
> Status labels used below:
>
> - **Implemented** — backed by working application code and, where relevant, Supabase.
> - **Demo only** — visually present or locally interactive, but hardcoded or non-persistent.
> - **Not currently implemented** — no current screen, state, database object, or working integration was found.
> - **Unknown** — cannot be verified from the available source or public deployment.

## 1. Project Overview

### App purpose

CABANA is currently a premium creator operating system and link-in-bio/storefront platform. It gives a creator:

- A public mobile-first profile at `/{handle}`.
- Managed smart links.
- A small product/storefront catalog.
- Profile and theme editing.
- Basic click and page-view analytics.
- A sponsorship-oriented media-kit demo.
- Demo AI copy-generation tools.
- Platform pricing and onboarding experiences.

### Brand positioning

The product is positioned as a luxury, invitation-led alternative to generic link-in-bio tools. The language emphasizes “creator OS,” cinematic presentation, premium branding, glass/chrome surfaces, AI-assisted setup, storefronts, analytics, and white-glove support.

### Primary users

The currently implemented product is creator-first:

- Independent creators, influencers, musicians, models, coaches, and fitness creators.
- Agencies or creator-management teams are described in marketing and pricing but do not have a working multi-seat product.
- Fans and members can visit creator pages and open external links, but they do not have accounts or an in-app fan experience.
- Internal administrators have a role-gated admin route, but its operational data and actions are demo-only.

### Core product concept

Each authenticated account receives a creator profile. The creator manages that profile, links, and products in CABANA Studio. Public visitors open `/{handle}` and interact with the creator’s links and product cards. Those interactions write analytics events to Supabase.

### Current app type

- Server-rendered React web application.
- Responsive and mobile-first, but not a native mobile app.
- Multi-route creator SaaS prototype with a partially working Supabase backend.
- Deployed through Lovable infrastructure with a Cloudflare-compatible TanStack Start build.
- The Lovable URL redirects to the custom domain `https://www.cabanagrp.com`.

### Current limitations

- CABANA is not currently a social feed, subscription-content, or messaging platform.
- No member/fan account type exists.
- No posts, comments, likes, saves, conversations, messages, notifications, tips, transactions, or creator payouts are implemented.
- Product cards do not lead to checkout.
- Pricing CTAs do not create a platform subscription.
- “Follow” state is local React state and disappears on refresh.
- AI generation is simulated with hardcoded samples and timers.
- The media kit, settings integrations, and admin console are largely visual demos.
- Onboarding selections are mostly not persisted.
- The checked-in Supabase migrations are incremental and do not contain the complete base schema, all RLS policies, storage bucket creation, or seed data required to rebuild the current backend.
- Internal documentation at `/docs/data-model` is stale relative to the live implementation.

## 2. Current Tech Stack

| Area                 | Current implementation                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend framework   | React `19.2.0`                                                                                                                                                 |
| Full-stack framework | TanStack Start `1.167.x`                                                                                                                                       |
| Routing              | TanStack Router file-based routing generated into `src/routeTree.gen.ts`                                                                                       |
| Build tool           | Vite `7.3.1` using `@lovable.dev/vite-tanstack-config`                                                                                                         |
| Rendering            | TanStack Start SSR with client hydration                                                                                                                       |
| Styling              | Tailwind CSS `4.2.1`, custom CSS variables/utilities, `tw-animate-css`                                                                                         |
| Motion               | Framer Motion `12.38.0`                                                                                                                                        |
| Icons                | Lucide React                                                                                                                                                   |
| UI/component library | A shadcn/Radix primitive set is scaffolded under `src/components/ui`; the CABANA screens mostly use custom components and raw Tailwind classes instead         |
| Forms                | Native controlled React inputs in CABANA screens; React Hook Form and Zod are installed but not used by current CABANA flows                                   |
| Client server-state  | TanStack Query                                                                                                                                                 |
| Local UI state       | React `useState`, `useMemo`, and `useEffect`                                                                                                                   |
| Notifications/toasts | Sonner                                                                                                                                                         |
| Authentication       | Supabase Auth, email/password, password reset, persisted browser session                                                                                       |
| Database             | Supabase PostgreSQL                                                                                                                                            |
| Object storage       | Supabase Storage buckets named `avatars`, `banners`, and `products`; only avatar and product upload UIs are present                                            |
| Authorization        | Supabase RLS plus `user_roles`; UI recognizes `admin`, `moderator`, and `user`                                                                                 |
| Analytics            | Custom `analytics_events` table and direct client inserts for page, link, and product clicks                                                                   |
| Payments             | **Not currently implemented**                                                                                                                                  |
| Creator payouts      | **Not currently implemented**                                                                                                                                  |
| AI provider          | **Not currently implemented**; current output is simulated                                                                                                     |
| Real-time features   | **Not currently implemented**                                                                                                                                  |
| Deployment           | Lovable deployment using a Cloudflare Vite/Worker target; `wrangler.jsonc` points to `src/server.ts`                                                           |
| Custom domain        | `https://www.cabanagrp.com`; the provided Lovable domain redirects there                                                                                       |
| External services    | Supabase and external Unsplash images. Stripe, Mailchimp, Shopify, Calendly, social imports, and AI providers are only referenced in demo UI or marketing copy |

## 3. Application Structure

### Top-level structure

```text
.
├── .lovable/
│   └── project.json
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── cabana/
│   │   └── ui/
│   ├── hooks/
│   ├── integrations/
│   │   └── supabase/
│   ├── lib/
│   ├── routes/
│   ├── routeTree.gen.ts
│   ├── router.tsx
│   ├── server.ts
│   ├── start.ts
│   └── styles.css
├── supabase/
│   ├── config.toml
│   └── migrations/
├── components.json
├── package.json
├── bun.lock
├── vite.config.ts
└── wrangler.jsonc
```

### Important folders and files

| Path                                           | Purpose                                                                                                                                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.lovable/project.json`                        | Identifies the Lovable template as `tanstack_start_ts_2026-05-06`.                                                                                                                                                         |
| `src/routes/`                                  | File-based page and layout routes. This is the primary screen map.                                                                                                                                                         |
| `src/components/cabana/`                       | CABANA-specific marketing, auth, dashboard, navigation, and brand components.                                                                                                                                              |
| `src/components/ui/`                           | Broad shadcn/Radix primitive library. Mostly scaffolded and currently unused by CABANA-specific screens.                                                                                                                   |
| `src/assets/`                                  | Bundled creator photography, product imagery, CABANA logos, and custom profile assets.                                                                                                                                     |
| `public/`                                      | Public favicon, social image, and static profile images.                                                                                                                                                                   |
| `src/lib/cabana-auth.ts`                       | Supabase signup, login, logout, password reset, password update, and auth-session hooks.                                                                                                                                   |
| `src/lib/cabana-store.ts`                      | Main creator data layer: profile/link/product types, reads, mutations, uploads, and React Query invalidation.                                                                                                              |
| `src/lib/cabana-types.ts`                      | Phase 1 subscription-platform domain contracts for members, posts, subscriptions, messaging, notifications, monetization, reports, and audit records. These types are Supabase-ready but do not represent live tables yet. |
| `src/lib/cabana-demo-data.ts`                  | Deterministic, non-sensitive demo generators for future member, publishing, subscription, messaging, notification, and transaction modules.                                                                                |
| `src/lib/cabana-analytics.ts`                  | Fire-and-forget analytics event insertion.                                                                                                                                                                                 |
| `src/lib/cabana-roles.ts`                      | Client-side role lookup against `user_roles`.                                                                                                                                                                              |
| `src/integrations/supabase/client.ts`          | Lazy browser/SSR Supabase client using public credentials and browser session persistence.                                                                                                                                 |
| `src/integrations/supabase/client.server.ts`   | Lazy service-role client intended for trusted server operations; no current feature uses it.                                                                                                                               |
| `src/integrations/supabase/types.ts`           | Generated current database type definitions.                                                                                                                                                                               |
| `src/integrations/supabase/auth-middleware.ts` | Bearer-token validation middleware for future TanStack server functions.                                                                                                                                                   |
| `src/integrations/supabase/auth-client-middleware.ts` | `attachSupabaseToken` — the live client middleware that attaches the Supabase bearer token, composed per server function in every `src/lib/*-actions.ts` chain. (The unused `auth-attacher.ts`/`attachSupabaseAuth` global-middleware variant was never registered in `src/start.ts` and was removed.) |
| `src/styles.css`                               | Complete dark-first design-token and utility system.                                                                                                                                                                       |
| `src/routeTree.gen.ts`                         | Generated TanStack route registry; do not edit manually.                                                                                                                                                                   |
| `src/router.tsx`                               | Creates the router and a per-router TanStack Query client.                                                                                                                                                                 |
| `src/routes/__root.tsx`                        | Root HTML shell, metadata, Query provider, Sonner toaster, 404, and route error UI.                                                                                                                                        |
| `src/server.ts`                                | Cloudflare-compatible SSR entry with branded catastrophic-error handling.                                                                                                                                                  |
| `src/start.ts`                                 | TanStack Start request error middleware.                                                                                                                                                                                   |
| `supabase/migrations/`                         | Incremental database/security migrations. They are not a complete baseline migration set.                                                                                                                                  |
| `supabase/config.toml`                         | Links the workspace to Supabase project `dwnricswfskypqqfknnh`.                                                                                                                                                            |
| `vite.config.ts`                               | Uses Lovable’s TanStack preset and redirects the server entry to `src/server.ts`.                                                                                                                                          |
| `wrangler.jsonc`                               | Cloudflare Worker compatibility and server entry configuration.                                                                                                                                                            |
| `docs/CABANA_BUILD_ROADMAP.md`                 | Phase-by-phase implementation plan for expanding CABANA into a creator subscription platform.                                                                                                                              |

### Main component groups

- Marketing: `Hero`, `Features`, `CreatorShowcase`, `Analytics`, `AISection`, `BrandShowcase`, `Pricing`, `FinalCTA`, `Footer`.
- Global navigation: `GlobalNav`.
- Authentication: `AuthShell`, `AuthField`.
- Creator dashboard: `DashSidebar`, `MobileTabs`, `DashHome`, `ProfileEditor`, `LinkManager`, `StoreManager`, `AnalyticsPage`, `MediaKit`, `AIStudio`, `SettingsPanel`.
- Phase 1 module foundation: reusable `FoundationPage` plus placeholder creator/member routes.
- Public profile: implemented directly in `src/routes/$username.tsx`.
- Admin: implemented directly in `src/routes/admin.tsx`.

## 4. User Roles

### Guest

**Can currently:**

- View the marketing site, pricing, AI marketing page, onboarding demo, public creator pages, and special profile pages.
- Open external creator links.
- Trigger anonymous page/link/product analytics events.
- Sign up, sign in, and request a password reset.
- Toggle a non-persistent “Follow” state on some public profiles.

**Should eventually be able to:**

- Browse public creators and products.
- Start checkout.
- Create a member/fan account.
- Report content.
- View only public or entitled media.

**Required permissions:**

- Public read access to published creator profiles, published links, and public products.
- Insert-only access to controlled analytics/report endpoints.
- No direct access to private media, creator dashboards, admin data, or payment records.

### Member / Fan

**Can currently:**

- **Not currently implemented as a distinct role.**
- An authenticated signup is automatically treated as a creator account.

**Should eventually be able to:**

- Maintain a member profile.
- Follow creators.
- Subscribe to creators.
- Purchase products, tips, and paid messages.
- View entitled or locked content.
- Save posts.
- Comment and like where allowed.
- Message subscribed creators where allowed.
- Manage billing, notification preferences, blocked users, and privacy.

**Required permissions:**

- Read and update only the member’s own profile/settings.
- Read public content plus content authorized by an active entitlement.
- Create own likes, saves, follows, comments, reports, tips, and messages.
- Read only conversations in which the member participates.
- Never edit creator-owned content or earnings.

### Creator

**Can currently:**

- Sign up and receive a creator profile automatically.
- Edit name, handle, bio, avatar, and theme.
- Add, edit, delete, feature, and reorder links.
- Add, edit, delete, and upload images for products.
- View live public page, analytics events, media-kit demo, AI demo, and settings demo.
- Log out.

**Should eventually be able to:**

- Publish posts and private/premium media.
- Manage subscribers, products, orders, tips, paid messages, and refunds within policy.
- View an earnings ledger and payout status.
- Configure message permissions and subscription tiers.
- Moderate comments and block users.
- Submit identity/KYC information before monetizing.
- Connect real social, email, commerce, and custom-domain integrations.

**Required permissions:**

- CRUD only on creator-owned profiles, links, products, posts, media, and settings.
- Read aggregated analytics for owned profiles.
- Read transactions and subscriber records relevant to the creator, with sensitive payment data minimized.
- No ability to alter settled transaction amounts, platform fees, payouts, or admin decisions.

### Admin

**Can currently:**

- Access `/admin` only when `user_roles` contains `admin`.
- Switch between eight hardcoded admin panels.
- View demo metrics and demo lists.

**Cannot currently:**

- Perform real approvals, suspensions, payouts, moderation actions, or user changes.

**Should eventually be able to:**

- Manage users, roles, creator verification, reports, content takedowns, subscriptions, refunds, payout exceptions, and feature placement.
- View operational metrics and audit history.

**Required permissions:**

- Server-validated admin/moderator claims.
- Least-privilege admin capabilities, ideally separated into support, moderator, finance, and super-admin scopes.
- Every state-changing action recorded in immutable audit logs.
- Service-role access confined to trusted server functions, never browser code.

## 5. Current Screens / Pages

### Public and authentication routes

| Screen               | Route                                            | Purpose and components                                                                                                                      | Current interactions                                                                                                       | Missing or incomplete behavior                                                                                                                                          | Data                                                              |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Landing / platform   | `/`                                              | `GlobalNav`, `Hero`, platform features, creator showcase, analytics mockup, AI section, brand showcase, pricing teaser, final CTA, `Footer` | Header route links and mobile menu work                                                                                    | Hero CTA, pricing buttons, final CTA buttons, showcase cards, analytics controls, AI “Generate,” and footer links are non-functional                                    | Entirely hardcoded marketing data and bundled assets              |
| AI marketing         | `/features/ai`                                   | Long-form AI feature page with tool grid, workflow, live brand variants, model stack                                                        | Variant selector and typewriter animation work; onboarding link works                                                      | “Generate,” “Watch demo,” “Open agent,” “Join,” “Remix,” and “Request access” actions do not execute product logic                                                      | Hardcoded tools, prompts, copy, and visual samples                |
| Pricing              | `/pricing`                                       | Four plan cards, billing toggle, comparison matrix, FAQ                                                                                     | Monthly/yearly toggle and FAQ accordion work                                                                               | No checkout, trial, sales, or billing action is connected                                                                                                               | Hardcoded Atelier, Studio, Maison, and Empire plans               |
| Signup               | `/signup`                                        | `AuthShell` and three fields                                                                                                                | Real Supabase email/password signup; redirects to onboarding                                                               | No explicit email-confirmation screen, CAPTCHA, OAuth, role choice, or enforceable terms acceptance                                                                     | Supabase Auth plus signup trigger                                 |
| Login                | `/login`                                         | `AuthShell`, email/password, redirect query support                                                                                         | Real Supabase password login; redirects to requested route or dashboard                                                    | No OAuth, MFA, CAPTCHA, or demo account                                                                                                                                 | Supabase Auth                                                     |
| Forgot password      | `/forgot-password`                               | Email recovery form                                                                                                                         | Sends Supabase password-reset email and displays success state                                                             | No resend timer or recovery troubleshooting                                                                                                                             | Supabase Auth                                                     |
| Reset password       | `/reset-password`                                | New password form                                                                                                                           | Updates password for a valid Supabase recovery session, then redirects                                                     | No explicit invalid/expired-link UX                                                                                                                                     | Supabase Auth                                                     |
| Onboarding           | `/onboarding`                                    | Seven-step creator setup wizard                                                                                                             | Local creator type/theme/social/brand inputs, avatar upload when authenticated, simulated generation, dashboard navigation | Most selections are not saved; social connections are fake; AI is simulated; unauthenticated users can complete the wizard but are redirected to login at the dashboard | React state; avatar may persist to Supabase                       |
| Demo creator page    | `/demo`                                          | Reuses dynamic `CreatorProfile` for handle `aurora`                                                                                         | Real public data load and analytics events                                                                                 | Follow, message, play, and product purchase are incomplete                                                                                                              | Supabase `aurora` profile, 6 links, 4 products                    |
| Dynamic creator page | `/$username`                                     | Public hero, follow button, links, product grid, powered-by logo                                                                            | Real profile/link/product reads; external links; analytics inserts; local follow toggle                                    | No persistent follow, message, media playback, product detail, or checkout; theme field is not applied to page styling                                                  | Supabase `creator_profiles`, `links`, `products`                  |
| TD profile           | `/td`                                            | Custom static Tyler D profile                                                                                                               | Follow toggle, email, Instagram, website, Telegram, WhatsApp, phone, and email links                                       | Follow is local only; page is not driven by the creator data model                                                                                                      | Hardcoded 6-link static profile and `/public/td.jpg`              |
| El Don Dolla profile | `/eldondolla`                                    | Custom black/gold profile with portrait, logo, and social links                                                                             | Four external social links work                                                                                            | Not driven by creator profile data; no analytics integration                                                                                                            | Hardcoded TikTok, Instagram, X, Facebook links and bundled assets |
| 404                  | Any unmatched route not consumed by `/$username` | Branded not-found card                                                                                                                      | Home and demo links work                                                                                                   | Because `/$username` matches top-level slugs, many unknown top-level paths show the creator “not claimed” state instead of the generic 404                              | No data                                                           |

### Creator dashboard routes

All dashboard routes are wrapped by `/dashboard`, which checks the browser Supabase session and redirects signed-out users to `/login?redirect=...`.

| Screen          | Route                   | Purpose and components                                               | Current interactions                                                         | Missing or incomplete behavior                                                                                                        | Data                                                    |
| --------------- | ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Studio overview | `/dashboard`            | `DashHome`, sidebar/mobile tabs, 30-day summary, 14-day traffic bars | Public page link, links/storefront/analytics navigation                      | No revenue, orders, subscribers, or notification summary                                                                              | Real creator profile, links, products, analytics events |
| Profile editor  | `/dashboard/profile`    | Avatar, identity, theme selector, live preview                       | Profile updates write immediately; avatar upload works; public preview opens | No banner upload; no debounce/save transaction; persisted theme is not applied on public page                                         | Supabase profile and avatar storage                     |
| Link manager    | `/dashboard/links`      | Reorderable link list and inline editor                              | Add, update, feature, reorder, and delete write to Supabase                  | No confirmation on delete, URL validation, activation dates, true scheduled publishing, or atomic reorder                             | Supabase links                                          |
| Storefront      | `/dashboard/storefront` | Product grid and edit drawer                                         | Add, edit, type selection, image upload, and delete write to Supabase        | No descriptions, currency model, inventory, fulfillment, download delivery, checkout, or orders                                       | Supabase products and product storage                   |
| Analytics       | `/dashboard/analytics`  | 30-day stats, 14-day bars, top links                                 | Real event reads and client-side aggregation                                 | No unique visitors, sessions, bot filtering, geo/device/referrer, export, date picker, revenue attribution, or real-time subscription | Supabase analytics events                               |
| Media kit       | `/dashboard/media-kit`  | Sponsorship media-kit presentation                                   | Animations only                                                              | Export PDF and preview buttons do nothing; data is not creator-specific                                                               | Hardcoded Aurora metrics and image                      |
| AI Studio       | `/dashboard/ai`         | Bio, CTA, caption, and theme generators                              | Tool selector, simulated delayed generation, regenerate                      | No AI API; prompt text is not read; Copy and Use It do nothing                                                                        | Hardcoded samples in React state                        |
| Settings        | `/dashboard/settings`   | Custom domain, integrations, social accounts                         | Inputs render                                                                | Verify, Connect, Linked, and integration actions are non-functional; data is hardcoded to Aurora                                      | Hardcoded settings data                                 |

### Admin and internal documentation

| Screen             | Route              | Purpose                                                                                 | Current interactions                    | Missing or incomplete behavior                                                                                          | Data                |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Admin console      | `/admin`           | Overview, users, verification, subscriptions, payouts, flags, featured creators, growth | Role gate and local tab navigation work | Every operational action is non-functional; no real admin queries                                                       | Hardcoded demo data |
| Design-system docs | `/docs/system`     | Internal design-system landing/reference                                                | Links to data model and home            | Content is minimal despite imported unused demo dependencies                                                            | Static              |
| Data-model docs    | `/docs/data-model` | Internal proposed V1 schema reference                                                   | Anchor navigation                       | Stale: describes tables/fields that do not match the current generated Supabase types and says the backend is not wired | Static              |

### Phase 1 subscription-platform foundation routes

These routes now exist and compile, but intentionally remain non-functional demo foundations:

| Route                      | Future purpose                      | Current state          |
| -------------------------- | ----------------------------------- | ---------------------- |
| `/dashboard/posts`         | Creator publishing                  | Coming-soon foundation |
| `/dashboard/subscribers`   | Creator subscriber management       | Coming-soon foundation |
| `/dashboard/messages`      | Creator inbox                       | Coming-soon foundation |
| `/dashboard/earnings`      | Transactions, balances, and payouts | Coming-soon foundation |
| `/dashboard/notifications` | Creator activity center             | Coming-soon foundation |
| `/feed`                    | Member feed                         | Coming-soon foundation |
| `/discover`                | Creator discovery                   | Coming-soon foundation |
| `/messages`                | Member inbox                        | Coming-soon foundation |
| `/notifications`           | Member activity center              | Coming-soon foundation |

### Screens from the requested checklist that remain unbuilt

The following feature implementations are **Not currently implemented**, even where a placeholder route now exists: real home feed data, discovery/search, member profile, inbox/conversation UI, chat, notification list behavior, content upload/post composer, creator-content subscription checkout, and subscription checkout demo.

## 6. Navigation Architecture

### Header navigation

`GlobalNav` appears on the landing, AI marketing, pricing, and internal system-doc route.

- Desktop: Platform, AI, Pricing, Onboarding.
- Signed out: Sign in, Sign up, Get access.
- Signed in: Studio and Get access.
- Mobile sheet additionally exposes Studio and Admin regardless of role; the destination routes enforce their own client-side gates.

### Bottom navigation

**Not currently implemented.**

The creator dashboard uses:

- A fixed left sidebar on large screens.
- A sticky horizontal tab strip on mobile.

This is not a conventional mobile bottom navigation.

### Modal navigation

- Global mobile menu: custom animated sheet.
- Product editing: custom bottom/center modal drawer.
- Link editing: inline expandable panel.
- No URL-backed modal state; refreshing closes all modal/inline editing state.

### Auth flow

```text
Signup → Supabase Auth signUp → database trigger creates creator records
       → /onboarding → /dashboard

Login → Supabase Auth signInWithPassword
      → redirect query or /dashboard

Protected dashboard → no session → /login?redirect=current-path

Forgot password → recovery email → /reset-password
                → update password → /dashboard
```

### Creator flow

```text
Dashboard overview
  ├─ Profile editor → public preview
  ├─ Link manager → public links
  ├─ Storefront → public product cards
  ├─ Analytics
  ├─ Media kit demo
  ├─ AI Studio demo
  └─ Settings demo
```

### Member/fan flow

**Not currently implemented.** Public visitors do not authenticate as fans and do not have a fan dashboard, library, feed, billing area, or inbox.

### Profile flow

- Public creator lookup uses the top-level dynamic `/$username` route.
- `/demo` is an alias for `aurora`.
- Missing profiles display “This creator hasn’t claimed their CABANA yet” and link to signup.
- `/td` and `/eldondolla` bypass the general profile/data system.

### Messaging flow

**Not currently implemented.** The envelope button on a general public creator page links to `#`.

### Subscription flow

- Marketing pricing exists.
- A `subscriptions` database table exists for the creator’s CABANA platform plan.
- No button creates checkout, changes plan, or opens a billing portal.
- Fan-to-creator subscriptions and content entitlements are **Not currently implemented**.

### Settings flow

- Dashboard route and UI exist.
- Custom-domain verification, Stripe, Mailchimp, Shopify, Calendly, and social connections are demo-only.

### Broken, dead, or incomplete paths

- Landing-page CTAs do not navigate or submit.
- Footer links all use `#`.
- Public profile message and product links use `#`.
- Public follow state is temporary.
- Pricing CTAs are dead.
- AI marketing and AI Studio action buttons are mostly dead.
- Media-kit export/preview buttons are dead.
- Settings verification and integration buttons are dead.
- Admin action buttons are dead.
- Onboarding can be entered before authentication; most wizard data is discarded.
- Onboarding theme IDs do not match the persisted `CabanaTheme` IDs and are not saved.
- The dashboard sidebar displays a hardcoded “Pro” plan even when `profile.plan` is different.
- Public profile theme data is read but not used to alter the page.

## 7. Component Architecture

### Layout components

| Component                  | Purpose                                            | State/props                            | Used by                        | Reuse           |
| -------------------------- | -------------------------------------------------- | -------------------------------------- | ------------------------------ | --------------- |
| Root shell in `__root.tsx` | HTML/head/scripts, Query provider, toaster, errors | Query client context                   | Entire app                     | Global          |
| `AuthShell`                | Shared centered auth card and branded background   | Eyebrow, title, subtitle, body, footer | Login, signup, password routes | Reusable        |
| Dashboard layout route     | Auth gate, sidebar, mobile tabs, outlet            | Supabase session and current path      | All creator dashboard routes   | Reusable layout |
| Admin route shell          | Role gate, sidebar/top bar, local tabs             | Local active tab                       | Admin only                     | Page-specific   |

### Navigation components

| Component                    | Purpose                          | State                                       | Notes                              |
| ---------------------------- | -------------------------------- | ------------------------------------------- | ---------------------------------- |
| `GlobalNav`                  | Public desktop/mobile navigation | Mobile-open state; current route; auth user | Reusable on selected public pages  |
| `DashSidebar`                | Creator desktop navigation       | Current route; profile; auth user           | Reusable dashboard navigation      |
| `MobileTabs`                 | Creator mobile navigation        | Current route                               | Horizontal, not bottom-fixed       |
| Admin `Sidebar`/`MobileTabs` | Admin panel tabs                 | Local tab state                             | Page-specific; tabs are not routes |

### Card and marketing components

- `Features`, `CreatorShowcase`, `Analytics`, `AISection`, `BrandShowcase`, `Pricing`, and `FinalCTA` are reusable only within the landing-page composition.
- They receive little or no data through props; most content is declared as module-level constants.
- Their buttons are generally visual only.

### Feed/post components

**Not currently implemented.**

### Profile components

- `CreatorProfile` in `$username.tsx` is reusable and is reused by `/demo`.
- It accepts `username`, fetches the Supabase creator bundle, emits page/link/product analytics, and owns temporary follow state.
- `ProfileEditor` is creator-dashboard reusable but writes on every input change.
- `/td` and `/eldondolla` contain page-specific profile implementations and duplicate concepts instead of using a shared profile renderer.

### Message components

Production message components are **Not currently implemented**. The Phase 1 `FoundationPage` is reused for the creator and member messaging placeholders.

### Form components

- `AuthField` is a reusable auth input wrapper.
- Dashboard editors use page-specific native inputs and textareas.
- React Hook Form and Zod are installed but not used by CABANA forms.
- Validation is concentrated in `cabana-auth.ts`; profile, URL, product, and upload validation is minimal.

### Modal components

- `ProductDrawer` is a page-specific custom modal.
- Global mobile navigation is a page-level custom sheet.
- No CABANA screen currently uses the scaffolded Radix `Dialog`, `Sheet`, or `Drawer` primitives.

### Foundation components

- `FoundationPage` provides a shared luxury CABANA coming-soon state.
- It supports public routes with `GlobalNav` and dashboard routes within the existing authenticated layout.
- It accepts an icon, title, description, capability list, and return route.
- It contains no backend reads and clearly states that payment, private messaging, entitlement, and payout actions are inactive.

### Button components

- CABANA uses CSS utility classes `.btn-luxury` and `.btn-ghost`.
- There is no CABANA-specific typed React button abstraction.
- A shadcn `Button` primitive exists under `src/components/ui/button.tsx`, but current CABANA screens do not use it.

### UI primitives

The repository includes a broad shadcn/Radix set: accordion, dialogs, sheets, forms, selects, tabs, tooltips, tables, carousel, chart wrappers, sidebar, and more. These are mostly unused scaffold assets. The working application primarily relies on:

- Raw HTML controls.
- Tailwind classes.
- CABANA CSS utilities.
- Framer Motion.
- Lucide icons.

## 8. State Management

| State area                  | Current mechanism                                                                    | Persistence/status                                                   |
| --------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Logged-in user              | `useAuthSession` subscribes to Supabase Auth                                         | Supabase session persisted in browser localStorage                   |
| Creator/member role         | Every signup becomes a creator; `user_roles` stores `user`; admin lookup is separate | Creator/member distinction **Not currently implemented**             |
| Creator profile             | TanStack Query + Supabase `creator_profiles`                                         | Database-backed                                                      |
| Links                       | TanStack Query + Supabase `links`; local reorder shadow state                        | Database-backed; reorder performs multiple independent updates       |
| Products/storefront         | TanStack Query + Supabase `products`                                                 | Database-backed                                                      |
| Feed/post state             | **Not currently implemented**                                                        | —                                                                    |
| Like state                  | **Not currently implemented**                                                        | —                                                                    |
| Comment state               | **Not currently implemented**                                                        | —                                                                    |
| Save/bookmark state         | **Not currently implemented**                                                        | —                                                                    |
| Follow state                | Local `useState` on public profile                                                   | Resets on refresh/navigation                                         |
| Fan subscription state      | **Not currently implemented**                                                        | —                                                                    |
| CABANA platform plan        | `subscriptions` table exists; profile also has a `plan` string                       | Database-backed records exist, but no checkout or plan-management UI |
| Message state               | **Not currently implemented**                                                        | —                                                                    |
| Notification state          | **Not currently implemented**                                                        | Admin bell is decorative                                             |
| Settings state              | Hardcoded default values                                                             | Does not persist                                                     |
| Onboarding state            | Local React state                                                                    | Resets on refresh; avatar upload is the exception                    |
| AI generation state         | Local React state and timer                                                          | Resets; hardcoded output                                             |
| Media-kit state             | Hardcoded arrays                                                                     | Does not persist                                                     |
| Admin state                 | Local active tab plus hardcoded arrays                                               | Does not persist                                                     |
| Dark mode                   | Fixed dark-first CSS; no mode toggle                                                 | No theme-state system                                                |
| Public profile visual theme | Theme string stored in profile                                                       | Persisted but not applied by the public renderer                     |

### Query behavior

- Each router instance creates a `QueryClient`.
- No global stale-time, retries, persistence, or hydration policy is customized beyond router preload stale time.
- Mutations invalidate `my-creator` and `creator-by-handle` query families.
- Mutations do not use optimistic updates or transactional rollback.

## 9. Data Model

### Current implemented database model

The generated Supabase types contain:

- `profiles`
- `creator_profiles`
- `links`
- `products`
- `analytics_events`
- `subscriptions` — CABANA platform plan, not fan subscription
- `user_roles`
- `reserved_handles`

| Current table      | Important current columns                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `profiles`         | `id`, `email`, `name`, `created_at`, `updated_at`                                                          |
| `creator_profiles` | `id`, nullable `user_id`, `handle`, `name`, `bio`, `avatar_url`, `banner_url`, `theme`, `plan`, timestamps |
| `links`            | `id`, `profile_id`, `title`, `url`, `icon`, `featured`, text `scheduled`, `position`, stored `clicks`      |
| `products`         | `id`, `profile_id`, `title`, display-string `price`, text `type`, `image_url`, `sales`, `position`         |
| `analytics_events` | `id`, nullable `profile_id`, `event_type`, nullable `target_id`, `metadata`, `created_at`                  |
| `subscriptions`    | `id`, `user_id`, `plan`, `status`, Stripe customer/subscription IDs, `current_period_end`, timestamps      |
| `user_roles`       | `id`, `user_id`, enum `role`, `created_at`                                                                 |
| `reserved_handles` | Primary-key `handle`                                                                                       |

The current application’s central client types are:

```ts
type CabanaTheme = "iridescent" | "midnight" | "rose" | "chrome";

interface CabanaProfile {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  banner: string;
  theme: CabanaTheme;
  plan: string;
}

interface CabanaLink {
  id: string;
  title: string;
  url: string;
  icon: string;
  clicks: number;
  ctr: string;
  scheduled?: string;
  featured?: boolean;
  position: number;
}

interface CabanaProduct {
  id: string;
  title: string;
  price: string;
  type: "Physical" | "Download" | "Membership";
  sales: number;
  img: string;
  position: number;
}
```

Current weaknesses include prices stored as display strings, `scheduled` stored as a label rather than a timestamp, no publish status, no product destination or checkout identifiers, and no separation between public profile fields and owner-only fields.

### Recommended production domain interfaces

The following interfaces cover the requested future social/monetization scope. They are recommendations, not current implementation.

```ts
type UserRole = "member" | "creator" | "moderator" | "admin";
type AccountStatus = "active" | "restricted" | "suspended" | "deleted";

interface User {
  id: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreatorProfile {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  avatarPath: string | null;
  bannerPath: string | null;
  bio: string;
  theme: string;
  subscriptionPriceCents: number | null;
  currency: string;
  subscriberCount: number;
  verified: boolean;
  monetizationStatus: "disabled" | "pending" | "active" | "restricted";
  createdAt: string;
  updatedAt: string;
}

interface MemberProfile {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  avatarPath: string | null;
  bio: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Post {
  id: string;
  creatorProfileId: string;
  caption: string;
  visibility: "public" | "followers" | "subscribers" | "purchase";
  priceCents: number | null;
  currency: string | null;
  status: "draft" | "scheduled" | "published" | "archived";
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Media {
  id: string;
  ownerUserId: string;
  postId: string | null;
  kind: "image" | "video" | "audio" | "file";
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  processingStatus: "uploaded" | "processing" | "ready" | "failed";
  moderationStatus: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface Comment {
  id: string;
  postId: string;
  userId: string;
  parentCommentId: string | null;
  body: string;
  status: "visible" | "hidden" | "deleted";
  createdAt: string;
  updatedAt: string;
}

interface Like {
  userId: string;
  postId: string;
  createdAt: string;
}

interface Save {
  userId: string;
  postId: string;
  createdAt: string;
}

interface Follow {
  followerUserId: string;
  creatorProfileId: string;
  status: "active" | "blocked";
  createdAt: string;
}

interface Subscription {
  id: string;
  memberUserId: string;
  creatorProfileId: string;
  provider: "stripe";
  providerCustomerId: string;
  providerSubscriptionId: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "unpaid";
  priceCents: number;
  currency: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string | null;
  mediaId: string | null;
  priceCents: number | null;
  unlockedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

interface Conversation {
  id: string;
  type: "direct" | "support";
  lastMessageId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

interface Notification {
  id: string;
  userId: string;
  actorUserId: string | null;
  type: "follow" | "like" | "comment" | "subscription" | "message" | "tip" | "purchase" | "system";
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface Transaction {
  id: string;
  payerUserId: string;
  creatorProfileId: string | null;
  type: "subscription" | "product" | "post_unlock" | "paid_message" | "tip" | "refund";
  providerPaymentId: string;
  grossCents: number;
  platformFeeCents: number;
  processorFeeCents: number;
  creatorNetCents: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "refunded" | "disputed";
  createdAt: string;
}

interface Tip {
  id: string;
  transactionId: string;
  senderUserId: string;
  creatorProfileId: string;
  amountCents: number;
  currency: string;
  message: string | null;
  createdAt: string;
}

interface CreatorEarnings {
  id: string;
  creatorProfileId: string;
  periodStart: string;
  periodEnd: string;
  grossCents: number;
  feesCents: number;
  refundsCents: number;
  netCents: number;
  availableCents: number;
  pendingCents: number;
  updatedAt: string;
}

interface Settings {
  userId: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  messagePermissions: "everyone" | "followers" | "subscribers" | "nobody";
  commentPermissions: "everyone" | "followers" | "subscribers" | "nobody";
  marketingOptIn: boolean;
  locale: string;
  timezone: string;
  updatedAt: string;
}
```

## 10. Mock Data / Demo Data

### Supabase-visible data

Read-only public API inspection found:

- **3 creator profiles**
  - `aurora`: ownerless seeded demo, Pro plan.
  - `oliviac`: ownerless seeded profile, Free plan.
  - `tylerdiorio`: linked to an authenticated user, Free plan.
- **11 links**
  - Aurora: 6.
  - Olivia C.: 3.
  - Tyler Diorio: 2 default “New link” rows.
- **4 products**
  - All belong to Aurora.
- **0 implemented posts**
- **0 implemented messages/conversations**
- **0 implemented notification records/types**
- Public reads returned no analytics rows because owner analytics are protected by RLS.
- Account/profile/subscription totals are not publicly readable and therefore remain **Unknown**.

Supabase-backed creator, link, and product data persists.

### Hardcoded UI/demo data

| Location                     | Demo data                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing creator showcase     | 5 creators/agencies                                                                                                                                                  |
| Landing feature grid         | 7 feature cards                                                                                                                                                      |
| Landing pricing teaser       | 3 tiers, inconsistent with the full 4-tier pricing route                                                                                                             |
| Full pricing route           | 4 plans, 11 comparison rows, 4 FAQ entries                                                                                                                           |
| AI marketing route           | 7 AI tools, 4 workflow steps, 3 brand variants, 4 model layers                                                                                                       |
| Onboarding                   | 6 creator types, 5 themes, 5 social providers, simulated generation                                                                                                  |
| AI Studio                    | 4 tools with fixed output samples                                                                                                                                    |
| Media kit                    | 4 metrics, 5 demographics, 5 geographies, all for Aurora                                                                                                             |
| Settings                     | 4 integrations and 4 social accounts                                                                                                                                 |
| Admin users                  | 6 mock users                                                                                                                                                         |
| Admin verification           | 3 requests                                                                                                                                                           |
| Admin payouts                | 5 payout rows                                                                                                                                                        |
| Admin flags                  | 4 reports                                                                                                                                                            |
| Admin featured               | 4 creators                                                                                                                                                           |
| TD profile                   | 6 static contact/social links                                                                                                                                        |
| El Don Dolla profile         | 4 static social links                                                                                                                                                |
| Phase 1 subscription modules | Deterministic generators for members, posts, media, comments, likes, saves, follows, creator subscriptions, conversations, messages, notifications, and transactions |

Hardcoded and local React data does not persist.

### Replacement requirements

- Replace admin arrays with server-only admin queries.
- Replace media-kit arrays with computed creator analytics and social-import data.
- Replace settings arrays with integration/account tables and OAuth connection records.
- Replace AI samples with an authenticated AI-generation service and usage records.
- Replace marketing claims that imply live functionality where the product is not implemented.
- Move special static creator pages into configurable profile templates unless they intentionally remain bespoke microsites.

## 11. Authentication Architecture

### Current login behavior

- Email/password is submitted to `supabase.auth.signInWithPassword`.
- Successful login updates the auth listener and navigates to the `redirect` query or `/dashboard`.
- An already-authenticated browser visiting `/login` is redirected client-side.

### Current signup behavior

- Validates non-empty name, basic email format, and minimum six-character password.
- Calls `supabase.auth.signUp`.
- Stores `name` in user metadata.
- Sets email redirect to `/dashboard`.
- Navigates immediately to `/onboarding`.
- A database trigger creates:
  - `profiles`
  - `creator_profiles`
  - Free `subscriptions`
  - `user_roles` with role `user`

### Logout behavior

- Available from the dashboard sidebar account card.
- Calls `supabase.auth.signOut()` and navigates to `/login`.
- No logout action is present in the public header.

### Session persistence

- Supabase uses browser `localStorage`.
- `persistSession` and `autoRefreshToken` are enabled.
- Auth state is subscribed to with `onAuthStateChange`.

### Demo account behavior

- There are no demo login credentials or fake authenticated demo account.
- `/demo` is a public ownerless creator profile, not an authenticated session.

### Role selection behavior

- No signup role selection exists.
- Every signup becomes a creator-style account.
- Database app roles are `admin`, `moderator`, and `user`; member and creator are not represented separately.
- Admin roles must be assigned outside the current UI.

### Missing security features

- Stronger password policy.
- Email-verification-specific UX.
- CAPTCHA/bot protection.
- OAuth/social login.
- MFA for creators and mandatory MFA for admins.
- Reauthentication for sensitive actions.
- Device/session management.
- Account deletion and data export.
- Server-side protected route loaders.
- Safe redirect allow-listing; the current redirect string is consumed directly.
- Recovery-link expiration/error handling.

### Important auth risk

If Supabase email confirmation is required, `signUp` may return a user without a usable session. The app still enters onboarding, where uploads can fail, and the final dashboard navigation redirects to login. This flow needs an explicit “verify your email” branch.

## 12. Creator Monetization Architecture

### Currently implemented demo behavior

| Capability                    | Current state                                                            |
| ----------------------------- | ------------------------------------------------------------------------ |
| CABANA platform subscriptions | Database table and pricing UI exist; no checkout or plan-management flow |
| Creator storefront products   | CRUD and public cards are implemented                                    |
| Product checkout              | **Not currently implemented**                                            |
| Membership product type       | Display/edit label only                                                  |
| Fan subscriptions to creators | **Not currently implemented**                                            |
| Locked posts                  | **Not currently implemented**                                            |
| Premium content               | **Not currently implemented**                                            |
| Tips                          | **Not currently implemented**                                            |
| Paid messages                 | **Not currently implemented**                                            |
| Mock checkout screen          | **Not currently implemented**                                            |
| Creator dashboard             | Implemented for profile/links/products/analytics                         |
| Earnings display              | Marketing/admin mock values only; no creator earnings ledger             |
| Payouts                       | Admin mock table only                                                    |

### Required production behavior

- Separate CABANA SaaS billing from fan-to-creator monetization:
  - Rename current `subscriptions` concept to `platform_subscriptions`.
  - Use `subscriptions` for member-to-creator entitlements.
- Create server-side Stripe Checkout/PaymentIntent flows.
- Use Stripe Connect or an equivalent marketplace payout product.
- Store all amounts as integer minor units with explicit currency.
- Treat provider webhooks as the source of truth.
- Create immutable transaction and earnings-ledger rows.
- Grant content access from entitlements, not client flags.
- Handle failed renewal, grace periods, cancellation, refunds, disputes, and chargebacks.
- Add tax/KYC status before enabling creator monetization.
- Build product order, digital delivery, inventory, and fulfillment models.
- Use idempotency keys for all money-moving operations.

## 13. Messaging Architecture

### Current state

- Inbox: **Not currently implemented**
- Conversation list: **Not currently implemented**
- Chat view: **Not currently implemented**
- Sending messages: **Not currently implemented**
- Message persistence: **Not currently implemented**
- Read/unread state: **Not currently implemented**
- Typing indicators: **Not currently implemented**
- Media attachments: **Not currently implemented**
- Real-time delivery: **Not currently implemented**

The envelope icon on the generic creator page points to `#`. The TD profile uses email as an external contact method.

### Recommended production architecture

- `conversations`, `conversation_participants`, and `messages` tables.
- RLS based on participant membership.
- Supabase Realtime for inserts/updates, presence, and optional typing indicators.
- Cursor pagination by `(created_at, id)`.
- Separate read receipts in `conversation_participants.last_read_message_id` or `message_reads`.
- Private attachment bucket with signed URLs and entitlement checks.
- Server-side paid-message unlock action linked to a transaction.
- Abuse controls: blocks, message permissions, spam limits, report actions, and attachment scanning.

## 14. Notifications Architecture

### Current state

- No notification table or route.
- No member/creator badge counts.
- No read/unread persistence.
- No click behavior.
- Admin top bar displays a decorative bell and dot only.
- Backend notification triggers are **Not currently implemented**.

### Recommended production architecture

- Persist notifications with actor, recipient, type, target entity, payload, creation time, and `read_at`.
- Generate notifications from server/database events for follows, comments, likes, subscriptions, messages, tips, purchases, payouts, moderation, and system notices.
- Maintain unread count through an indexed query or counter cache.
- Mark one/all as read with owner-only RLS.
- Deliver email/push through an outbox/worker system so transaction writes do not wait on external providers.
- Deduplicate high-volume events, for example “12 people liked your post.”

## 15. Media / Upload Architecture

### Current image handling

- Bundled images under `src/assets` and `public`.
- External Unsplash URLs for seeded/demo records.
- Supabase Storage uploads for avatars and products.
- `avatars`, `banners`, and `products` bucket policies appear in migrations.
- Uploaded objects use paths `${userId}/${randomUUID}.${extension}`.
- Database rows store public URLs.

### Current video handling

**Not currently implemented.**

### Upload UI and preview

- Onboarding avatar upload validates image MIME type and a 5 MB client-side maximum.
- Profile editor avatar input accepts `image/*` but has no explicit size validation.
- Product drawer accepts `image/*` with no explicit size validation.
- Uploaded avatar/product images appear after query invalidation.
- A `banner` field and bucket exist, but no banner upload UI exists.

### Storage limitations

- `getPublicUrl` is used. Owner-only `storage.objects` select policies do not make CDN objects private when buckets are public.
- No signed URL access for paid/private media.
- No server-side MIME validation, virus scanning, image moderation, EXIF stripping, resizing, thumbnails, transcoding, or orphan cleanup.
- No upload progress, retry, cancellation, quota, or lifecycle policy.
- File extensions are derived from the client-provided filename.
- No video/audio processing pipeline.

### Required production approach

- Public bucket only for explicitly public avatars/banners.
- Private buckets for posts, paid content, messages, and digital downloads.
- Signed upload and download URLs issued after authorization checks.
- Store storage paths rather than permanent public URLs.
- Validate MIME signature, size, dimensions, and ownership server-side.
- Generate optimized variants and poster frames asynchronously.
- Moderate media before publication.
- Track processing and moderation status in a `media` table.
- Use short-lived signed URLs for entitled viewers.

## 16. Styling / Design System

### Brand colors

The design is dark-first and defined with OKLCH tokens:

- Background: near-black violet, `oklch(0.12 0.01 280)`.
- Foreground: near-white, `oklch(0.98 0.005 280)`.
- Primary: cyan, `oklch(0.85 0.12 195)`.
- Accent: magenta, `oklch(0.7 0.18 330)`.
- Iridescent: violet, `oklch(0.78 0.15 280)`.
- Chrome: pale cool gray, `oklch(0.92 0.02 230)`.
- Destructive: warm red, `oklch(0.65 0.22 25)`.

### Typography

- Display: Space Grotesk with Inter fallback.
- Body: Inter/system sans.
- Headings use tight negative tracking and weight 600.
- Responsive display scales are defined with `clamp`.
- Eyebrows use small uppercase text with wide letter spacing.

No web-font import was found; rendering depends on locally available fonts unless the deployment injects them elsewhere. This should be verified.

### Spacing

- Explicit 4 px base scale from 4 through 96 px.
- Layouts use large vertical section spacing, generally `py-32`.
- Mobile uses compact side padding and safe-area insets.

### Border radius

- Token scale: 8, 14, 20, 28, and 36 px.
- Hero devices and major luxury panels use larger custom radii up to approximately 44 px.

### Shadows and gradients

- Iridescent cyan-violet-magenta-gold gradient.
- Chrome gradient.
- Large colored radial glows.
- Glow, luxury, glass, and inset-highlight shadow tokens.

### Glassmorphism

- `.glass`: translucent dark surface, 24 px blur, saturation, border, and inset/depth shadow.
- `.glass-strong`: denser surface with 40 px blur.
- Used across navigation, cards, controls, modals, and profile blocks.

### Dark mode

- Dark mode is effectively permanent through `html { color-scheme: dark; }`.
- A `.dark` variant exists, but no light theme or theme toggle is implemented.

### Reusable style patterns

- `.btn-luxury`
- `.btn-ghost`
- `.field-luxury`
- `.text-iridescent`
- `.text-chrome`
- `.surface-chrome`
- `.eyebrow`
- `.grain`
- Floating/glow animations with reduced-motion support

### CABANA logo usage

- The global header and auth screens use a sparkle glyph plus wordmark text.
- The landing footer uses `cabana-logo.png`.
- Public creator pages use the larger `cabana-logo.webp` as “Powered by.”
- Special profiles use their own custom branding.

### Preserving the luxury premium tone

- Keep the dark neutral base and use iridescence as an accent, not a full-page fill.
- Preserve generous whitespace and restrained content density.
- Use motion for reveal, hierarchy, and tactility rather than constant activity.
- Keep typography large, tight, and editorial.
- Maintain strong photography quality and consistent art direction.
- Avoid adding generic SaaS cards, excessive badges, or unrelated color accents.
- Standardize bespoke pages through tokens and variants without flattening their art direction.

## 17. Local Persistence

### Current browser persistence

The only active application persistence found is Supabase Auth:

- Expected default key: `sb-dwnricswfskypqqfknnh-auth-token`.
- Stores the Supabase session/refresh token in localStorage.
- Auto-refresh is enabled.

The exact key is derived from Supabase’s default storage-key convention; no custom key is configured.

### Other browser storage

- No CABANA-specific localStorage keys were found.
- No sessionStorage or IndexedDB use was found.
- A scaffolded, currently unused shadcn sidebar component can write a cookie named `sidebar_state` for seven days. CABANA’s actual dashboard sidebar does not use that component.

### What resets

- Follow state.
- Onboarding selections.
- AI prompt/output.
- Pricing toggle.
- Admin selected tab.
- Open modals and inline editors.
- Settings form values beyond hardcoded defaults.

### Limitations of local-only data

- It does not synchronize across devices.
- It cannot enforce permissions or entitlements.
- It can be manipulated by the user.
- It is unsuitable for follows, subscriptions, purchases, messages, notifications, moderation, or earnings.

## 18. Backend Requirements For Production

The existing Supabase backend is a reasonable foundation, but it must be completed and made reproducible.

### Recommended platform

- Supabase PostgreSQL for relational data.
- Supabase Auth for accounts and sessions.
- Supabase Storage for public and private media.
- Supabase Realtime for messaging and notification delivery.
- TanStack Start server functions or Supabase Edge Functions for privileged workflows.

### Required backend capabilities

- A complete baseline migration that can build the database from zero.
- Auth trigger or transactional signup provisioning with failure recovery.
- Separate member and creator profiles.
- Role and capability model for member, creator, moderator, finance admin, and super-admin.
- RLS on every user/creator-owned table.
- Private media buckets and short-lived signed URLs.
- Payment-provider webhooks with signature verification and idempotency.
- Creator onboarding/KYC and connected-account status.
- Immutable transactions, earnings ledger, payouts, refunds, and disputes.
- Admin dashboard APIs that never expose service-role credentials.
- Content moderation, user reports, blocks, suspensions, and takedowns.
- Audit logs for admin and financial actions.
- Email delivery through a transactional provider.
- Real-time messaging and notification subscriptions.
- Background jobs/outbox processing for emails, media processing, webhook retries, and aggregate updates.
- Monitoring for database performance, RLS failures, webhook failures, queue lag, and payment reconciliation.

### Database performance principles

- Index every foreign key and every column used in RLS filters.
- Use composite indexes that match common equality-plus-time queries.
- Use partial indexes for unread, pending, active, or undeleted records.
- Use cursor pagination instead of deep offsets.
- Keep payment/database transactions short; do not hold locks while calling external APIs.
- Use integer minor units for money.
- Consider UUIDv7 or another time-ordered identifier for high-volume event/message tables.
- Enable and monitor `pg_stat_statements`.

## 19. Database Schema Recommendation

The current `subscriptions` table represents CABANA SaaS billing. Before adding fan subscriptions, rename it to `platform_subscriptions` or otherwise make the distinction explicit.

| Table                       | Purpose                                            | Important columns                                                                                        | Relationships                                                    |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `users`                     | Application account projection over `auth.users`   | `id`, `email`, `status`, `created_at`, `updated_at`, `deleted_at`                                        | `id = auth.users.id`; one-to-one settings/profiles               |
| `profiles`                  | Shared public/basic identity                       | `user_id`, `display_name`, `username`, `avatar_path`, `bio`                                              | One-to-one with users; parent concept for member/creator views   |
| `creator_profiles`          | Creator business and monetization identity         | `id`, `user_id`, `handle`, `banner_path`, `theme`, `verified`, `monetization_status`, `default_currency` | One-to-one user; parent of posts/products/subscriptions/earnings |
| `member_profiles`           | Fan/member identity and privacy                    | `id`, `user_id`, `is_private`                                                                            | One-to-one user                                                  |
| `follows`                   | Member follows creator                             | `follower_user_id`, `creator_profile_id`, `status`, `created_at`                                         | Unique pair; references users and creators                       |
| `subscriptions`             | Fan-to-creator recurring entitlement               | `member_user_id`, `creator_profile_id`, provider IDs, `status`, `price_cents`, `currency`, period fields | References user, creator, transaction/provider                   |
| `posts`                     | Creator content unit                               | `creator_profile_id`, `caption`, `visibility`, `price_cents`, `status`, `published_at`, `scheduled_at`   | Parent of media/comments/likes/saves                             |
| `media`                     | Storage metadata and processing/moderation state   | `owner_user_id`, bucket/path, kind, MIME, bytes, dimensions/duration, processing/moderation status       | Referenced by posts, products, profiles, and messages            |
| `post_media`                | Ordered media attached to posts                    | `post_id`, `media_id`, `position`                                                                        | Join between posts and media                                     |
| `products`                  | Creator goods, downloads, memberships, or services | `creator_profile_id`, `type`, `title`, `description`, `price_cents`, `currency`, `status`, `inventory`   | Has media/files and order items                                  |
| `orders`                    | Customer purchase lifecycle                        | `buyer_user_id`, creator, totals, currency, provider checkout/payment IDs, `status`                      | Parent of order items; linked to transactions                    |
| `order_items`               | Purchased product snapshot                         | `order_id`, `product_id`, title/price snapshot, quantity                                                 | References order and product                                     |
| `comments`                  | Threaded post discussion                           | `post_id`, `user_id`, `parent_comment_id`, `body`, `status`                                              | Self-reference for replies                                       |
| `likes`                     | Unique user/post reaction                          | `user_id`, `post_id`, `created_at`                                                                       | Composite primary/unique key                                     |
| `saves`                     | Private bookmarks                                  | `user_id`, `post_id`, `created_at`                                                                       | Composite primary/unique key                                     |
| `conversations`             | Chat container                                     | `id`, `type`, `last_message_id`, `last_message_at`                                                       | Has participants and messages                                    |
| `conversation_participants` | Conversation membership/read state                 | `conversation_id`, `user_id`, `last_read_message_id`, `joined_at`, `blocked_at`                          | Unique conversation/user                                         |
| `messages`                  | Chat messages and paid-message offers              | `conversation_id`, `sender_user_id`, `body`, `media_id`, `price_cents`, `unlocked_at`, `created_at`      | References conversation, user, media                             |
| `notifications`             | Durable activity/system notifications              | `user_id`, `actor_user_id`, `type`, `entity_type`, `entity_id`, `payload`, `read_at`, `created_at`       | Recipient and optional actor                                     |
| `transactions`              | Immutable payment ledger                           | provider IDs, payer, creator, type, gross/fees/net, currency, status, timestamps                         | Parent of tip/order/refund references                            |
| `tips`                      | Tip-specific business record                       | `transaction_id`, sender, creator, amount, message                                                       | One-to-one transaction                                           |
| `payouts`                   | Creator payout batches/transfers                   | creator, provider payout ID, amount, currency, status, arrival/failure fields                            | References creator and included earning entries                  |
| `creator_earnings`          | Creator ledger or period summary                   | creator, transaction, available date, gross/fees/net, state                                              | References creator, transaction, payout                          |
| `reports`                   | User/content reports                               | reporter, subject type/id, reason, details, status, assignee                                             | References reporter/admin where applicable                       |
| `admin_users`               | Admin capability metadata                          | `user_id`, `role`, `permissions`, `active`, `created_at`                                                 | One-to-one user; can replace/extend `user_roles`                 |
| `audit_logs`                | Immutable privileged-action history                | actor, action, target, before/after JSON, IP, user agent, created_at                                     | References admin/user where possible                             |
| `settings`                  | User preferences                                   | `user_id`, notification flags, privacy/message permissions, locale, timezone                             | One-to-one user                                                  |
| `platform_subscriptions`    | Creator/agency billing for CABANA itself           | user/account, plan, provider customer/subscription IDs, status, period fields                            | Separate from fan-to-creator subscriptions                       |

### Additional tables required for a complete system

- `product_files`
- `blocks`
- `content_entitlements`
- `webhook_events`
- `outbox_jobs`
- `creator_verifications`
- `refunds`
- `disputes`

### Recommended constraints and indexes

- Case-insensitive unique index on `lower(username)` and `lower(handle)`.
- Unique pairs on follows, likes, saves, conversation participants, and active subscription scope.
- Check constraints for non-negative monetary amounts and valid currency length.
- Foreign-key indexes on every referencing column.
- `posts (creator_profile_id, published_at desc, id desc)` with a partial index for `status = 'published'`.
- `messages (conversation_id, created_at desc, id desc)`.
- `notifications (user_id, created_at desc)` plus partial index where `read_at is null`.
- `analytics_events (profile_id, created_at desc)`.
- `transactions (creator_profile_id, created_at desc)` and unique provider event/payment IDs.
- `reports (status, created_at)` for moderation queues.
- RLS policies should use `(select auth.uid())` and indexed ownership columns.

## 20. API / Server Actions Recommendation

Use direct Supabase client access only for low-risk, RLS-safe CRUD. Use server actions/functions for money, entitlements, admin, signed URLs, and provider integrations.

### Auth

- `signUpMember`
- `signUpCreator`
- `signIn`
- `signOut`
- `requestPasswordReset`
- `updatePassword`
- `deleteAccount`
- `listSessions`
- `revokeSession`

### Profiles

- `getPublicCreator(handle)`
- `getMyProfile`
- `updateMyProfile`
- `claimHandle`
- `submitCreatorVerification`
- `setCreatorTheme`

### Posts

- `createPost`
- `updatePost`
- `publishPost`
- `schedulePost`
- `archivePost`
- `getCreatorFeed`
- `getMemberFeed`
- `getPostWithEntitlement`

### Comments

- `createComment`
- `updateOwnComment`
- `deleteOwnComment`
- `hideCommentAsCreator`
- `listCommentsCursor`

### Likes and saves

- `toggleLike`
- `toggleSave`
- `listSavedPosts`

### Follows

- `followCreator`
- `unfollowCreator`
- `listFollowers`
- `listFollowing`
- `blockUser`

### Subscriptions and payments

- `createCreatorSubscriptionCheckout`
- `createPlatformPlanCheckout`
- `openBillingPortal`
- `cancelSubscription`
- `resumeSubscription`
- `handlePaymentWebhook`
- `getEntitlement`

### Tips and purchases

- `createTipPayment`
- `createProductCheckout`
- `unlockPost`
- `unlockPaidMessage`
- `requestRefund`

### Messages

- `createConversation`
- `listConversationsCursor`
- `listMessagesCursor`
- `sendMessage`
- `sendPaidMessage`
- `markConversationRead`
- `getAttachmentSignedUrl`

### Notifications

- `listNotificationsCursor`
- `markNotificationRead`
- `markAllNotificationsRead`
- `getUnreadNotificationCount`

### Uploads

- `createUploadIntent`
- `completeUpload`
- `deleteMedia`
- `getPublicVariant`
- `getEntitledSignedUrl`
- `processMediaWebhook`

### Reports and moderation

- `createReport`
- `listMyReports`
- `adminListReports`
- `adminResolveReport`
- `adminSuspendUser`
- `adminRestoreUser`
- `adminRemoveContent`

### Admin

- `adminSearchUsers`
- `adminSetRole`
- `adminReviewVerification`
- `adminReviewTransaction`
- `adminRetryPayout`
- `adminFeatureCreator`
- `adminGetMetrics`

Every state-changing privileged action should validate input, authorize on the server, use idempotency where relevant, and create an audit entry.

## 21. Security Requirements

### Authentication

- Verified email before sensitive or monetized actions.
- Strong password policy and breached-password screening where supported.
- MFA for creators with payouts and mandatory MFA for admins.
- CAPTCHA/risk scoring on signup, login, password reset, and anonymous report/analytics endpoints.

### Authorization and RBAC

- Separate member, creator, moderator, support, finance, and admin capabilities.
- Enforce access in PostgreSQL RLS and trusted server actions, not only UI routes.
- Never expose service-role credentials to the browser.
- Use least-privilege grants and revoke unnecessary default schema/table access.

### Current security observations

- Public creator queries use `select("*")`; current public API responses include `creator_profiles.user_id`. Public endpoints should select a safe column list or use a public view that omits owner identifiers.
- Current storage uses public URLs. This is unsuitable for paid or private content.
- Anonymous analytics inserts can be spammed; the current RLS check only verifies that a profile exists.
- Admin route protection is client-side. Real admin data/actions must be server-gated.
- The repository does not include the complete RLS baseline, so full current policy correctness is **Unknown**.
- Upload validation is mostly client-side.
- Observed deployment headers include HSTS, strict referrer policy, and `nosniff`, but no Content Security Policy was observed.

### Private media access

- Keep paid/private files in private buckets.
- Verify entitlement on every signed URL issuance.
- Use short expirations and avoid logging full signed URLs.
- Do not trust client-provided creator/content IDs.

### Rate limiting and abuse prevention

- Rate-limit auth, messages, comments, follows, tips, reports, signed URLs, and analytics ingestion.
- Add spam detection, link-domain controls, account reputation, blocking, and moderation queues.
- Prevent self-follow, duplicate entitlements, duplicate checkout, and replayed webhooks through constraints/idempotency.

### Input validation

- Shared Zod schemas for client and server.
- Normalize/validate handles, URLs, currency, money, text length, MIME type, and enum values.
- Sanitize rich text if introduced.
- Validate file signatures rather than trusting file extensions.

### Admin audit logs

- Record actor, action, reason, target, before/after values, request ID, IP, and user agent.
- Make logs append-only to application roles.
- Separate finance operations from content moderation permissions.

### Payment security

- Use hosted/provider-controlled card collection.
- Never store raw card data.
- Verify webhook signatures.
- Reconcile provider balances, transactions, refunds, disputes, and payouts.
- Use idempotency keys and immutable ledger entries.

### Data privacy

- Minimize PII exposure.
- Encrypt provider tokens and sensitive verification fields.
- Define retention schedules.
- Support access, correction, deletion, and export requests.

## 22. Compliance Requirements

This section is implementation guidance, not legal advice.

### Terms of Service

- Define platform role, prohibited use, account termination, payment responsibilities, dispute process, and limitation of liability.
- Require explicit acceptance with version and timestamp records.

### Privacy Policy

- Inventory auth, analytics, device, payment, creator KYC, message, and media data.
- Disclose processors and international transfers.
- Implement consent and preference records where required.

### Creator Agreement

- Define content ownership/license, platform fees, payout timing, reserves, chargebacks, tax obligations, KYC, prohibited content, moderation, and account closure.
- Version and record acceptance before monetization.

### Refund Policy

- Define separate rules for platform plans, physical products, digital goods, subscriptions, tips, and paid content.
- Encode refund eligibility and creator/platform responsibility into admin workflows.

### DMCA Policy

- Publish designated-agent/contact information.
- Create notice, takedown, counter-notice, repeat-infringer, and restoration workflows.
- Preserve evidence and timestamps in reports/audit logs.

### Content Policy

- Define allowed/prohibited content, harassment, impersonation, scams, illegal goods, copyright, explicit content, and off-platform links.
- Connect policy categories to report reasons and moderator outcomes.

### Age verification

- At minimum, enforce required account age and block minors from creator monetization.
- If adult content is ever allowed, implement jurisdiction-aware age assurance for creators and viewers before launch.

### Creator identity verification

- Require KYC/identity and sanctions screening through the payout provider before monetization or payouts.
- Store provider verification status, not unnecessary raw documents.

### Payment compliance

- Use a PCI-compliant provider-hosted flow.
- Implement Strong Customer Authentication where applicable.
- Maintain refund, dispute, and fraud procedures.

### Tax reporting

- Collect required tax information through the payout provider.
- Track gross earnings, fees, refunds, and payouts by tax year and jurisdiction.
- Support required U.S. and international reporting based on the platform’s merchant/payout model.

### Moderation and takedown workflow

```text
Report received
→ triage/severity
→ temporary restriction when necessary
→ reviewer decision and evidence
→ user/creator notice
→ appeal
→ final action
→ retention/audit record
```

## 23. Missing Features / Gaps

### Frontend

- [ ] Fan/member application shell.
- [ ] Feed, discover, posts, post detail, comments, saves, and likes.
- [ ] Real product detail and checkout.
- [ ] Persistent follow UX.
- [ ] Inbox, chat, and notifications.
- [ ] Real settings forms and integration status.
- [ ] Creator earnings/subscriber/order screens.
- [ ] Working media-kit export.
- [ ] Loading/error/empty states for all mutations.
- [ ] Accessibility pass, keyboard focus review, and form labeling consistency.
- [ ] Resolve dead buttons and `#` links.

### Backend

- [ ] Complete reproducible baseline migrations.
- [ ] Server functions for privileged operations.
- [ ] Background job/outbox system.
- [ ] Webhook processing and reconciliation.
- [ ] Search/discover service.
- [ ] Full analytics ingestion/session model.

### Database

- [ ] Member, post, media, social, messaging, notification, payment, moderation, and audit tables.
- [ ] Complete constraints and FK/RLS indexes.
- [ ] Public-safe profile views.
- [ ] Platform subscription versus creator subscription separation.
- [ ] Seed strategy for demo data.

### Auth

- [ ] Member/creator role choice or creator-upgrade flow.
- [ ] Email verification branch.
- [ ] OAuth.
- [ ] MFA.
- [ ] CAPTCHA/risk controls.
- [ ] Account deletion/export/session management.

### Payments

- [ ] Checkout.
- [ ] Billing portal.
- [ ] Webhooks.
- [ ] Refunds and disputes.
- [ ] Product orders and digital delivery.

### Payouts

- [ ] Connected accounts/KYC.
- [ ] Earnings ledger.
- [ ] Balance availability.
- [ ] Payout scheduling and reconciliation.
- [ ] Failed payout handling.

### Messaging

- [ ] Conversations and participants.
- [ ] Persistent messages.
- [ ] Realtime delivery.
- [ ] Read receipts and typing.
- [ ] Attachments and paid messages.
- [ ] Blocking/reporting/rate limits.

### Notifications

- [ ] Notification table and event generation.
- [ ] Unread counts.
- [ ] Notification center.
- [ ] Email/push delivery and preferences.

### Media storage

- [ ] Private buckets and signed URLs.
- [ ] Video/audio support.
- [ ] Media processing and moderation.
- [ ] Upload progress/retry/quota.
- [ ] Orphan cleanup and retention.

### Admin

- [ ] Real data queries.
- [ ] User and role management.
- [ ] Verification workflow.
- [ ] Finance and payout tools.
- [ ] Feature curation.
- [ ] Audit log viewer.

### Moderation

- [ ] Reports, blocks, suspensions, takedowns, appeals.
- [ ] Automated and human media review.
- [ ] Spam/fraud detection.

### Compliance

- [ ] Legal pages and acceptance records.
- [ ] Creator agreement/KYC.
- [ ] DMCA process.
- [ ] Refund/content policies.
- [ ] Tax and payout reporting.

### Security

- [ ] Complete RLS audit.
- [ ] Safe public views.
- [ ] CSP and additional security headers.
- [ ] Server-side upload validation.
- [ ] Rate limiting and abuse controls.
- [ ] Admin MFA and least-privilege scopes.

### Testing

- [ ] Unit tests for mappers, validation, and money calculations.
- [ ] RLS policy tests for every role.
- [ ] Integration tests for auth, profile CRUD, uploads, and analytics.
- [ ] End-to-end tests for signup through public publishing.
- [ ] Payment/webhook/idempotency tests.
- [ ] Accessibility and responsive visual regression tests.
- [ ] Load tests for feeds, messages, notifications, and analytics.

### Deployment

- [ ] Version-controlled Git repository/history in the handoff workspace.
- [ ] Documented staging and production environments.
- [ ] CI for lint, typecheck, test, migration validation, and build.
- [ ] Preview deployment policy.
- [ ] Secrets rotation and environment ownership.
- [ ] Database backups, point-in-time recovery, and disaster recovery runbook.
- [ ] Monitoring, error tracking, uptime, and alerting.

## 24. Recommended Build Roadmap

### Phase 1 — Stabilize Current Demo

- Fix or remove dead buttons and `#` links.
- Connect all intended navigation.
- Persist onboarding fields or clearly mark the wizard as preview-only.
- Align onboarding theme IDs with profile themes.
- Apply saved themes to public pages.
- Add URL/product/upload validation and deletion confirmations.
- Debounce profile/link/product edits and make link reorder atomic.
- Replace hardcoded plan labels with actual subscription data.
- Reconcile `/docs/data-model` with the real schema.
- Add core smoke tests for public pages, auth, dashboard CRUD, uploads, and analytics.

### Phase 2 — Add Real Backend

The project already has partial Supabase integration. This phase should complete the foundation:

- Create a complete baseline schema migration.
- Audit and test all RLS policies.
- Add member/creator account modeling.
- Add public-safe views and private storage.
- Add server-function authentication plumbing.
- Add posts, media, follows, settings, reports, and entitlement foundations.
- Establish staging, CI, migrations, backups, and observability.

### Phase 3 — Creator Monetization

- Define creator tiers/offers and content-entitlement rules.
- Add posts, locked content, fan subscriptions, tips, and paid unlock records.
- Build creator subscriber, product, order, and earnings UX.
- Integrate payment flows in sandbox mode.
- Add KYC/monetization-status gating.

### Phase 4 — Messaging + Notifications

- Add conversations, participants, messages, and private attachments.
- Add Supabase Realtime subscriptions.
- Add read/unread state, typing/presence, and cursor pagination.
- Create durable notification triggers and notification center.
- Add email/push outbox delivery and preferences.

### Phase 5 — Admin + Moderation

- Replace hardcoded admin data with server-only queries.
- Add user/role management.
- Add reports, verification, content review, blocks, suspensions, appeals, and feature curation.
- Add immutable admin audit logs.
- Separate moderator, support, and finance permissions.

### Phase 6 — Payments + Payouts

- Productionize payment processor integration.
- Add connected creator accounts and payout eligibility.
- Implement immutable transaction/earnings ledgers.
- Reconcile webhooks, balances, payouts, refunds, disputes, and chargebacks.
- Add finance admin tools and alerts.

### Phase 7 — Compliance + Launch Prep

- Publish legal and policy pages.
- Record policy acceptance.
- Complete creator verification and tax flows.
- Run security/RLS review and penetration testing.
- Run accessibility, performance, backup-restore, and incident-response exercises.
- Launch a controlled beta with monitoring and support procedures.

## 25. Developer Handoff Notes

### How to run the project

The repository uses `bun.lock`, so Bun is the preferred package manager:

```bash
bun install
bun run dev
```

Other useful commands:

```bash
bun run build
bun run lint
bun run preview
```

The dev server command is Vite through the Lovable TanStack configuration. Exact local host/port defaults are controlled by that package.

### Environment variables needed

Client and SSR:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Trusted server-only operations:

```text
SUPABASE_SERVICE_ROLE_KEY
```

Also present:

```text
VITE_SUPABASE_PROJECT_ID
```

Future production work will add payment, email, AI, monitoring, and media-processing secrets. Those must remain server-only.

### Files developers should inspect first

1. `src/routeTree.gen.ts` — authoritative route inventory.
2. `src/routes/__root.tsx` — app shell, metadata, errors, providers.
3. `src/lib/cabana-store.ts` — current domain model and data operations.
4. `src/lib/cabana-auth.ts` — auth behavior.
5. `src/integrations/supabase/types.ts` — current remote schema as generated.
6. `supabase/migrations/` — partial migrations and security changes.
7. `src/routes/$username.tsx` — public creator experience.
8. `src/routes/dashboard.tsx` and `src/components/cabana/dashboard/` — creator Studio.
9. `src/routes/admin.tsx` — role gate and hardcoded admin demo.
10. `src/styles.css` — brand/design tokens.

### Current risks

- The database cannot be safely recreated from the checked-in migrations alone.
- Existing RLS policies cannot be fully audited from this repository because the base policy/schema migration is absent.
- Public creator reads expose `user_id`.
- Public storage URLs cannot protect paid/private content.
- The product narrative mixes a creator link/storefront SaaS, AI creator OS, agency suite, and future fan-subscription network without one canonical domain model.
- Onboarding and pricing promise capabilities that are not connected.
- The platform and landing page use inconsistent plan names/counts.
- Existing internal data-model documentation is stale.
- Auth and route protection are primarily client-driven.
- Admin UX appears operational but is entirely hardcoded.
- The current workspace has no Git metadata/history, so change provenance is unavailable.

### Recommended next technical task

Create and validate a complete Supabase baseline migration from the live schema, including tables, constraints, indexes, functions, triggers, storage buckets, seed data, grants, and RLS policies. Test that a fresh local/staging Supabase instance can be rebuilt from zero before adding features.

### Recommended next product task

Decide and document the canonical V1 product boundary:

1. Creator operating system/link page/storefront SaaS, or
2. Fan subscription/content/messaging marketplace.

The current application is substantially option 1. Feed, member, messaging, locked-content, tip, and payout requirements belong to option 2 and materially change the data, security, compliance, and payment architecture. That decision should precede implementation of those systems.

## 26. Phase 1 Subscription Foundation Addendum

Added June 25, 2026:

- `docs/CABANA_BUILD_ROADMAP.md` as the implementation sequence for subscription-platform expansion.
- `src/lib/cabana-types.ts` with typed contracts for the requested future domain modules.
- `src/lib/cabana-demo-data.ts` with deterministic demo generators and no private or provider data.
- Reusable `FoundationPage` styling that preserves the CABANA visual system.
- Creator dashboard placeholders for posts, subscribers, messages, earnings, and notifications.
- Public/member placeholders for feed, discover, messages, and notifications.
- Dashboard navigation links for the five new creator routes.

No Supabase schema, payment provider, payout workflow, KYC workflow, or existing feature was replaced in this phase.
