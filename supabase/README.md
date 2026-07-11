# CABANA — Supabase

Local database, migrations, and the from-zero rebuild proof.

## Layout

```
supabase/
├── config.toml                 # LOCAL stack config (ports, db version, seed, auth) — local-tooling only
├── migrations/                 # 22 ordered migrations, 20260511 → 20260532; rebuild from zero
├── seed.sql                    # demo data (aurora + demo member/reports/payouts) applied by `db reset`
├── tests/                      # 19 SQL behavioral suites (run by db:validate + CI)
├── reconcile/                  # one-time July-2026 cloud reconciliation scripts (history, not the chain)
└── _archive/
    └── pre_baseline_migrations/  # the 4 original pre-squash incrementals (reference only)
```

The canonical backend is the **cloud project `rpzaeqoqcaxxavltgvpe` ("cabanadatabase")**, current
through `20260532`. `config.toml`'s `project_id` still names the retired `dwnricswfskypqqfknnh` — that
is **local-tooling-only and deliberately untouched**; do not "fix" it or `supabase link` casually.

## Requirements

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A running **Docker** daemon (the local stack runs in containers)
- `psql` (for the smoke checks; optional — `db reset` alone proves the rebuild)

## Commands

```bash
# Rebuild a fresh local database from zero (applies all 22 migrations + seed)
bun run db:reset            # = supabase db reset

# Full validation: preflight → reset from zero → 19 SQL behavioral suites
bun run db:validate
```

`bun run db:validate` exits non-zero with a clear message if the Supabase CLI or
Docker is unavailable — it never reports a pass it did not perform.

## Migrations

`migrations/` holds 22 ordered migrations that rebuild the full schema from zero (validated locally by
`db:reset`/`db:validate` and in CI's from-zero Docker job). `20260511000000_baseline.sql` is a squashed
reconstruction of the early schema (tables, `app_role` enum, `handle_new_user`/`has_role`/handle-
validation functions + triggers, RLS policies, the three public storage buckets, reserved handles, and
SECURITY DEFINER revokes); everything from Phase 3 onward is an additive migration with its own RLS +
GRANTs + behavioral test.

## ⚠️ Applying SQL to cloud — never `db push`

> **OBSOLETE — DO NOT FOLLOW the old "reconcile with remote" runbook (`supabase link` +
> `supabase migration repair --status applied …` + `db push`).** That predated the July-2026 cloud
> reconcile. The cloud `supabase_migrations` ledger now holds reconcile-era versions that do **not**
> match this repo's `202605xx` numbering, so **`supabase db push` would attempt to re-apply
> already-applied DDL** and `migration repair` would corrupt the ledger.

Per CLAUDE.md: **never run `supabase db push` against cloud.** Apply cloud SQL via the **Management-API
pattern** only (read-only preflight → local `db:validate` from zero → transaction-wrapped apply →
post-verify → `smoke:prod`), and only with explicit approval. Reconciling the cloud migration ledger to
this repo's versions is a dedicated, gated task (backlog item 1) — not part of any routine workflow.
