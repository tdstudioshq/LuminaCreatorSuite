-- ============================================================================
-- CABANA — Phase 6: Monetization foundation / internal financial ledger
-- ============================================================================
-- The internal, double-entry-style financial ledger that a future real payment
-- processor (e.g. Stripe) would settle into. Purely additive.
--
-- DEMO ONLY — NO real money moves. There is NO payment processor, NO Stripe, NO
-- cards, NO webhooks, NO KYC, NO real payouts. Every financial event is created
-- by SECURITY DEFINER RPCs with integer-cent amounts and a `mock_*` provider
-- reference. The `transactions` table is an append-only, immutable ledger:
-- historical money is NEVER updated; reversals are new `refund` rows.
--
-- This migration also activates the `purchase` post-visibility tier (unsupported
-- since Phase 3) by wiring permanent `content_entitlements` into `can_view_post`,
-- the creator feed RPC, and the post-detail RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enums
-- ----------------------------------------------------------------------------
-- Mirrors the client `TransactionType` union in cabana-types.ts.
do $$ begin
  create type public.transaction_type as enum
    ('creator_subscription', 'product', 'post_unlock', 'paid_message', 'tip', 'refund', 'adjustment');
exception when duplicate_object then null; end $$;

-- Mirrors the client `Transaction.status` / `LedgerTransaction.status`.
do $$ begin
  create type public.transaction_status as enum
    ('pending', 'succeeded', 'failed', 'refunded', 'disputed');
exception when duplicate_object then null; end $$;

-- The disbursement state machine (mirrors client `Payout.status`).
do $$ begin
  create type public.payout_status as enum
    ('queued', 'processing', 'paid', 'failed', 'canceled');
exception when duplicate_object then null; end $$;

-- The creator-initiated request lifecycle.
do $$ begin
  create type public.payout_request_status as enum
    ('requested', 'approved', 'rejected', 'paid');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Purchase pricing on posts (activates the `purchase` visibility tier)
-- ----------------------------------------------------------------------------
alter table public.posts add column if not exists price_cents integer;
alter table public.posts add column if not exists currency text not null default 'USD';
do $$ begin
  alter table public.posts add constraint posts_price_cents_nonneg
    check (price_cents is null or price_cents >= 0);
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------
-- 2a. transactions — every financial event. Append-only / immutable. The
-- creator net is always exactly gross minus both fees (enforced by CHECK), so
-- the ledger always balances. Amounts are non-negative integer cents; the
-- `refund` TYPE carries the reversal semantics, not a negative amount.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  payer_user_id uuid references public.profiles (id) on delete set null,
  creator_profile_id uuid references public.creator_profiles (id) on delete set null,
  type public.transaction_type not null,
  status public.transaction_status not null default 'succeeded',
  gross_cents integer not null,
  platform_fee_cents integer not null default 0,
  processor_fee_cents integer not null default 0,
  creator_net_cents integer not null,
  currency text not null default 'USD',
  reference_type text,
  reference_id uuid,
  mock_provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_amounts_nonneg check (
    gross_cents >= 0 and platform_fee_cents >= 0
    and processor_fee_cents >= 0 and creator_net_cents >= 0
  ),
  constraint transactions_balances check (
    creator_net_cents = gross_cents - platform_fee_cents - processor_fee_cents
  ),
  constraint transactions_reference_type check (
    reference_type is null
    or reference_type in ('subscription', 'product', 'post', 'message', 'tip')
  )
);

create index if not exists transactions_creator_idx
  on public.transactions (creator_profile_id, created_at desc);
create index if not exists transactions_payer_idx
  on public.transactions (payer_user_id, created_at desc);

-- Append-only enforcement: historical money is never rewritten. DELETE is always
-- blocked. UPDATE is blocked when any monetary/identity field changes; the only
-- permitted update is a parent FK being nulled by ON DELETE SET NULL (so a
-- creator/account can be deleted while the immutable ledger row is retained).
create or replace function public.prevent_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'transactions are immutable (append-only ledger)'
      using errcode = 'check_violation';
  end if;
  if (
    new.type, new.status, new.gross_cents, new.platform_fee_cents, new.processor_fee_cents,
    new.creator_net_cents, new.currency, new.reference_type, new.reference_id,
    new.mock_provider_reference, new.created_at
  ) is distinct from (
    old.type, old.status, old.gross_cents, old.platform_fee_cents, old.processor_fee_cents,
    old.creator_net_cents, old.currency, old.reference_type, old.reference_id,
    old.mock_provider_reference, old.created_at
  ) then
    raise exception 'transactions are immutable (append-only ledger)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_immutable on public.transactions;
