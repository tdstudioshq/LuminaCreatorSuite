-- ============================================================================
-- CABANA — Phase 4: Creator subscriptions & mock entitlements (DEMO-ONLY)
-- ============================================================================
-- Adds fan-to-creator subscriptions and wires the `subscribers` post-visibility
-- tier to a real entitlement check. Purely additive.
--
-- DEMO ONLY — no real money moves. Subscriptions are created by SECURITY DEFINER
-- RPCs with integer-cent prices copied from a creator-defined tier and a
-- `mock_*` provider reference. There is NO payment provider, charge, payout, or
-- KYC. The existing `subscriptions` table (CABANA SaaS plans) is NOT renamed;
-- fan subscriptions live in the new `creator_subscriptions` table.
--
-- `purchase` visibility remains unsupported (needs the Phase 6 ledger).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enum
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.creator_subscription_status as enum
    ('trialing', 'active', 'past_due', 'canceled', 'expired');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
-- A creator-defined subscription tier (demo pricing in integer cents).
create table if not exists public.creator_subscription_tiers (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  name text not null default 'Supporter',
  price_cents integer not null default 0,
  currency text not null default 'USD',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_subscription_tiers_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint creator_subscription_tiers_price check (price_cents between 0 and 100000000)
);

create index if not exists creator_subscription_tiers_creator_idx
  on public.creator_subscription_tiers (creator_profile_id) where is_active;

drop trigger if exists touch_creator_subscription_tiers_updated_at on public.creator_subscription_tiers;
create trigger touch_creator_subscription_tiers_updated_at
  before update on public.creator_subscription_tiers
  for each row execute function public.touch_updated_at();

-- A member's (demo) subscription to a creator.
create table if not exists public.creator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_user_id uuid not null references public.profiles (id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  tier_id uuid references public.creator_subscription_tiers (id) on delete set null,
  status public.creator_subscription_status not null default 'active',
  price_cents integer not null default 0,
  currency text not null default 'USD',
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  mock_provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one live (trialing/active) subscription per member↔creator pair.
create unique index if not exists creator_subscriptions_live_unique
  on public.creator_subscriptions (member_user_id, creator_profile_id)
  where status in ('trialing', 'active');
create index if not exists creator_subscriptions_creator_status_idx
  on public.creator_subscriptions (creator_profile_id, status);

drop trigger if exists touch_creator_subscriptions_updated_at on public.creator_subscriptions;
create trigger touch_creator_subscriptions_updated_at
  before update on public.creator_subscriptions
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Entitlement helper
-- ----------------------------------------------------------------------------
-- True if the current user holds a live (trialing/active, unexpired) subscription
-- to the creator. Mirrors the client `isSubscriptionActive` rule.
create or replace function public.is_active_subscriber(_creator_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.creator_subscriptions s
    where s.member_user_id = (select auth.uid())
      and s.creator_profile_id = _creator_profile_id
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end >= now())
  )
$$;

