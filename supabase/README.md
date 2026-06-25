# CABANA — Supabase

Local database, migrations, and the from-zero rebuild proof.

## Layout

```
supabase/
├── config.toml                 # local stack config (ports, db version, seed, auth)
├── migrations/
│   └── 20260511000000_baseline.sql   # squashed, rebuildable-from-zero baseline
├── seed.sql                    # demo data (aurora) applied by `db reset`
├── tests/
│   └── smoke.sql               # post-reset schema/seed assertions
└── _archive/
    └── pre_baseline_migrations/  # the 4 original incremental migrations (reference only)
```

## Requirements

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A running **Docker** daemon (the local stack runs in containers)
- `psql` (for the smoke checks; optional — `db reset` alone proves the rebuild)

## Commands

```bash
# Rebuild a fresh local database from zero (applies baseline migration + seed)
bun run db:reset            # = supabase db reset

# Full validation: preflight → reset from zero → schema/seed smoke checks
bun run db:validate
```

`bun run db:validate` exits non-zero with a clear message if the Supabase CLI or
Docker is unavailable — it never reports a pass it did not perform.

## The baseline

`migrations/20260511000000_baseline.sql` is a **squashed reconstruction** of the
complete current schema: tables, the `app_role` enum, functions
(`handle_new_user`, `has_role`, `validate_creator_handle`, `touch_updated_at`),
triggers (signup provisioning, `updated_at` touches, handle validation), all RLS
policies, the three public storage buckets with owner-scoped object policies,
reserved-handle data, and the SECURITY DEFINER revokes.

It was reconstructed from the four incremental migrations (now in
`_archive/pre_baseline_migrations/`), `src/integrations/supabase/types.ts`, and
`CABANA_ARCHITECTURE.md`, because the incremental set could **not** rebuild from
zero on its own (it `ALTER`ed tables whose `CREATE` statements lived only in the
remote project).

## Reconciling with the remote project

The remote project already has the four incremental migrations in its history.
Before pushing this baseline to remote, reconcile history so the squash is not
re-applied on top of existing objects:

```bash
supabase link --project-ref dwnricswfskypqqfknnh
# Verify the live schema matches the baseline (ideally diff a real dump):
supabase db dump --schema public,storage > /tmp/remote.sql   # requires DB access
# Mark the baseline as already-applied remotely instead of re-running it:
supabase migration repair --status applied 20260511000000
```

Do not `db push` the baseline to production without this step. See
`docs/CABANA_DATABASE.md` → "Baseline migration" for the full risk list.

## Scope (Phase 2A)

This baseline captures the **existing** schema only. It does **not** add
`member_profiles`, posts, messaging, notifications, payments, or
`creator_subscriptions`, and does **not** rename `subscriptions`. Those are
later build phases.
