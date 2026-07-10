-- ============================================================================
-- CABANA — High-severity QA fixes (frontend-adjacent DB corrections)
-- ----------------------------------------------------------------------------
-- Corrective, additive-only. No new tables/columns/enums/RLS/policies; no data
-- change. Three fixes from the fresh behavioral QA audit:
--
--   H5  public_creator_profiles.post_count was hardcoded 0, so every discovery /
--       search card showed a fabricated "0 posts". Replace it with a real count
--       of the creator's published posts (a count only — no gated content is
--       exposed; the view stays SECURITY DEFINER over public.posts, exactly like
--       the existing follower_count subquery).
--
--   H8  create_mock_purchase guarded idempotency with a bare `select exists`
--       on content_entitlements — two concurrent unlocks both passed it and each
--       wrote a transaction + purchase row (the unique entitlement deduped only
--       the entitlement), double-charging the buyer and double-crediting the
--       creator. Add a transaction-scoped advisory lock on (buyer, post) so the
--       critical section is serialized; the existing entitlement guard then
--       makes the second call a clean no-op.
--
--   H9  request_payout did recalc → read available → check → insert with no
--       serialization, so two concurrent requests both saw the same available
--       balance and over-reserved, driving available_cents negative. Add a
--       transaction-scoped advisory lock per creator so requests serialize and
--       the second re-reads the reduced balance.
--
-- Advisory locks are released automatically at transaction end (each PostgREST
-- RPC call is its own transaction), so there is nothing to unlock and no
-- deadlock surface (each function takes a single lock).
-- ============================================================================

-- ── H5: real post_count in the public creator projection ─────────────────────
create or replace view public.public_creator_profiles
with (security_barrier = true, security_invoker = false)
as
select
  cp.handle as username,
  cp.name as display_name,
  cp.avatar_url,
  cp.banner_url,
  cp.bio,
  false::boolean as verified,
  (
    select count(*)
    from public.follows f
    where f.following_creator_id = cp.id
  )::bigint as follower_count,
  (
    select count(*)
    from public.follows f
    where f.follower_id = cp.user_id
  )::bigint as following_count,
  (
    select count(*)
    from public.posts p
    where p.creator_profile_id = cp.id
      and p.status = 'published'
  )::bigint as post_count
from public.creator_profiles cp;

-- create-or-replace preserves the existing grants; re-assert them defensively so
-- a from-zero rebuild is never left without PostgREST read access.
revoke all on public.public_creator_profiles from public, anon, authenticated;
grant select on public.public_creator_profiles to anon, authenticated;

-- ── H8: serialize concurrent purchase unlocks ────────────────────────────────
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

  -- Serialize concurrent unlock attempts for the same (buyer, post) so a
  -- double-submit can't insert two ledger rows before the entitlement guard
  -- below commits. Transaction-scoped; released at commit.
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext(_post_id::text));

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

-- ── H9: serialize concurrent payout requests per creator ─────────────────────
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

  -- Serialize concurrent payout requests for this creator so two requests can't
  -- both pass the available-balance check below and over-reserve (driving the
  -- balance negative). Transaction-scoped; released at commit.
  perform pg_advisory_xact_lock(hashtext('cabana_payout'), hashtext(v_creator_profile_id::text));

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