revoke execute on function public.is_active_subscriber(uuid) from public;
grant execute on function public.is_active_subscriber(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS + base privileges
-- ----------------------------------------------------------------------------
alter table public.creator_subscription_tiers enable row level security;
alter table public.creator_subscriptions enable row level security;

-- Tiers: public can read ACTIVE tiers (for the subscribe UI); owner manages all.
create policy "Public can read active tiers"
  on public.creator_subscription_tiers for select
  using (is_active);
create policy "Creators manage own tiers"
  on public.creator_subscription_tiers for all
  using ((select public.is_current_user_creator(creator_profile_id)))
  with check ((select public.is_current_user_creator(creator_profile_id)));

grant select on public.creator_subscription_tiers to anon, authenticated;
grant insert, update, delete on public.creator_subscription_tiers to authenticated;

-- Subscriptions: the member reads their own; the creator reads subs to their
-- profile. Writes go exclusively through the SECURITY DEFINER RPCs below.
create policy "Members read own subscriptions"
  on public.creator_subscriptions for select
  using (member_user_id = (select auth.uid()));
create policy "Creators read subscriptions to own profile"
  on public.creator_subscriptions for select
  using ((select public.is_current_user_creator(creator_profile_id)));

grant select on public.creator_subscriptions to authenticated;
revoke all on public.creator_subscriptions from anon;

-- ----------------------------------------------------------------------------
-- 4. Subscription RPCs (demo writes — actor derived from auth.uid())
-- ----------------------------------------------------------------------------
-- Create or re-activate a demo subscription. Price is copied server-side from
-- the creator's chosen active tier; the reference is a `mock_*` string. No real
-- payment occurs.
create or replace function public.subscribe_to_creator(_username text, _tier_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_creator public.creator_profiles%rowtype;
  v_tier public.creator_subscription_tiers%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_creator from public.creator_profiles cp
  where lower(cp.handle) = lower(btrim(_username)) limit 1;
  if not found then
    raise exception 'Creator not found' using errcode = 'no_data_found';
  end if;
  if v_creator.user_id = v_uid then
    raise exception 'You cannot subscribe to your own creator profile' using errcode = 'check_violation';
  end if;

  select * into v_tier from public.creator_subscription_tiers t
  where t.id = _tier_id and t.creator_profile_id = v_creator.id and t.is_active;
  if not found then
    raise exception 'Subscription tier not found' using errcode = 'no_data_found';
  end if;

  -- Idempotent re-activation: refresh an existing row for this pair, else insert.
  update public.creator_subscriptions s
    set status = 'active',
        tier_id = v_tier.id,
        price_cents = v_tier.price_cents,
        currency = v_tier.currency,
        started_at = now(),
        current_period_end = now() + interval '30 days',
        cancel_at_period_end = false,
        canceled_at = null,
        mock_provider_reference = 'mock_sub_' || replace(gen_random_uuid()::text, '-', '')
  where s.member_user_id = v_uid and s.creator_profile_id = v_creator.id;

  if not found then
    insert into public.creator_subscriptions (
      member_user_id, creator_profile_id, tier_id, status, price_cents, currency,
      started_at, current_period_end, mock_provider_reference
    ) values (
      v_uid, v_creator.id, v_tier.id, 'active', v_tier.price_cents, v_tier.currency,
      now(), now() + interval '30 days',
      'mock_sub_' || replace(gen_random_uuid()::text, '-', '')
    );
  end if;
end;
$$;

create or replace function public.cancel_creator_subscription(_username text)
returns void
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
  where lower(cp.handle) = lower(btrim(_username)) limit 1;
  if v_creator_profile_id is null then
    raise exception 'Creator not found' using errcode = 'no_data_found';
  end if;

  update public.creator_subscriptions
    set status = 'canceled', canceled_at = now(), cancel_at_period_end = true
  where member_user_id = v_uid
    and creator_profile_id = v_creator_profile_id
    and status in ('trialing', 'active');
end;
$$;

-- The caller's subscription state for a creator (no UUIDs). Anon → not subscribed.
create or replace function public.creator_subscription_state(_username text)
returns table (
  username text,
  subscribed boolean,
  status public.creator_subscription_status,
  tier_name text,
  price_cents integer,
  currency text,
  current_period_end timestamptz,
  is_self boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_creator public.creator_profiles%rowtype;
begin
  select * into v_creator from public.creator_profiles cp
  where lower(cp.handle) = lower(btrim(_username)) limit 1;
  if not found then
    raise exception 'Creator not found' using errcode = 'no_data_found';
  end if;

  return query
  select
    lower(v_creator.handle),
    public.is_active_subscriber(v_creator.id),
    s.status,
    t.name,
    s.price_cents,
    s.currency,
    s.current_period_end,
    (v_creator.user_id is not null and v_creator.user_id = v_uid)
  from (select 1) one
  left join public.creator_subscriptions s
    on s.member_user_id = v_uid and s.creator_profile_id = v_creator.id
   and s.status in ('trialing', 'active')
  left join public.creator_subscription_tiers t on t.id = s.tier_id;
end;
$$;

-- A creator's own subscriber list (safe member identity; no UUIDs).
create or replace function public.creator_subscribers_list(
  _cursor timestamptz default null,
  _limit integer default 50
)
returns table (
  member_username text,
  member_display_name text,
  member_avatar_url text,
  tier_name text,
  price_cents integer,
  currency text,
  since timestamptz
)
language plpgsql
stable
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
    raise exception 'Only creators have subscribers' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    mp.username,
    coalesce(mp.display_name, pr.name),
    mp.avatar_url,
    t.name,
    s.price_cents,
    s.currency,
    s.started_at
  from public.creator_subscriptions s
  join public.profiles pr on pr.id = s.member_user_id
  left join public.member_profiles mp on mp.user_id = s.member_user_id
  left join public.creator_subscription_tiers t on t.id = s.tier_id
  where s.creator_profile_id = v_creator_profile_id
    and s.status in ('trialing', 'active')
    and (_cursor is null or s.started_at < _cursor)
  order by s.started_at desc
  limit greatest(1, least(coalesce(_limit, 50), 100));
end;
$$;

revoke execute on function public.subscribe_to_creator(text, uuid) from public, anon;
revoke execute on function public.cancel_creator_subscription(text) from public, anon;
revoke execute on function public.creator_subscription_state(text) from public;
revoke execute on function public.creator_subscribers_list(timestamptz, integer) from public, anon;
grant execute on function public.subscribe_to_creator(text, uuid) to authenticated;
grant execute on function public.cancel_creator_subscription(text) to authenticated;
grant execute on function public.creator_subscription_state(text) to anon, authenticated;
grant execute on function public.creator_subscribers_list(timestamptz, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Wire `subscribers` visibility into the entitlement + feed surfaces
-- ----------------------------------------------------------------------------
-- can_view_post: grant subscribers posts to active subscribers (and the owner).
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
  else
    return false; -- purchase: not available yet
  end if;
end;
$$;

-- posts RLS: subscribers may read published subscriber posts.
create policy "Subscribers can read subscriber posts"
  on public.posts for select
  using (
    status = 'published'
    and published_at is not null
    and published_at <= now()
    and visibility = 'subscribers'
    and (select public.is_active_subscriber(creator_profile_id))
  );

-- feed_creator_posts: include subscriber posts; lock them for non-subscribers.
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
        else false
      end as is_locked
    from public.posts p
    where p.creator_profile_id = v_creator.id
      and p.status = 'published'
      and p.published_at is not null
      and p.published_at <= now()
      and p.visibility in ('public', 'followers', 'subscribers')
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

-- post_card: same subscriber-aware locking for the detail page.
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
    or v_post.visibility not in ('public', 'followers', 'subscribers')
  ) then
    raise exception 'Post not found' using errcode = 'no_data_found';
  end if;

  v_locked := case
    when v_is_owner then false
    when v_post.visibility = 'followers' then
      not (v_uid is not null and public.is_following_creator(v_creator.id))
    when v_post.visibility = 'subscribers' then
      not (v_uid is not null and public.is_active_subscriber(v_creator.id))
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
