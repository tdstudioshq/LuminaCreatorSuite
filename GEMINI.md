# CABANA — Workspace Instructions & Architectural Guidance

This file serves as the primary instructional context and development guide for working within the **CABANA** codebase (repository folder: `LuminaCreatorSuite`).

---

## 1. Project Overview & Architecture

**CABANA** is a premium, luxury-positioned creator operating system, link-in-bio, and storefront application that is evolving into a premium creator subscription platform.

### Core Technology Stack

- **Frontend Framework:** React `19.2.0`
- **Full-Stack Framework:** TanStack Start `1.167.x` (SSR with client hydration)
- **Routing:** TanStack Router (file-based, generated into `src/routeTree.gen.ts`)
- **Build Tool:** Vite `7.3.1` using `@lovable.dev/vite-tanstack-config`
- **Styling:** Tailwind CSS `4.2.1` (using CSS-based configuration, no `tailwind.config`)
- **Motion & Icons:** Framer Motion `12.38.0` and Lucide React
- **Database & Auth:** Supabase (Auth, PostgreSQL, Object Storage, Realtime)
- **Deployment:** **Vercel** (production: `cabanagrp.com`) via Nitro's `vercel` preset — `vite.config.ts` sets `nitro.preset: "vercel"` so `bun run build` emits `.vercel/output`; production deploys are prebuilt (`vercel deploy --prebuilt`). The bundled config still includes the Cloudflare plugin (see §2.1) and `wrangler.jsonc` remains only because that plugin reads it, but the deploy target is Vercel — not Cloudflare Workers.

---

## 2. Core Architecture & Conventions

### 2.1 File-Based Routing & SSR

- **Location:** File-based routes live under `src/routes/`.
- **Naming Pattern:** Flat dot-notation maps to nested paths (e.g., `dashboard.posts.tsx` resolves to `/dashboard/posts`). Public creator profile page is mapped to `/$username.tsx`.
- **Generated Code:** `src/routeTree.gen.ts` is automatically generated on dev/build. **Never edit this file manually.**
- **SSR entry:** Managed via `src/server.ts` (redirected in `vite.config.ts`), which wraps the request handler to catch thrown or unhandled catastrophic 500 errors and return a branded error page.
- **Vite Config:** Uses `@lovable.dev/vite-tanstack-config`, which automatically bundles SSR, React, Tailwind, tsconfig paths, the Cloudflare plugin, `@` alias, and environment variables. Do **not** manually duplicate these plugins. Note: despite the bundled Cloudflare plugin, `vite.config.ts` overrides `nitro.preset` to `"vercel"` and restores the preset's Build Output paths so the build emits `.vercel/output` for the **Vercel** deploy target; it also pre-bundles every runtime dependency via `optimizeDeps.include` (add new runtime deps there).

### 2.2 Supabase Client Boundaries (`src/integrations/supabase/`)

Choose the appropriate client based on the trust boundary:

1. **Browser Client (`client.ts`):** `supabase` anon client (publishable key). Used by all client-side React Query hooks. Row-Level Security (RLS) is strictly enforced here. Lazily instantiated via a Proxy.
2. **Server Admin Client (`client.server.ts`):** `supabaseAdmin` service-role client. **Bypasses RLS entirely.** Server-only and must **never** be imported into client-side code.
3. **Require Auth Middleware (`auth-middleware.ts`):** `requireSupabaseAuth` TanStack middleware. Validates bearer token, yielding a per-request client and `userId` under caller RLS.
4. **Optional Auth Middleware (`optional-auth-middleware.ts`):** `optionalSupabaseAuth` allows guest/public reads (e.g., Feed, Discovery) but elevates permissions to the caller's RLS if a session exists.

### 2.3 Protected Server-Action Tier (T2)

Server actions live in `src/lib/*-actions.ts`.

- **Middleware composition:** Real, RLS-scoped server actions (`createServerFn`) compose two middlewares:
  1. `attachSupabaseToken` (client side, from `auth-client-middleware.ts`) attaches `Authorization: Bearer <token>` to the request.
  2. `requireSupabaseAuth` (server side, from `auth-middleware.ts`) validates it.
- **Client Bundle Protection:** Never put server-action files under any `**/server/**` path. The `src/start.ts` client protection plugin blocks `**/server/**` imports from reaching client bundles.
- **Thin Handlers Pattern:** Keep server actions exceptionally thin. Validation, mapping, and logic should reside in **pure, repository-injected modules** (e.g., `cabana-account.ts`, `cabana-relationships.ts`) which can be fully unit-tested without DB connections or browser APIs. Server actions simply wire those modules to actual Supabase client queries or RPCs.

### 2.4 Pure Business Layer & Test Coverage (The "Pure" Set)

