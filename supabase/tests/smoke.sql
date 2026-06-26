-- ============================================================================
-- CABANA — post-reset smoke checks
-- ============================================================================
-- Run against a freshly reset local instance with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
-- Any failed assertion raises and exits non-zero.
-- ============================================================================

do $$
declare
  expected_tables text[] := array[
    'profiles','creator_profiles','links','products',
    'analytics_events','subscriptions','user_roles','reserved_handles',
    'member_profiles','follows','blocks',
    'posts','post_media',
    'post_comments','post_likes','post_saves',
    'creator_subscription_tiers','creator_subscriptions',
    'conversations','conversation_participants','messages','message_read_receipts',
    'transactions','creator_balances','payouts','payout_requests',
    'tips','purchases','content_entitlements'
  ];
  t text;
begin
  -- Tables
  foreach t in array expected_tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'MISSING TABLE: public.%', t;
    end if;
  end loop;

  -- Enums
  if not exists (select 1 from pg_type where typname = 'app_role') then
    raise exception 'MISSING ENUM: app_role';
  end if;
  if not exists (select 1 from pg_type where typname = 'account_type') then
    raise exception 'MISSING ENUM: account_type';
  end if;
  -- Phase 3 enums
  if not exists (select 1 from pg_type where typname = 'post_visibility') then
    raise exception 'MISSING ENUM: post_visibility';
  end if;
  if not exists (select 1 from pg_type where typname = 'post_status') then
    raise exception 'MISSING ENUM: post_status';
  end if;
  if not exists (select 1 from pg_type where typname = 'post_media_kind') then
    raise exception 'MISSING ENUM: post_media_kind';
  end if;
  -- Phase 3.2 enum
  if not exists (select 1 from pg_type where typname = 'comment_status') then
    raise exception 'MISSING ENUM: comment_status';
  end if;
  -- Phase 4 enum
  if not exists (select 1 from pg_type where typname = 'creator_subscription_status') then
    raise exception 'MISSING ENUM: creator_subscription_status';
  end if;
  -- Phase 5 enum
  if not exists (select 1 from pg_type where typname = 'message_type') then
    raise exception 'MISSING ENUM: message_type';
  end if;
  -- Phase 6 enums
  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    raise exception 'MISSING ENUM: transaction_type';
  end if;
  if not exists (select 1 from pg_type where typname = 'transaction_status') then
    raise exception 'MISSING ENUM: transaction_status';
  end if;
  if not exists (select 1 from pg_type where typname = 'payout_status') then
    raise exception 'MISSING ENUM: payout_status';
  end if;
  if not exists (select 1 from pg_type where typname = 'payout_request_status') then
    raise exception 'MISSING ENUM: payout_request_status';
  end if;

  -- Phase 2B: profiles.account_type column (NOT NULL, default creator)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'account_type'
  ) then
    raise exception 'MISSING COLUMN: public.profiles.account_type';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'member_profiles' and column_name = 'username'
  ) then
    raise exception 'MISSING COLUMN: public.member_profiles.username';
  end if;

  -- Phase 2C safe public views
  if to_regclass('public.public_creator_profiles') is null then
    raise exception 'MISSING VIEW: public_creator_profiles';
  end if;
  if to_regclass('public.public_member_profiles') is null then
    raise exception 'MISSING VIEW: public_member_profiles';
  end if;

  -- Functions
  if to_regprocedure('public.handle_new_user()') is null then
    raise exception 'MISSING FUNCTION: handle_new_user';
  end if;
  if to_regprocedure('public.has_role(uuid, public.app_role)') is null then
    raise exception 'MISSING FUNCTION: has_role';
  end if;
  if to_regprocedure('public.validate_creator_handle()') is null then
    raise exception 'MISSING FUNCTION: validate_creator_handle';
  end if;
  if to_regprocedure('public.touch_updated_at()') is null then
    raise exception 'MISSING FUNCTION: touch_updated_at';
  end if;
  -- Phase 3 feed RPCs + authorization helpers
  if to_regprocedure('public.feed_creator_posts(text, timestamptz, integer)') is null then
    raise exception 'MISSING FUNCTION: feed_creator_posts';
  end if;
  if to_regprocedure('public.feed_home_posts(timestamptz, integer)') is null then
    raise exception 'MISSING FUNCTION: feed_home_posts';
  end if;
  if to_regprocedure('public.can_view_post(uuid)') is null then
    raise exception 'MISSING FUNCTION: can_view_post';
  end if;
  if to_regprocedure('public.is_following_creator(uuid)') is null then
    raise exception 'MISSING FUNCTION: is_following_creator';
  end if;
  -- Phase 3.2 engagement RPCs + helpers
  if to_regprocedure('public.post_engagement_state(uuid)') is null then
    raise exception 'MISSING FUNCTION: post_engagement_state';
  end if;
  if to_regprocedure('public.post_comments_list(uuid, timestamptz, integer)') is null then
    raise exception 'MISSING FUNCTION: post_comments_list';
  end if;
  if to_regprocedure('public.post_card(uuid)') is null then
    raise exception 'MISSING FUNCTION: post_card';
  end if;
  if to_regprocedure('public.is_engagement_blocked(uuid)') is null then
    raise exception 'MISSING FUNCTION: is_engagement_blocked';
  end if;
  -- Phase 4 subscription RPCs + helper
  if to_regprocedure('public.is_active_subscriber(uuid)') is null then
    raise exception 'MISSING FUNCTION: is_active_subscriber';
  end if;
  if to_regprocedure('public.subscribe_to_creator(text, uuid)') is null then
    raise exception 'MISSING FUNCTION: subscribe_to_creator';
  end if;
  if to_regprocedure('public.creator_subscription_state(text)') is null then
    raise exception 'MISSING FUNCTION: creator_subscription_state';
  end if;
  -- Phase 5 messaging RPCs + helpers
  if to_regprocedure('public.create_direct_conversation(uuid)') is null then
    raise exception 'MISSING FUNCTION: create_direct_conversation';
  end if;
  if to_regprocedure('public.list_conversations()') is null then
    raise exception 'MISSING FUNCTION: list_conversations';
  end if;
  if to_regprocedure('public.conversation_messages(uuid, timestamptz, integer)') is null then
    raise exception 'MISSING FUNCTION: conversation_messages';
  end if;
  if to_regprocedure('public.is_conversation_participant(uuid)') is null then
    raise exception 'MISSING FUNCTION: is_conversation_participant';
  end if;
  if to_regprocedure('public.unread_message_count()') is null then
    raise exception 'MISSING FUNCTION: unread_message_count';
  end if;
  -- Phase 6 ledger RPCs + helpers
  if to_regprocedure('public.create_mock_purchase(uuid)') is null then
    raise exception 'MISSING FUNCTION: create_mock_purchase';
  end if;
  if to_regprocedure('public.create_mock_tip(text, integer, text)') is null then
    raise exception 'MISSING FUNCTION: create_mock_tip';
  end if;
  if to_regprocedure('public.request_payout(integer, text)') is null then
    raise exception 'MISSING FUNCTION: request_payout';
  end if;
  if to_regprocedure('public.creator_balance()') is null then
    raise exception 'MISSING FUNCTION: creator_balance';
  end if;
  if to_regprocedure('public.has_content_entitlement(uuid, uuid)') is null then
    raise exception 'MISSING FUNCTION: has_content_entitlement';
  end if;
  if to_regprocedure('public.recalc_creator_balance(uuid, text)') is null then
    raise exception 'MISSING FUNCTION: recalc_creator_balance';
  end if;

  -- Phase 6: posts gains a nullable purchase price.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'price_cents'
  ) then
    raise exception 'MISSING COLUMN: public.posts.price_cents';
  end if;

  -- Signup trigger on auth.users
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    raise exception 'MISSING TRIGGER: on_auth_user_created';
  end if;

  -- RLS enabled on owner-sensitive tables
  if not (select relrowsecurity from pg_class where oid = 'public.creator_profiles'::regclass) then
    raise exception 'RLS NOT ENABLED: creator_profiles';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass) then
    raise exception 'RLS NOT ENABLED: subscriptions';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.member_profiles'::regclass) then
    raise exception 'RLS NOT ENABLED: member_profiles';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.follows'::regclass) then
    raise exception 'RLS NOT ENABLED: follows';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.blocks'::regclass) then
    raise exception 'RLS NOT ENABLED: blocks';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.posts'::regclass) then
    raise exception 'RLS NOT ENABLED: posts';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.post_media'::regclass) then
    raise exception 'RLS NOT ENABLED: post_media';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.post_comments'::regclass) then
    raise exception 'RLS NOT ENABLED: post_comments';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.post_likes'::regclass) then
    raise exception 'RLS NOT ENABLED: post_likes';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.post_saves'::regclass) then
    raise exception 'RLS NOT ENABLED: post_saves';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.creator_subscriptions'::regclass) then
    raise exception 'RLS NOT ENABLED: creator_subscriptions';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.conversations'::regclass) then
    raise exception 'RLS NOT ENABLED: conversations';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.messages'::regclass) then
    raise exception 'RLS NOT ENABLED: messages';
  end if;
  -- Phase 6 financial tables must have RLS enabled
  if not (select relrowsecurity from pg_class where oid = 'public.transactions'::regclass) then
    raise exception 'RLS NOT ENABLED: transactions';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.creator_balances'::regclass) then
    raise exception 'RLS NOT ENABLED: creator_balances';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.purchases'::regclass) then
    raise exception 'RLS NOT ENABLED: purchases';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.content_entitlements'::regclass) then
    raise exception 'RLS NOT ENABLED: content_entitlements';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.payouts'::regclass) then
    raise exception 'RLS NOT ENABLED: payouts';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.payout_requests'::regclass) then
    raise exception 'RLS NOT ENABLED: payout_requests';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.tips'::regclass) then
    raise exception 'RLS NOT ENABLED: tips';
  end if;
  -- messages must NOT be readable by anon (no grant)
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'messages'
      and grantee = 'anon' and privilege_type = 'SELECT'
  ) then
    raise exception 'SECURITY: anon has SELECT on messages';
  end if;
  -- creator_subscriptions must NOT be readable by anon (no grant)
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'creator_subscriptions'
      and grantee = 'anon' and privilege_type = 'SELECT'
  ) then
    raise exception 'SECURITY: anon has SELECT on creator_subscriptions';
  end if;
  -- Phase 6 financial tables must NOT be readable by anon (no grant)
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('transactions','creator_balances','payouts',
                         'payout_requests','tips','purchases','content_entitlements')
      and grantee = 'anon'
  ) then
    raise exception 'SECURITY: anon has privileges on a Phase 6 financial table';
  end if;

  -- member_profiles must NOT be publicly readable (no USING(true) select policy)
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'member_profiles'
      and cmd = 'SELECT' and qual = 'true'
  ) then
    raise exception 'SECURITY: member_profiles has a public SELECT policy';
  end if;

  -- Storage buckets
  if (select count(*) from storage.buckets where id in ('avatars','banners','products')) <> 3 then
    raise exception 'MISSING STORAGE BUCKETS (expected avatars, banners, products)';
  end if;
  -- Phase 3 post-media bucket must exist and be PRIVATE
  if not exists (select 1 from storage.buckets where id = 'post-media') then
    raise exception 'MISSING STORAGE BUCKET: post-media';
  end if;
  if (select public from storage.buckets where id = 'post-media') is distinct from false then
    raise exception 'SECURITY: post-media bucket is not private';
  end if;
  -- post_media must NOT be publicly readable (no USING(true) select policy)
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_media'
      and cmd = 'SELECT' and qual = 'true'
  ) then
    raise exception 'SECURITY: post_media has a public SELECT policy';
  end if;

  -- Seed: aurora demo creator present and wired up
  if not exists (select 1 from public.creator_profiles where handle = 'aurora' and user_id is null) then
    raise exception 'MISSING SEED: aurora creator profile';
  end if;
  if (select count(*) from public.links     where profile_id = '00000000-0000-4000-a000-000000000001') < 1 then
    raise exception 'MISSING SEED: aurora links';
  end if;
  if (select count(*) from public.products  where profile_id = '00000000-0000-4000-a000-000000000001') < 1 then
    raise exception 'MISSING SEED: aurora products';
  end if;

  -- Reserved handles loaded (handle validation depends on them)
  if (select count(*) from public.reserved_handles) < 10 then
    raise exception 'MISSING SEED: reserved_handles';
  end if;

  raise notice 'CABANA smoke checks passed: schema, functions, triggers, RLS, storage, and seed are present.';
end $$;
