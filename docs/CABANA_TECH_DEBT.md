# CABANA Technical Debt Register

> Current shortcuts, demo implementations, and the security/performance/refactor work needed to reach production. Each item carries severity and the phase that should resolve it (see [`CABANA_BUILD_PHASES.md`](./CABANA_BUILD_PHASES.md)).
>
> Severity: 🔴 blocker for production · 🟠 important · 🟡 cleanup. Plan only.

---

## 1. Migration Baseline (🔴 — the prerequisite debt)

**🟡 Validated from-zero (Docker + CI) — only remote byte-exact reconciliation remains.** A squashed, rebuildable-from-zero baseline (`supabase/migrations/20260511000000_baseline.sql`) reconstructs the full schema — base tables, RLS, storage buckets, the signup trigger, and all functions — and the four incomplete incrementals are archived under `supabase/_archive/pre_baseline_migrations/`. The signup trigger and base RLS are now **in the repo** and auditable.

Verified June 25, 2026: `bun run db:validate` rebuilt from zero on a real Docker daemon and the smoke assertions passed; **GitHub Actions** run `28170007528` repeats the from-zero rebuild + smoke on a clean runner (green).

Remaining (the reason this is 🟡 not ✅):

- The baseline was **reconstructed**, not dumped from the live DB. Diff against a real `supabase db dump` before treating it as byte-exact. **Auth-blocked so far** — no Supabase access token / DB password in the dev env.
- Reconcile remote migration history: `supabase migration repair --status applied 20260511000000` (mutates remote — run deliberately).
- Confirm Postgres `major_version` (config.toml = 15) against the remote.

## 2. Repository / Process Debt

| Item                                         | Sev | Notes                                                                                                                   | Phase   |
| -------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| **No Git metadata** in workspace             | 🟠  | No history/diff/provenance; `bun run format` once rewrote ~1,069 files, so "recently modified" ≠ "behaviorally changed" | P1      |
| **No test runner**                           | 🟠  | Vitest/Jest not configured though spec requires money/entitlement/RLS tests                                             | P1      |
| ~~No CI~~                                    | ✅  | Done in P2A — `.github/workflows/ci.yml` runs lint/typecheck/test/build + a Docker `db-validate` job                    | P2A     |
| Stale `/docs/data-model`                     | 🟡  | Describes tables/fields that don't match generated types                                                                | P1      |
| Lovable-generated files marked "do not edit" | 🟡  | `client.ts`, `client.server.ts`, `auth-middleware.ts`, `types.ts` are generated; coordinate regeneration                | ongoing |

## 3. Current Shortcuts (behavioral)

| Shortcut                                                                                          | Sev | Where                                                                | Phase         |
| ------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------- | ------------- |
| Auth/route protection is **client-side only**                                                     | 🔴  | `dashboard.tsx`, `admin.tsx` — no server loaders                     | P2/P7         |
| ~~Every signup becomes a **creator**; no member role~~ ✅ P2B                                     | ✅  | `account_type` enum + branched `handle_new_user` + `member_profiles` | P2B           |
| `?redirect=` consumed directly (open-redirect risk)                                               | 🟠  | `dashboard.tsx`                                                      | P2            |
| Follow state is local `useState`, resets on refresh                                               | 🟠  | `$username.tsx`                                                      | P2            |
| Saved `theme` stored but **not applied** to public page                                           | 🟡  | `$username.tsx` / `cabana-store.ts` mapping                          | P1            |
| Sidebar shows hardcoded "Pro" plan regardless of `profile.plan`                                   | 🟡  | `Sidebar.tsx`                                                        | P1            |
| Onboarding data mostly not persisted; theme IDs mismatch `CabanaTheme`                            | 🟡  | `onboarding.tsx`                                                     | P1            |
| Onboarding reachable before auth → dashboard redirects to login                                   | 🟡  | `onboarding.tsx`                                                     | P1            |
| Non-atomic link reorder (N independent updates)                                                   | 🟡  | `useCabanaMutations.setLinks`                                        | P1            |
| Mutations write on **every input change**; no debounce                                            | 🟡  | `ProfileEditor`, inline editors                                      | P1            |
| No delete confirmation / URL validation                                                           | 🟡  | `LinkManager`, `StoreManager`                                        | P1            |
| Dead buttons & `#` links (CTAs, footer, message/product, pricing, AI, media-kit, settings, admin) | 🟡  | marketing + dashboard demos                                          | P1            |
| `$username` shadows unknown top-level slugs (wrong 404)                                           | 🟡  | route precedence                                                     | P5(routes)/P1 |