- **Pure Modules:** `cabana-money`, `cabana-entitlements`, `cabana-account`, `cabana-relationships`, `cabana-posts`, `cabana-engagement`, `cabana-subscriptions`, `cabana-messaging`, `cabana-notifications`, `cabana-moderation`, `cabana-finance`, `cabana-payouts`, `cabana-notification-engine`, `cabana-discovery`, `cabana-dashboard`, `cabana-creator-analytics`, `cabana-redirect`, `cabana-stream`, `cabana-stream-upload`, `cabana-admin-creators`, `cabana-creator-pages`, `cabana-admin-roles`, `cabana-creator-page-view`, `cabana-admin-creator-page-detail`, `cabana-admin-creator-editor`, `cabana-composer-media`. **`vitest.config.ts` `coverage.include` is the authoritative list** — keep new domain logic in a pure, repository-injected module so it joins this set.
- **Test Setup:** Unit tests use **vitest** with configurations in `vitest.config.ts`.
- **95% Coverage Gate:** These pure files are subject to a strict **95% coverage** threshold (lines/functions/branches/statements). Maintain new domain logic strictly within these pure modules to ensure ease of testing.

### 2.5 Data Layer, Monetization, and Ledger Restrictions

- **Integer Cents:** All pricing and financial data are represented as integer cents (e.g., `$10.00` is `1000`).
- **Demo Mode labeling:** Ensure all payout, subscription, and financial features denote **Demo Mode** or **Mock/Simulation** to prevent confusion with production gateways. Do not integrate real Stripe, billing, or KYC elements.
- **Append-Only Ledger:** The `transactions` table is strictly append-only and immutable. Historical entries cannot be modified. Reversals or failures must be written as separate `refund` transaction records.
- **Notifications & Triggers:** In-app events are emitted at the database level. SECURITY DEFINER triggers `emit_notification` are invoked after write operations (e.g., on follows, comments, tips, etc.) to record event details in `activity_events` and `notifications`.
- **Admin creator-page management (Phase 2A, live in production July 15, 2026; cloud through `20260540`):** admin writes to `creator_profiles`/`links` go through **audited SECURITY DEFINER RPCs** gated internally on `is_current_user_admin()` (never an email, Auth metadata, or client flag); each admin server action also asserts admin app-side (`assertAdmin`), with RLS as the final boundary. Moderator audit visibility is restricted to operational report rows (finance/ownership/role/creator-page audit is admin-only); direct `user_roles` DML is revoked (role changes flow through `admin_grant/remove_user_role`); there is **one creator page per non-null owner**; owners cannot alter `page_status`/`user_id` and links cannot be reparented. Page visibility is `page_status` (`draft`/`published`/`archived`) with anon seeing published only. Invite/claim is **not** implemented yet.

---

## 3. Development Workflow & Commands

Ensure `bun` is available on the path (if not, run `export PATH="$HOME/.bun/bin:$PATH"`).

### 3.1 Common Script Targets

- `bun run dev` — Starts the Vite development server (re-generates router tree automatically).
- `bun run build` — Builds the production client and SSR code.
- `bun run lint` — Performs ESLint checks (runs Prettier formatting rules as ESLint rules).
- `bun run format` — Runs `prettier --write .` to fix formatting and lint issues automatically.
- `bunx tsc --noEmit` — Run TypeScript compiler type-checks.
- `bun run test` — Executes Vitest once (unit tests for the pure business layer).
- `bun run test:watch` — Executes Vitest in watch mode.
- `bun run test:coverage` — Runs Vitest and generates code coverage (enforcing 95% threshold).
- `bun run db:reset` — Rebuilds local Supabase database from migrations and seed data.
- `bun run db:validate` — Runs the `scripts/db-validate.sh` command. This completely rebuilds a fresh local Supabase DB and runs smoke checks (requires Docker).

### 3.2 Pre-Handoff Gates

Before wrapping up any development block, ensure that:

1. `bun run lint` passes (minor Fast Refresh warnings in auto-generated/shadcn files are tolerated).
2. `bunx tsc --noEmit` is clean of errors.
3. `bun run build` succeeds.
4. `bun run test` succeeds with all unit tests passing and meeting coverage thresholds.

---

## 4. Design & Aesthetic Guidelines

CABANA features a bespoke **luxury dark, glass, chrome, and iridescent aesthetic**. Keep styling consistent using the Tailwind CSS 4 utility framework and established classes.

- **Primary Custom Classes:**
  - `glass-strong` — Strong frosted glass background effect.
  - `btn-luxury` — Gold/silver chrome gradient borders and polished metallic transitions.
  - `btn-ghost` — Subtle hover effects for less prominent actions.
  - `bg-iridescent` / `text-iridescent` — Polished metallic shimmer styling.
  - `shadow-luxury` — Soft, premium glow-style shadowing.
  - `animate-float` — Smooth hovering animation for visual elements.
- **Custom CSS File:** Located at `src/styles.css`. Ad-hoc styling should be avoided; compose using these system classes and design tokens.
- **Component Placement:**
  - Standard shadcn primitives: `src/components/ui/`
  - CABANA feature-specific components: `src/components/cabana/` (organized by feature like `dashboard/`, `auth/`, `subscriptions/`, `messaging/`, etc.)

---

## 5. End of Session Hand-off Process

At the completion of a workspace session, compile an updated hand-off record in `docs/CLAUDE_SESSION_HANDOFF.md`. The update must detail:

1. What files were added, modified, or deleted.
2. What routes and visual components were introduced or updated.
3. Whether the local Supabase schema, RLS policies, or seed data was modified.
4. Verification outcomes of `bun run lint`, `bun run build`, `bunx tsc --noEmit`, and `bun run test`.
5. The next logical, structured feature target or task phase.