create trigger transactions_immutable
  before update or delete on public.transactions
  for each row execute function public.prevent_ledger_mutation();

-- 2b. creator_balances — cached projection of a creator's money position. Never
-- the source of truth: always recomputed from the ledger by recalc_creator_balance.
create table if not exists public.creator_balances (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  currency text not null default 'USD',
  pending_cents integer not null default 0,
  available_cents integer not null default 0,
  lifetime_gross_cents integer not null default 0,
  lifetime_fees_cents integer not null default 0,
  lifetime_net_cents integer not null default 0,
  lifetime_paid_out_cents integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint creator_balances_currency_unique unique (creator_profile_id, currency)
);

-- 2c. payout_requests — the creator-initiated request lifecycle (mock).
create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD',
  status public.payout_request_status not null default 'requested',
  note text,
  decided_at timestamptz,
  mock_provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_requests_note_len check (note is null or char_length(note) <= 500)
);

create index if not exists payout_requests_creator_idx
  on public.payout_requests (creator_profile_id, created_at desc);

drop trigger if exists touch_payout_requests_updated_at on public.payout_requests;
create trigger touch_payout_requests_updated_at
  before update on public.payout_requests
  for each row execute function public.touch_updated_at();

-- 2d. payouts — mock payout (disbursement) history. Reserves available balance
-- while queued/processing; counts as withdrawn once paid.
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  payout_request_id uuid references public.payout_requests (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD',
  status public.payout_status not null default 'processing',
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  failure_reason text,
  mock_provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payouts_creator_idx
  on public.payouts (creator_profile_id, created_at desc);

drop trigger if exists touch_payouts_updated_at on public.payouts;
create trigger touch_payouts_updated_at
  before update on public.payouts
  for each row execute function public.touch_updated_at();

-- 2e. tips — tip metadata, each backed by exactly one ledger transaction.
create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  sender_user_id uuid references public.profiles (id) on delete set null,
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD',
  message text,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  constraint tips_message_len check (message is null or char_length(message) <= 500),
  constraint tips_status check (status in ('pending', 'completed', 'refunded'))
);

create index if not exists tips_creator_idx on public.tips (creator_profile_id, created_at desc);
create index if not exists tips_sender_idx on public.tips (sender_user_id, created_at desc);

-- 2f. purchases — one-time content unlock purchases, each backed by a transaction.
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  buyer_user_id uuid not null references public.profiles (id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  constraint purchases_status check (status in ('pending', 'completed', 'refunded'))
);

create index if not exists purchases_buyer_idx on public.purchases (buyer_user_id, created_at desc);
create index if not exists purchases_creator_idx on public.purchases (creator_profile_id, created_at desc);

-- 2g. content_entitlements — permanent access records. Once granted (by a
-- purchase, or a future grant), access does not expire.
create table if not exists public.content_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  source text not null default 'purchase',
  purchase_id uuid references public.purchases (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint content_entitlements_unique unique (user_id, post_id),
  constraint content_entitlements_source check (source in ('purchase', 'subscription', 'grant'))
);

create index if not exists content_entitlements_user_idx on public.content_entitlements (user_id);
create index if not exists content_entitlements_post_idx on public.content_entitlements (post_id);

-- ----------------------------------------------------------------------------
-- 3. Entitlement helper
-- ----------------------------------------------------------------------------
-- True if `_user_id` holds a permanent entitlement to `_post_id`.
create or replace function public.has_content_entitlement(_user_id uuid, _post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.content_entitlements e
    where e.user_id = _user_id and e.post_id = _post_id
  )
$$;

-- Granted to anon as well as authenticated: the `posts` "Buyers can read
-- purchased posts" RLS policy references this function, and that policy is
-- evaluated for anonymous visitors browsing public posts too (mirrors how
-- `is_active_subscriber` is granted for the subscriber policy).
revoke execute on function public.has_content_entitlement(uuid, uuid) from public;
grant execute on function public.has_content_entitlement(uuid, uuid) to anon, authenticated;