## 4. Demo Implementations (must be replaced, not extended)

| Surface                                    | Demo nature                                                             | Replace in                  |
| ------------------------------------------ | ----------------------------------------------------------------------- | --------------------------- |
| `cabana-demo-data.ts` (`CABANA_DEMO_DATA`) | Deterministic generators; `mock_` provider refs; fixed clock 2026-06-25 | P2–P6 (per domain)          |
| 9 `FoundationPage` routes                  | Coming-soon placeholders                                                | P1 (demo UI) → P2–P9 (real) |
| AI Studio / AI marketing                   | Simulated generation, hardcoded samples, timers                         | Long-term                   |
| Media kit                                  | Hardcoded Aurora metrics; export buttons dead                           | Long-term                   |
| Settings integrations                      | Hardcoded Stripe/Mailchimp/Shopify/Calendly/social; actions dead        | Long-term                   |
| Admin (8 panels)                           | Hardcoded arrays; every action non-functional                           | P7–P8                       |
| `/td`, `/eldondolla`                       | Bespoke static profiles bypassing the data model                        | optional (microsites)       |
| Pricing                                    | 4 plans, no checkout; landing teaser shows 3 (inconsistent)             | P3/P6                       |
| Mock money                                 | Integer-cents demo transactions/balances                                | keep demo until P6 real     |

**Demo discipline:** demo monetary state can be mistaken for real if labeling is inconsistent — every mock surface needs a visible "Demo" label and `mock_` references; succeeded mock transactions are immutable like real ones.

## 5. Data-Model Debt

| Item                                                                                | Sev | Phase                                   |
| ----------------------------------------------------------------------------------- | --- | --------------------------------------- |
| `subscriptions` name = CABANA SaaS plan, collides with future fan subs              | 🔴  | rename → `platform_subscriptions` in P3 |
| `creator_profiles.user_id` **nullable** (ownerless seeds)                           | 🟠  | constrain real accounts in P2           |
| Product `price` stored as **display string** (no math/checkout)                     | 🟠  | → `price_cents` + currency, P5          |
| Link `scheduled` stored as **text label**, not timestamp; no true scheduled publish | 🟡  | P1/P2                                   |
| No publish/visibility model on links/products                                       | 🟡  | P2                                      |
| Public profile fields not separated from owner-only fields                          | 🟠  | public-safe views, P2                   |
| `member_profiles` ✅ (P2B); settings / entitlements / ledger tables still missing   | 🟠  | settings/entitlements/ledger P2B+/P3–P6 |
| Money stored without explicit currency in legacy tables                             | 🟠  | P5                                      |

## 6. Security Improvements

| Item                                                                   | Sev                   | Detail                                                         | Phase    |
| ---------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- | -------- |
| Public creator read uses `select("*")` → **leaks `user_id`**           | 🔴                    | Replace with public-safe view omitting owner id                | P2       |
| Public storage URLs (`getPublicUrl`) unsuitable for paid/private media | 🔴                    | Private buckets + short-lived signed URLs gated by entitlement | P2/P4/P5 |
| Admin protection client-side; real admin data/actions ungated          | 🔴                    | Server-validated capability claims                             | P7       |
| Service-role client exists but discipline depends on import hygiene    | 🟠                    | Keep `client.server.ts` server-only; lint guard                | ongoing  |
| Anonymous analytics inserts spammable (RLS only checks profile exists) | 🟠                    | Rate-limit + tighten insert policy                             | P2/P10   |
| Upload validation mostly client-side; extensions trusted               | 🟠                    | Server-side MIME-signature/size/dimension checks; EXIF strip   | P2/P5    |
| No CSP observed (HSTS/referrer/nosniff present)                        | 🟠                    | Add Content-Security-Policy + headers                          | P10      |
| No MFA (admins), CAPTCHA, OAuth, email-verify branch                   | 🟠                    | Auth hardening                                                 | P7/P10   |
| `?redirect=` not allow-listed                                          | 🟠                    | Safe-redirect allow-list                                       | P2       |
| No webhook signature verification / idempotency yet                    | 🔴 (when money lands) | `webhook_events` + signatures                                  | P6       |
| Provider tokens / verification fields unencrypted (none yet)           | 🟠                    | Encrypt at rest when introduced                                | P6/P10   |

## 7. Performance Improvements

