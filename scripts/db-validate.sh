#!/usr/bin/env bash
# ============================================================================
# CABANA — database baseline validation
# ----------------------------------------------------------------------------
# Proves the baseline migration + seed rebuild a fresh Supabase instance from
# zero, then runs schema/seed smoke checks.
#
# Requirements: the Supabase CLI and a running Docker daemon (the local
# Supabase stack runs in containers). On hosts without Docker (e.g. this
# sandbox) the script exits non-zero with a clear, actionable message — it
# never reports a pass it did not actually perform.
#
# Usage: bun run db:validate   (or)   bash scripts/db-validate.sh
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

fail() { echo "✗ db:validate blocked — $1" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
command -v supabase >/dev/null 2>&1 || fail "the Supabase CLI is not installed (https://supabase.com/docs/guides/cli)."

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker is not installed. The local Supabase stack runs in Docker. Install Docker Desktop / Engine and re-run. (This is the documented sandbox blocker; CI runs this on a Docker-enabled runner.)"
fi
if ! docker info >/dev/null 2>&1; then
  fail "the Docker daemon is not running. Start Docker and re-run."
fi

# --- rebuild from zero -------------------------------------------------------
echo "▸ Resetting local Supabase from zero (baseline migration + seed)…"
supabase db reset

# --- smoke checks ------------------------------------------------------------
if command -v psql >/dev/null 2>&1; then
  echo "▸ Running schema/seed smoke checks…"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
  echo "▸ Running Phase 2B behavioral checks (trigger branching + member RLS)…"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/member_accounts.sql
  echo "▸ Running Phase 2C behavioral checks (follows + blocks + safe views)…"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/social_relationships.sql
  echo "▸ Running Phase 3 behavioral checks (posts + feed RPCs + media privacy)…"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/posts_feed.sql
  echo "▸ Running Phase 3.2 behavioral checks (comments + likes + saves)…"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/engagement.sql
  echo "▸ Running Phase 4 behavioral checks (creator subscriptions + entitlement)…"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/creator_subscriptions.sql
  echo "▸ Running Phase 5 behavioral checks (messaging + RLS + unread)…"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/messaging.sql
  echo "✓ db:validate passed — fresh rebuild + smoke + behavioral checks succeeded."
else
  echo "⚠ psql not found — 'supabase db reset' succeeded (migration + seed applied cleanly),"
  echo "  but object-level smoke assertions were skipped. Install psql to run them."
  echo "✓ db:validate passed (reset only)."
fi