-- Whether the current user is an admin. Wraps `has_role` (which is intentionally
-- NOT executable by `authenticated`) in a SECURITY DEFINER helper that takes no
-- arbitrary user id — so admin RLS policies can be evaluated by normal callers
-- without exposing role-enumeration. Mirrors the `is_current_user_creator` shape.
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role((select auth.uid()), 'admin')
$$;

revoke execute on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Balance recomputation (cached projection from the immutable ledger)
-- ----------------------------------------------------------------------------
-- Recompute and upsert a creator's cached balance. Mirrors the pure client
-- `deriveCreatorBalance` exactly:
--   pending   = sum(net) of pending non-refund inflows
--   net       = sum(succeeded non-refund net) - sum(succeeded refund net)
--   available = net - paid-out - reserved(queued|processing) payouts
create or replace function public.recalc_creator_balance(
  _creator_profile_id uuid,
  _currency text default 'USD'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer := 0;
  v_settled_net integer := 0;
  v_gross integer := 0;
  v_fees integer := 0;
  v_paid_out integer := 0;
  v_reserved integer := 0;
begin
  select
    coalesce(sum(case when t.status = 'pending' and t.type <> 'refund'
                      then t.creator_net_cents else 0 end), 0),
    coalesce(sum(case when t.status = 'succeeded' and t.type <> 'refund' then t.creator_net_cents
                      when t.status = 'succeeded' and t.type = 'refund' then -t.creator_net_cents
                      else 0 end), 0),
    coalesce(sum(case when t.status = 'succeeded' and t.type <> 'refund' then t.gross_cents
                      when t.status = 'succeeded' and t.type = 'refund' then -t.gross_cents
                      else 0 end), 0),
    coalesce(sum(case when t.status = 'succeeded' and t.type <> 'refund'
                      then t.platform_fee_cents + t.processor_fee_cents
                      when t.status = 'succeeded' and t.type = 'refund'
                      then -(t.platform_fee_cents + t.processor_fee_cents)
                      else 0 end), 0)
  into v_pending, v_settled_net, v_gross, v_fees
  from public.transactions t
  where t.creator_profile_id = _creator_profile_id and t.currency = _currency;

  select
    coalesce(sum(case when p.status = 'paid' then p.amount_cents else 0 end), 0),
    coalesce(sum(case when p.status in ('queued', 'processing') then p.amount_cents else 0 end), 0)
  into v_paid_out, v_reserved
  from public.payouts p
  where p.creator_profile_id = _creator_profile_id and p.currency = _currency;

  insert into public.creator_balances as b (
    creator_profile_id, currency, pending_cents, available_cents,
    lifetime_gross_cents, lifetime_fees_cents, lifetime_net_cents,
    lifetime_paid_out_cents, updated_at
  ) values (
    _creator_profile_id, _currency, v_pending, v_settled_net - v_paid_out - v_reserved,
    v_gross, v_fees, v_settled_net, v_paid_out, now()
  )
  on conflict (creator_profile_id, currency) do update set
    pending_cents = excluded.pending_cents,
    available_cents = excluded.available_cents,
    lifetime_gross_cents = excluded.lifetime_gross_cents,
    lifetime_fees_cents = excluded.lifetime_fees_cents,
    lifetime_net_cents = excluded.lifetime_net_cents,
    lifetime_paid_out_cents = excluded.lifetime_paid_out_cents,
    updated_at = now();
end;
$$;

revoke execute on function public.recalc_creator_balance(uuid, text) from public, anon;
grant execute on function public.recalc_creator_balance(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. RLS + base privileges
-- ----------------------------------------------------------------------------
alter table public.transactions enable row level security;
alter table public.creator_balances enable row level security;
alter table public.payout_requests enable row level security;
alter table public.payouts enable row level security;
alter table public.tips enable row level security;
alter table public.purchases enable row level security;
alter table public.content_entitlements enable row level security;

-- transactions: a creator reads transactions to their own profile; a payer reads
-- their own; admins read all. No client writes — only the SECURITY DEFINER RPCs.
create policy "Creators read own transactions"
  on public.transactions for select
  using (creator_profile_id is not null and (select public.is_current_user_creator(creator_profile_id)));
create policy "Payers read own transactions"
  on public.transactions for select
  using (payer_user_id = (select auth.uid()));
create policy "Admins read all transactions"
  on public.transactions for select
  using ((select public.is_current_user_admin()));

-- creator_balances: the owning creator (and admins) read; never written by clients.
create policy "Creators read own balance"
  on public.creator_balances for select
  using ((select public.is_current_user_creator(creator_profile_id)));
create policy "Admins read all balances"
  on public.creator_balances for select
  using ((select public.is_current_user_admin()));

-- payout_requests: the owning creator (and admins) read.
create policy "Creators read own payout requests"
  on public.payout_requests for select
  using ((select public.is_current_user_creator(creator_profile_id)));
create policy "Admins read all payout requests"
  on public.payout_requests for select
  using ((select public.is_current_user_admin()));

-- payouts: the owning creator (and admins) read.
create policy "Creators read own payouts"
  on public.payouts for select
  using ((select public.is_current_user_creator(creator_profile_id)));
create policy "Admins read all payouts"
  on public.payouts for select
  using ((select public.is_current_user_admin()));

-- tips: the recipient creator and the sender (and admins) read.
create policy "Creators read tips to own profile"
  on public.tips for select
  using ((select public.is_current_user_creator(creator_profile_id)));
create policy "Senders read own tips"
  on public.tips for select
  using (sender_user_id = (select auth.uid()));
create policy "Admins read all tips"
  on public.tips for select
  using ((select public.is_current_user_admin()));

-- purchases: the buyer reads their own; the creator reads purchases of their
-- content; admins read all.
create policy "Buyers read own purchases"
  on public.purchases for select
  using (buyer_user_id = (select auth.uid()));
create policy "Creators read purchases of own content"
  on public.purchases for select
  using (creator_profile_id is not null and (select public.is_current_user_creator(creator_profile_id)));
create policy "Admins read all purchases"
  on public.purchases for select
  using ((select public.is_current_user_admin()));

-- content_entitlements: the holder reads their own; admins read all.
create policy "Users read own entitlements"
  on public.content_entitlements for select
  using (user_id = (select auth.uid()));
create policy "Admins read all entitlements"
  on public.content_entitlements for select
  using ((select public.is_current_user_admin()));

-- Reads for authenticated users (RLS-scoped above); anon has NO access anywhere.
grant select on public.transactions to authenticated;
grant select on public.creator_balances to authenticated;
grant select on public.payout_requests to authenticated;
grant select on public.payouts to authenticated;
grant select on public.tips to authenticated;
grant select on public.purchases to authenticated;
grant select on public.content_entitlements to authenticated;

revoke all on public.transactions from anon;
revoke all on public.creator_balances from anon;
revoke all on public.payout_requests from anon;
revoke all on public.payouts from anon;
revoke all on public.tips from anon;
revoke all on public.purchases from anon;
revoke all on public.content_entitlements from anon;

-- ----------------------------------------------------------------------------
-- 6. Ledger write RPCs (demo only — actor derived from auth.uid())
-- ----------------------------------------------------------------------------
-- Fee model mirrors cabana-money.ts: platform 10%, processor 3% (rounded),
-- creator net is the exact remainder.

-- 6a. create_mock_purchase — buy permanent access to a `purchase` post. No real
-- charge: writes a `post_unlock` ledger transaction, a purchase row, and a
-- permanent entitlement, then refreshes the creator balance. Idempotent.
create or replace function public.create_mock_purchase(_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_post public.posts%rowtype;
  v_creator public.creator_profiles%rowtype;
  v_currency text;
  v_gross integer;
  v_platform integer;
  v_processor integer;
  v_net integer;
  v_txn_id uuid;
  v_purchase_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_post from public.posts where id = _post_id;
  if not found then
    raise exception 'Post not found' using errcode = 'no_data_found';
  end if;
  select * into v_creator from public.creator_profiles where id = v_post.creator_profile_id;

  if v_creator.user_id is not null and v_creator.user_id = v_uid then
    raise exception 'You cannot purchase your own post' using errcode = 'check_violation';
  end if;
  if v_post.status <> 'published' or v_post.published_at is null
     or v_post.published_at > now() or v_post.visibility <> 'purchase' then
    raise exception 'Post is not available for purchase' using errcode = 'check_violation';
  end if;
  if v_post.price_cents is null or v_post.price_cents <= 0 then
    raise exception 'Post has no purchase price' using errcode = 'check_violation';
  end if;

  -- Idempotent: already owned → no duplicate charge.
  if exists (
    select 1 from public.content_entitlements e
    where e.user_id = v_uid and e.post_id = _post_id
  ) then
    return;
  end if;

  v_currency := coalesce(v_post.currency, 'USD');
  v_gross := v_post.price_cents;
  v_platform := round(v_gross * 0.10)::integer;
  v_processor := round(v_gross * 0.03)::integer;
  v_net := v_gross - v_platform - v_processor;

  insert into public.transactions (
    payer_user_id, creator_profile_id, type, status, gross_cents,
    platform_fee_cents, processor_fee_cents, creator_net_cents, currency,
    reference_type, reference_id, mock_provider_reference
  ) values (
    v_uid, v_creator.id, 'post_unlock', 'succeeded', v_gross,
    v_platform, v_processor, v_net, v_currency,
    'post', _post_id, 'mock_txn_' || replace(gen_random_uuid()::text, '-', '')
  ) returning id into v_txn_id;

  insert into public.purchases (
    transaction_id, buyer_user_id, creator_profile_id, post_id, amount_cents, currency, status
  ) values (
    v_txn_id, v_uid, v_creator.id, _post_id, v_gross, v_currency, 'completed'
  ) returning id into v_purchase_id;

  insert into public.content_entitlements (user_id, post_id, source, purchase_id)
  values (v_uid, _post_id, 'purchase', v_purchase_id)
  on conflict (user_id, post_id) do nothing;

  perform public.recalc_creator_balance(v_creator.id, v_currency);
end;
$$;

-- 6b. create_mock_tip — send a (mock) tip to a creator. Writes a `tip` ledger
-- transaction + a tip row, then refreshes the creator balance.
create or replace function public.create_mock_tip(
  _username text,
  _amount_cents integer,
  _message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_creator public.creator_profiles%rowtype;
  v_currency text := 'USD';
  v_gross integer;
  v_platform integer;
  v_processor integer;
  v_net integer;
  v_txn_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if _amount_cents is null or _amount_cents < 100 or _amount_cents > 100000000 then
    raise exception 'Tip must be between $1 and $1,000,000' using errcode = 'check_violation';
  end if;

  select * into v_creator from public.creator_profiles cp
  where lower(cp.handle) = lower(btrim(_username)) limit 1;
  if not found then
    raise exception 'Creator not found' using errcode = 'no_data_found';
  end if;
  if v_creator.user_id is not null and v_creator.user_id = v_uid then
    raise exception 'You cannot tip your own creator profile' using errcode = 'check_violation';
  end if;

  v_gross := _amount_cents;
  v_platform := round(v_gross * 0.10)::integer;
  v_processor := round(v_gross * 0.03)::integer;
  v_net := v_gross - v_platform - v_processor;

  insert into public.transactions (
    payer_user_id, creator_profile_id, type, status, gross_cents,
    platform_fee_cents, processor_fee_cents, creator_net_cents, currency,
    reference_type, mock_provider_reference
  ) values (
    v_uid, v_creator.id, 'tip', 'succeeded', v_gross,
    v_platform, v_processor, v_net, v_currency,
    'tip', 'mock_txn_' || replace(gen_random_uuid()::text, '-', '')
  ) returning id into v_txn_id;

  insert into public.tips (
    transaction_id, sender_user_id, creator_profile_id, amount_cents, currency, message, status
  ) values (
    v_txn_id, v_uid, v_creator.id, v_gross, v_currency, nullif(btrim(coalesce(_message, '')), ''), 'completed'
  );

  perform public.recalc_creator_balance(v_creator.id, v_currency);
end;
$$;

-- 6c. request_payout — a creator requests a (mock) withdrawal. Validates the
-- requested amount against the available balance, records a request + a
-- reserved (processing) payout, and refreshes the balance.
create or replace function public.request_payout(
  _amount_cents integer,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_currency text := 'USD';
  v_creator_profile_id uuid;
  v_available integer;
  v_request_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  select cp.id into v_creator_profile_id from public.creator_profiles cp
  where cp.user_id = v_uid limit 1;
  if v_creator_profile_id is null then
    raise exception 'Only creators can request payouts' using errcode = 'insufficient_privilege';
  end if;

  perform public.recalc_creator_balance(v_creator_profile_id, v_currency);
  select b.available_cents into v_available from public.creator_balances b
  where b.creator_profile_id = v_creator_profile_id and b.currency = v_currency;
  v_available := coalesce(v_available, 0);

  if _amount_cents is null or _amount_cents < 1000 then
    raise exception 'Minimum payout is $10' using errcode = 'check_violation';
  end if;
  if _amount_cents > v_available then
    raise exception 'Requested amount exceeds available balance' using errcode = 'check_violation';
  end if;

  insert into public.payout_requests (
    creator_profile_id, amount_cents, currency, status, note, mock_provider_reference
  ) values (
    v_creator_profile_id, _amount_cents, v_currency, 'requested',
    nullif(btrim(coalesce(_note, '')), ''),
    'mock_preq_' || replace(gen_random_uuid()::text, '-', '')
  ) returning id into v_request_id;

  insert into public.payouts (
    creator_profile_id, payout_request_id, amount_cents, currency, status,
    requested_at, mock_provider_reference
  ) values (
    v_creator_profile_id, v_request_id, _amount_cents, v_currency, 'processing',
    now(), 'mock_payout_' || replace(gen_random_uuid()::text, '-', '')
  );

  perform public.recalc_creator_balance(v_creator_profile_id, v_currency);
end;
$$;

-- 6d. creator_balance — the calling creator's balance (recomputed on read).
create or replace function public.creator_balance()
returns table (
  currency text,
  pending_cents integer,
  available_cents integer,
  lifetime_gross_cents integer,
  lifetime_fees_cents integer,
  lifetime_net_cents integer,
  lifetime_paid_out_cents integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_creator_profile_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  select cp.id into v_creator_profile_id from public.creator_profiles cp
  where cp.user_id = v_uid limit 1;
  if v_creator_profile_id is null then
    raise exception 'Only creators have a balance' using errcode = 'insufficient_privilege';
  end if;

  -- Recompute on read so the cached projection is always fresh for the owner.
  perform public.recalc_creator_balance(v_creator_profile_id, 'USD');

  return query
  select b.currency, b.pending_cents, b.available_cents, b.lifetime_gross_cents,
         b.lifetime_fees_cents, b.lifetime_net_cents, b.lifetime_paid_out_cents
  from public.creator_balances b
  where b.creator_profile_id = v_creator_profile_id and b.currency = 'USD';
end;
$$;

revoke execute on function public.create_mock_purchase(uuid) from public, anon;
revoke execute on function public.create_mock_tip(text, integer, text) from public, anon;
revoke execute on function public.request_payout(integer, text) from public, anon;
revoke execute on function public.creator_balance() from public, anon;
grant execute on function public.create_mock_purchase(uuid) to authenticated;
grant execute on function public.create_mock_tip(text, integer, text) to authenticated;
grant execute on function public.request_payout(integer, text) to authenticated;
grant execute on function public.creator_balance() to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Wire `purchase` visibility into the entitlement + feed surfaces
-- ----------------------------------------------------------------------------
-- can_view_post: grant purchase posts to entitlement holders (and the owner).
create or replace function public.can_view_post(_post_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_post public.posts%rowtype;
  v_creator_user_id uuid;
  v_creator_profile_id uuid;
begin
  select * into v_post from public.posts where id = _post_id;
  if not found then
    return false;
  end if;
  v_creator_profile_id := v_post.creator_profile_id;

  select cp.user_id into v_creator_user_id
  from public.creator_profiles cp where cp.id = v_creator_profile_id;

  if v_creator_user_id is not null and v_creator_user_id = v_uid then
    return true;
  end if;

  if v_post.status <> 'published'
     or v_post.published_at is null
     or v_post.published_at > now() then
    return false;
  end if;

  if v_post.visibility = 'public' then
    return true;
  elsif v_post.visibility = 'followers' then
    return v_uid is not null and public.is_following_creator(v_creator_profile_id);
  elsif v_post.visibility = 'subscribers' then
    return v_uid is not null and public.is_active_subscriber(v_creator_profile_id);
  elsif v_post.visibility = 'purchase' then
    return v_uid is not null and public.has_content_entitlement(v_uid, _post_id);
  else
    return false;
  end if;
end;
$$;

-- posts RLS: entitlement holders may read published purchase posts.
create policy "Buyers can read purchased posts"
  on public.posts for select
  using (
    status = 'published'
    and published_at is not null
    and published_at <= now()
    and visibility = 'purchase'
    and (select public.has_content_entitlement((select auth.uid()), id))
  );

-- feed_creator_posts: include purchase posts; lock them for non-entitled viewers.
create or replace function public.feed_creator_posts(
  _username text,
  _cursor timestamptz default null,
  _limit integer default 20
)
returns table (
  post_id uuid,
  username text,
  display_name text,
  avatar_url text,
  caption text,
  visibility public.post_visibility,
  published_at timestamptz,
  locked boolean,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_creator public.creator_profiles%rowtype;
  v_is_owner boolean;
  v_is_follower boolean;
  v_is_subscriber boolean;
begin
  select * into v_creator from public.creator_profiles cp
  where lower(cp.handle) = lower(btrim(_username)) limit 1;
  if not found then
    raise exception 'Creator not found' using errcode = 'no_data_found';
  end if;

  v_is_owner := v_uid is not null and v_creator.user_id is not null and v_creator.user_id = v_uid;
  v_is_follower := v_uid is not null and public.is_following_creator(v_creator.id);
  v_is_subscriber := v_uid is not null and public.is_active_subscriber(v_creator.id);

  return query
  with rows as (
    select p.*,
      case
        when v_is_owner then false
        when p.visibility = 'followers' then not v_is_follower
        when p.visibility = 'subscribers' then not v_is_subscriber
        when p.visibility = 'purchase' then
          not (v_uid is not null and public.has_content_entitlement(v_uid, p.id))
        else false
      end as is_locked
    from public.posts p
    where p.creator_profile_id = v_creator.id
      and p.status = 'published'
      and p.published_at is not null
      and p.published_at <= now()
      and p.visibility in ('public', 'followers', 'subscribers', 'purchase')
      and (_cursor is null or p.published_at < _cursor)
  )
  select
    r.id,
    lower(v_creator.handle),
    v_creator.name,
    v_creator.avatar_url,
    case when r.is_locked then '' else r.caption end,
    r.visibility,
    r.published_at,
    r.is_locked,
    case when r.is_locked then '[]'::jsonb
      else (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pm.id, 'kind', pm.kind, 'width', pm.width,
          'height', pm.height, 'position', pm.position
        ) order by pm.position, pm.id), '[]'::jsonb)
        from public.post_media pm where pm.post_id = r.id
      )
    end
  from rows r
  order by r.published_at desc, r.id desc
  limit greatest(1, least(coalesce(_limit, 20), 50));
end;
$$;

-- post_card: same purchase-aware locking for the detail page.
create or replace function public.post_card(_post_id uuid)
returns table (
  post_id uuid,
  username text,
  display_name text,
  avatar_url text,
  caption text,
  visibility public.post_visibility,
  published_at timestamptz,
  locked boolean,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_post public.posts%rowtype;
  v_creator public.creator_profiles%rowtype;
  v_is_owner boolean;
  v_locked boolean;
begin
  select * into v_post from public.posts where id = _post_id;
  if not found then
    raise exception 'Post not found' using errcode = 'no_data_found';
  end if;
  select * into v_creator from public.creator_profiles where id = v_post.creator_profile_id;
  v_is_owner := v_uid is not null and v_creator.user_id is not null and v_creator.user_id = v_uid;

  if not v_is_owner and (
    v_post.status <> 'published'
    or v_post.published_at is null
    or v_post.published_at > now()
    or v_post.visibility not in ('public', 'followers', 'subscribers', 'purchase')
  ) then
    raise exception 'Post not found' using errcode = 'no_data_found';
  end if;

  v_locked := case
    when v_is_owner then false
    when v_post.visibility = 'followers' then
      not (v_uid is not null and public.is_following_creator(v_creator.id))
    when v_post.visibility = 'subscribers' then
      not (v_uid is not null and public.is_active_subscriber(v_creator.id))
    when v_post.visibility = 'purchase' then
      not (v_uid is not null and public.has_content_entitlement(v_uid, v_post.id))
    else false
  end;

  return query
  select
    v_post.id,
    lower(v_creator.handle),
    v_creator.name,
    v_creator.avatar_url,
    case when v_locked then '' else v_post.caption end,
    v_post.visibility,
    v_post.published_at,
    v_locked,
    case when v_locked then '[]'::jsonb
      else (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pm.id, 'kind', pm.kind, 'width', pm.width,
          'height', pm.height, 'position', pm.position
        ) order by pm.position, pm.id), '[]'::jsonb)
        from public.post_media pm where pm.post_id = v_post.id
      )
    end;
end;
$$;
