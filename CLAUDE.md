# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CABANA is a premium creator OS / link-in-bio / storefront app being evolved into a creator subscription platform. The product name in code and UI is **CABANA** (the repo folder is `LuminaCreatorSuite`). It runs on TanStack Start (SSR) + React 19 + Vite 7 + Tailwind CSS 4, deployed to Cloudflare Workers, with Supabase for auth, data, and storage.

The source-of-truth planning docs are `CABANA_ARCHITECTURE.md`, `docs/CABANA_BUILD_ROADMAP.md`, and `docs/CLAUDE_SESSION_HANDOFF.md`. Read the handoff before starting new work — it tracks phase state and the next recommended task. **End every session by producing an updated handoff** (files changed, routes/components built, whether Supabase schema/data was touched, demo vs. production behavior, and lint/build/tsc results).

## Commands

This project uses **Bun**. If `bun` is not on PATH, prefix with `export PATH="$HOME/.bun/bin:$PATH"`.

```bash
bun run dev            # Vite dev server
bun run build          # Production client + SSR build
bun run lint           # ESLint (Prettier runs as a lint rule — formatting issues are lint errors)
bun run format         # prettier --write . (fixes the formatting lint errors)
bunx tsc --noEmit      # Typecheck (tsconfig has noEmit; this is the only type check)
```

There is **no test runner configured yet** (the roadmap calls for adding unit tests for money/entitlement helpers). Before any handoff, the required gate is: `bun run lint`, `bun run build`, and `bunx tsc --noEmit` all pass. ESLint retains some pre-existing react-refresh Fast Refresh warnings in shadcn UI files; those are expected.

## Architecture

### Routing & SSR
- File-based **TanStack Router** under `src/routes/`. Flat dot-notation files map to nested paths (`dashboard.posts.tsx` → `/dashboard/posts`). `$username.tsx` is the public creator page at `/$username`.
- **`src/routeTree.gen.ts` is generated — never edit it manually.** It regenerates on dev/build.
- `src/router.tsx` builds the router and injects a React Query `QueryClient` into router context.
- SSR entry is `src/server.ts` (not the bundled TanStack default — `vite.config.ts` redirects `tanstackStart.server.entry` to it, and `wrangler.jsonc` points `main` there). It wraps the handler to catch both thrown errors and h3-swallowed catastrophic 500s, returning a branded error page.
- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which **already bundles** tanstackStart, viteReact, tailwindcss, tsConfigPaths, the Cloudflare plugin, the `@` alias, and VITE_* env injection. Do not re-add those plugins or the app breaks with duplicates.

### Supabase layer (`src/integrations/supabase/`)
Three distinct clients — pick by trust boundary:
- **`client.ts`** → `supabase`: browser/anon client (publishable key), used by all React Query hooks. RLS-enforced. Lazily instantiated via a Proxy.
- **`client.server.ts`** → `supabaseAdmin`: **service-role key, bypasses RLS.** Server-only; never import into client code.
- **`auth-middleware.ts`** → `requireSupabaseAuth`: TanStack `createMiddleware` that validates the `Authorization: Bearer` token for server functions and yields a per-request RLS-scoped client + `userId`.

`client.ts`, `client.server.ts`, `auth-middleware.ts`, and `types.ts` are marked auto-generated (Lovable Cloud) — avoid hand-editing.

### Data access (`src/lib/cabana-store.ts`)
The live data layer. Tables: `creator_profiles`, `links`, `products`, plus `user_roles` and `reserved_handles`. Pattern:
- **Public reads:** `useCreatorByHandle(handle)` — used by the public profile page.
- **Owner reads:** `useCabana()` — current user's profile/links/products.
- **Owner writes:** `useCabanaMutations()` — profile/link/product CRUD + storage uploads, each wrapped with toast error handling and React Query invalidation of `["my-creator"]` / `["creator-by-handle"]`.
- Storage buckets `avatars`, `banners`, `products` are folder-scoped by `user_id` (RLS: `auth.uid() = foldername(name)[1]`).

### Auth & roles
- `src/lib/cabana-auth.ts`: `cabanaAuth` (signup/login/logout/password reset) + `useAuthSession()` / `useCabanaUser()` hooks built on `supabase.auth.onAuthStateChange`.
- Route protection is **client-side**: `dashboard.tsx` redirects to `/login?redirect=...` when no session. There is no server route guard.
- `src/lib/cabana-roles.ts`: `useHasRole("admin"|"moderator"|"user")` reads `user_roles`, resolving from the cached session (no `getUser()` round-trip). Used to gate `/admin`.

### Components
- `src/components/ui/` — shadcn/ui (new-york style, ~46 primitives). Don't reinvent; compose these.
- `src/components/cabana/` — app feature components: `dashboard/` (DashHome, LinkManager, StoreManager, AnalyticsPage, AIStudio, MediaKit, ProfileEditor, SettingsPanel, Sidebar), `auth/AuthShell`, `foundation/FoundationPage`.
- `FoundationPage` is the shared "demo foundation / coming soon" presentation for not-yet-built subscription-platform screens. New placeholder routes (posts, subscribers, messages, earnings, notifications, feed, discover) render through it.

### Design system
Luxury dark / glass / chrome / iridescent aesthetic. Global styles and utility classes (`glass-strong`, `btn-luxury`, `btn-ghost`, `bg-iridescent`, `text-iridescent`, `shadow-luxury`, `animate-float`) live in `src/styles.css`. Tailwind v4 (CSS-config, no `tailwind.config`). Use these classes rather than introducing ad-hoc styling.

## Subscription-platform conventions (in-progress work)

The platform-evolution feature set (posts, follows, fan subscriptions, messages, tips, payouts) currently exists only as **frontend demo contracts**, not live tables:
- `src/lib/cabana-types.ts` — domain types (MemberProfile, CreatorPost, CreatorSubscription, Tip, Transaction, Payout, etc.) designed to map to future Supabase tables.
- `src/lib/cabana-demo-data.ts` — deterministic mock generators. Fixed demo clock is **June 25, 2026**; mock provider refs use a `mock_` prefix.

Hard constraints when working here:
- Do **not** treat mock transactions as real money; label all monetization as demo-only. Use **integer cents** for mock money.
- Do **not** add Stripe/payments, real payouts, KYC, or adult-content functionality.
- Do **not** put private member/message data on public routes (`/feed`, `/discover`, `/messages`, `/notifications` are currently public placeholders).
- Do **not** create production tables, run new migrations, or rename the existing `subscriptions` table without an approved baseline-migration + RLS plan. Note: existing `subscriptions` = CABANA SaaS plans; fan-to-creator subscriptions must use `creator_subscriptions`.
- Keep domain logic Supabase-ready with RLS-ready ownership models; keep changes small and reviewable.

## Environment

`.env` provides `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (server) and `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` (client, Vite-injected). `SUPABASE_SERVICE_ROLE_KEY` is required for `supabaseAdmin` and must never reach the client. Supabase migrations live in `supabase/migrations/`.
