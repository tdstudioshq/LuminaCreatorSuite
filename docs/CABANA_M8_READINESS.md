# CABANA — M8 (Real-Money) Readiness

> **Opened July 11, 2026 (backlog item 20). Status: GATE NOT MET — money is demo-only and must stay
> demo-only until every criterion below is signed off AND Tyler gives explicit authorization.**
>
> "M8" is the shorthand used across `CABANA_TECH_DEBT.md` for the real-money launch. It had no single
> definition; this doc consolidates the existing **"Phase 7 — Payments & Payouts (Real Money)"**
> definition ([`CABANA_BUILD_PHASES.md`](./CABANA_BUILD_PHASES.md)) plus the scattered M8-gated tech-debt
> rows into one checklist. Naming/scope is ratified in the Product Boundary Decision Record D5
> ([`CABANA_PRODUCT_SPEC.md` §0](./CABANA_PRODUCT_SPEC.md)).

## The gate holds today (verified July 11, 2026, backlog item 20)

Real-money discipline is intact in code — do not regress any of these:

- **No payment SDK** anywhere (`grep -i 'stripe|paypal|braintree' package.json bun.lock pnpm-lock.yaml` → none).
- **`mock_*` refs enforced** in every money-writing RPC (`subscribe_to_creator` `mock_sub_`,
  `create_mock_purchase` `mock_txn_`, `create_mock_tip`, `request_payout` `mock_preq_`/`mock_payout_`).
- **Demo pills** on every money surface (earnings, finance shell, subscribe panel, locked-content gate,
  admin hub) with honest "no real charge" copy.
- **App layer calls only the mock RPCs** — no checkout code, no direct ledger writes; all money RPCs are
  authenticated-only, anon revoked.
- **Ledger is append-only** (immutability trigger; refunds are new `refund` rows, never mutations).
- Settings honestly gate Stripe behind "After payments launch".

**Latent artifacts to dispose of at M8** (not gate violations, but track them): dormant
`subscriptions.stripe_customer_id` / `stripe_subscription_id` columns (baseline, no reader); a phantom
`stripe_price_id` documented on `/docs/data-model` that exists in **no** migration; `products.price` is
still a display **string** (must become `price_cents` + currency).

## Readiness criteria — every box must be checked + signed off before real money

Each criterion has an objectively checkable test. Ordering roughly follows dependency.

- [ ] **R1 — Processor + hosted checkout.** Provider selected; **card data never touches CABANA**
  (provider-hosted collection only). _Check:_ checkout flow uses provider-hosted pages; no PAN/CVV field
  in any CABANA form.
- [ ] **R2 — Webhooks are the source of truth.** `webhook_events` table with **signature verification**
  + **idempotency keys**; processed via an outbox/`outbox_jobs` worker. _Check:_ a replayed webhook is a
  no-op; an unsigned/forged webhook is rejected; the ledger only moves on a verified webhook.
- [ ] **R3 — KYC / verification gating.** `creator_verifications` + a `monetization_status` gate so a
  creator cannot receive real money until verified. _Check:_ an unverified creator's payout/monetization
  path is blocked server-side.
- [ ] **R4 — Payouts + reconciliation.** Real payout-provider integration; a reconciliation job proving
  the internal ledger balances against provider statements; failure/grace/cancel/refund/dispute/chargeback
  all handled. _Check:_ reconciliation job reports zero drift on a seeded provider statement; the
  approve-vs-mark-paid split (authorize vs settle) stays distinct.
- [ ] **R5 — `products.price` → `price_cents` + currency** (tech-debt item 5) migration applied; posts
  already use `price_cents`. _Check:_ no display-string prices remain in money math; dormant `stripe_*`
  columns + the phantom `stripe_price_id` doc entry are dispositioned (kept-for-use or dropped).
- [ ] **R6 — Ops readiness** (tech-debt item 6 / backlog item 16): monitoring / error-tracking /
  alerting (incl. payment-reconciliation, webhook-failure, and queue-lag alerts), DB backups + PITR +
  DR runbook, and a documented staging environment. _Check:_ a test alert fires; a restore is rehearsed;
  RUNBOOK exists.
- [ ] **R7 — No DB locks across external calls.** Payment transactions stay short; external provider
  calls happen **outside** any DB transaction (tech-debt item 7 / §7). _Check:_ code review + a test
  proving no external call runs inside a DB txn.
- [ ] **R8 — Legal / compliance.** ToS, refund policy, tax handling; the 10%+3% demo fee model
  (`cabana-money.ts`) confirmed as the contractual model (or replaced). _Check:_ legal sign-off recorded.
- [ ] **R9 — Test coverage.** Payment / webhook / idempotency suites pass; the demo-only regression
  guards (no-SDK grep, `mock_` refs, demo pills) are converted or retired deliberately at kickoff.

## Preconditions (from `CABANA_BUILD_PHASES.md` Phase 7)

- [ ] **P-A — Phase 4 & 6 mock behavior accepted** (mock ledger / entitlement / refund behavior proven).
- [ ] **P-B — Explicit authorization to begin** recorded (real-money work must not start without it).

## Optional hard guardrail (recommended)

Add a CI step that **fails the build if a payment-provider SDK appears in `package.json`**, removable
only by the M8-kickoff commit — so the demo-only gate cannot regress silently before P-B is signed.

---

**Authorization to begin M8:** _(Tyler — date + initials; only valid once R1–R9 and P-A/P-B are checked)_
____________________