| Item                                                            | Sev | Detail                                                                            | Phase       |
| --------------------------------------------------------------- | --- | --------------------------------------------------------------------------------- | ----------- |
| Missing FK/RLS indexes on future tables                         | 🟠  | Index every FK + RLS-filter column; composite (creator_id, published_at, id) etc. | P2+         |
| No cursor pagination (feeds/messages/notifications)             | 🟠  | `(created_at, id)` cursors, not deep offsets                                      | P2/P4/P9    |
| No partial indexes for unread/pending/active/undeleted          | 🟡  | unread notifications, pending payouts, open reports                               | P2/P6/P8/P9 |
| Build warns: shared chunks > 500 kB                             | 🟡  | Code-split heavy routes; lazy-load admin/marketing                                | P1/P10      |
| `QueryClient` per router instance; no global stale/retry policy | 🟡  | Tune defaults; consider hydration policy                                          | P1          |
| Mutations lack optimistic updates / transactional rollback      | 🟡  | Add where UX benefits                                                             | P1/P3       |
| No web-font import found (relies on local fonts)                | 🟡  | Verify/host Space Grotesk + Inter                                                 | P1/P10      |
| `pg_stat_statements` not enabled/monitored                      | 🟡  | Enable + monitor                                                                  | P2/P10      |
| Don't hold DB locks across external API calls (future money)    | 🔴  | Keep payment txns short; external calls outside DB txn                            | P6          |

## 8. Refactoring Opportunities

| Opportunity                                                                                                 | Sev | Detail                                                               | Phase     |
| ----------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------- | --------- |
| No typed `Button`; utility classes only                                                                     | 🟡  | Introduce typed CABANA button (keep `.btn-luxury`/`.btn-ghost` look) | P1        |
| Each screen hand-rolls modals/drawers; Radix primitives unused                                              | 🟡  | Shared `Modal`/`Dialog`/`Sheet` wrappers from `components/ui`        | P1/P4     |
| No shared form abstraction beyond `AuthField`; RHF+Zod installed, unused                                    | 🟡  | Adopt RHF+Zod + shared schemas (client+server)                       | P1/P2     |
| `/td`, `/eldondolla`, `$username` duplicate profile concepts                                                | 🟡  | Shared profile renderer with variants/templates                      | optional  |
| `cabana-store.ts` uses `any` casts on Supabase updates                                                      | 🟡  | Tighten with generated `TablesUpdate<>` types                        | P2        |
| Components organized by page, not business boundary                                                         | 🟡  | Move to `components/cabana/{posts,members,messaging,...}`            | P1–P2     |
| Server-action plumbing exists but unused (`auth-middleware`, `client.server`, `auth-attacher` unregistered) | 🟠  | Wire up T2 tier; register `auth-attacher` in `start.ts`              | P2        |
| No shared `EmptyState`/`LoadingState`/`ErrorState`/`Money`                                                  | 🟡  | Extract; mutations need consistent loading/error/empty UX            | P1        |
| Marketing content is module-level constants in components                                                   | 🟡  | Acceptable for now; revisit if CMS-driven                            | Long-term |

## 9. Testing Debt (🟠)

None today. Needed: unit (mappers, validation, **money**, **entitlements**) · RLS policy tests per role (guest/member/creator/moderator/admin) · integration (auth, profile CRUD, uploads, analytics) · E2E (signup → publish) · payment/webhook/idempotency · accessibility + responsive visual regression · load (feeds/messages/notifications/analytics). Stand up the runner in **P1**; expand each phase.

## 10. Deployment & Ops Debt (🟠)

Git history · documented staging/prod envs · CI gates · preview-deploy policy · secrets rotation/ownership · DB backups + PITR + DR runbook · monitoring/error-tracking/uptime/alerting · payment reconciliation + RLS-failure + webhook-failure + queue-lag alerts. Begin in **P2**, complete in **P10**.

---

## Top 7 to Burn Down First (impact × risk)

1. 🔴 Validated **baseline migration** (P2) — unblocks all backend work.
2. 🔴 **Member role** + server-side auth/route gating (P2) — unblocks the whole member product and closes the biggest auth gap.
3. 🔴 **Public-safe views** (stop leaking `user_id`) + **private media buckets** (P2).
4. 🔴 Rename **`subscriptions` → `platform_subscriptions`** before fan subs (P3).
5. 🟠 **Test runner + CI** (P1/P2) — every later phase's acceptance depends on it.
6. 🟠 Wire the **T2 server-action tier** (P2) — required for money/entitlements/admin.
7. 🟡 **Phase-1 hardening** (theme apply, banner, plan label, dead links, atomic reorder) — cheap wins that make the OS production-credible.
