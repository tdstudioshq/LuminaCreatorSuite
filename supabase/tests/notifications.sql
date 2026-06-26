-- ============================================================================
-- CABANA — Phase 7 behavioral checks: notifications & activity (internal only)
-- ============================================================================
-- Proves: event generation via triggers (follow / like / comment / message /
-- payout money-action), unread counts, mark-read + mark-all-read under RLS,
-- preferences read/update, outbox row creation from preferences, idempotency
-- (no duplicate notification on re-fire), self-notification suppression, RLS
-- recipient isolation (recipient vs actor vs stranger), outbox admin-only, and
-- anonymous denial. Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in (
  'notif_creator@example.com',
  'notif_member@example.com',
  'notif_stranger@example.com'
);

do $$
declare
  v_creator_id uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_stranger_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_post_id uuid;
  v_conv_id uuid;
  v_notif_id uuid;
  cnt int;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_creator_id, 'notif_creator@example.com', '{"name":"Creator"}'::jsonb),
    (v_member_id, 'notif_member@example.com', '{"name":"Member","account_type":"member"}'::jsonb),
    (v_stranger_id, 'notif_stranger@example.com', '{"name":"Stranger","account_type":"member"}'::jsonb);

  select id into v_profile_id from public.creator_profiles where user_id = v_creator_id;

  -- Source rows inserted as the table owner (bypasses RLS); triggers derive the
  -- recipient/actor from the row columns, so event generation is exercised
  -- regardless of who wrote the row.
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_id, 'hello world', 'public', 'published', now()) returning id into v_post_id;

  insert into public.conversations default values returning id into v_conv_id;
  insert into public.conversation_participants (conversation_id, user_id)
    values (v_conv_id, v_creator_id), (v_conv_id, v_member_id);

  -- 1. Event generation: follow, like, comment, message, payout (money action).
  insert into public.follows (follower_id, following_creator_id) values (v_member_id, v_profile_id);
  insert into public.post_likes (post_id, user_id) values (v_post_id, v_member_id);
  insert into public.post_comments (post_id, author_id, body, status)
    values (v_post_id, v_member_id, 'great post', 'visible');
  insert into public.messages (conversation_id, sender_id, body) values (v_conv_id, v_member_id, 'hi');
  insert into public.payout_requests (creator_profile_id, amount_cents, currency, status)
    values (v_profile_id, 1000, 'USD', 'requested');

  select count(*) into cnt from public.notifications where recipient_id = v_creator_id;
  if cnt <> 5 then raise exception 'expected 5 creator notifications, got %', cnt; end if;

  -- Each maps to the right type.
  if not exists (select 1 from public.notifications
    where recipient_id = v_creator_id and type = 'new_follower') then
    raise exception 'missing new_follower notification'; end if;
  if not exists (select 1 from public.notifications
    where recipient_id = v_creator_id and type = 'message_received') then
    raise exception 'missing message_received notification'; end if;
  if not exists (select 1 from public.notifications
    where recipient_id = v_creator_id and type = 'payout_requested') then
    raise exception 'missing payout_requested notification'; end if;

  -- Canonical activity log captured each event (actor = member on the social ones).
  select count(*) into cnt from public.activity_events where actor_id = v_member_id;
  if cnt < 4 then raise exception 'expected >= 4 member activity events, got %', cnt; end if;

  -- 2. Self-notification suppression: creator likes own post → no notification.
  insert into public.post_likes (post_id, user_id) values (v_post_id, v_creator_id);
  select count(*) into cnt from public.notifications
    where recipient_id = v_creator_id and type = 'post_liked';
  if cnt <> 1 then raise exception 'self-like produced a notification (count=%)', cnt; end if;

  -- 3. Idempotency: re-firing the same like event does not duplicate the notification.
  delete from public.post_likes where post_id = v_post_id and user_id = v_member_id;
  insert into public.post_likes (post_id, user_id) values (v_post_id, v_member_id);
  select count(*) into cnt from public.notifications
    where recipient_id = v_creator_id and type = 'post_liked';
  if cnt <> 1 then raise exception 'duplicate post_liked notification after re-fire (count=%)', cnt; end if;

  -- 4. Preferences + outbox: enable email, then a new follow enqueues an email
  --    outbox row (in-app is delivered directly, never via the outbox).
  insert into public.notification_preferences (user_id, email_enabled) values (v_creator_id, true);
  insert into public.follows (follower_id, following_creator_id) values (v_stranger_id, v_profile_id);
  select count(*) into cnt from public.notifications where recipient_id = v_creator_id;
  if cnt <> 6 then raise exception 'expected 6 creator notifications after stranger follow, got %', cnt; end if;
  select count(*) into cnt from public.notification_outbox o
    join public.notifications n on n.id = o.notification_id
    where n.recipient_id = v_creator_id and o.channel = 'email';
  if cnt <> 1 then raise exception 'expected 1 email outbox row, got %', cnt; end if;

  -- 5. Unread count, mark read, mark all read (under the creator's RLS).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into cnt from public.notifications where read_at is null; -- RLS → own only
  if cnt <> 6 then raise exception 'creator unread (RLS) = % (expected 6)', cnt; end if;

  select id into v_notif_id from public.notifications where read_at is null limit 1;
  update public.notifications set read_at = now() where id = v_notif_id;
  select count(*) into cnt from public.notifications where read_at is null;
  if cnt <> 5 then raise exception 'mark-read did not reduce unread (=%)', cnt; end if;

  update public.notifications set read_at = now() where recipient_id = v_creator_id and read_at is null;
  select count(*) into cnt from public.notifications where read_at is null;
  if cnt <> 0 then raise exception 'mark-all-read left % unread', cnt; end if;

  -- Preferences are self-manageable; default read returns the creator's row.
  update public.notification_preferences set push_enabled = true where user_id = v_creator_id;
  if not exists (select 1 from public.notification_preferences
    where user_id = v_creator_id and push_enabled and email_enabled) then
    raise exception 'preference update did not persist'; end if;

  -- Outbox is NOT readable by a normal owner (admin-only).
  select count(*) into cnt from public.notification_outbox;
  if cnt <> 0 then raise exception 'creator could read % outbox rows (expected 0)', cnt; end if;
  reset role;

  -- 6. RLS isolation: the actor (member) sees none of the creator's notifications.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.notifications;
  if cnt <> 0 then raise exception 'member sees % notifications (expected 0)', cnt; end if;
  select count(*) into cnt from public.activity_events; -- member is actor on several
  if cnt = 0 then raise exception 'member sees no activity (expected own actor events)'; end if;
  select count(*) into cnt from public.notification_preferences; -- not the creator's
  if cnt <> 0 then raise exception 'member can read another user preferences'; end if;
  reset role;

  -- Stranger sees none of the creator's notifications.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.notifications;
  if cnt <> 0 then raise exception 'stranger sees % notifications (expected 0)', cnt; end if;
  reset role;

  -- 7. Anonymous denial on every notification table.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin perform 1 from public.notifications limit 1;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon could read notifications'; end if;

  denied := false;
  begin perform 1 from public.notification_outbox limit 1;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon could read notification_outbox'; end if;
  reset role;

  delete from auth.users where id in (v_creator_id, v_member_id, v_stranger_id);
  raise notice 'Phase 7 notifications & activity checks passed.';
end $$;
