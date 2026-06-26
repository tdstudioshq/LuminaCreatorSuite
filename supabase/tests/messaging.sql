-- ============================================================================
-- CABANA — Phase 5 behavioral checks: messaging
-- ============================================================================
-- Proves conversation/message/receipt RLS, participant isolation, unread
-- calculations, read receipts, edit/delete rules, block enforcement (no new
-- conversation, no new message), self-conversation rejection, and anon denial.
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in ('msg_a@example.com', 'msg_b@example.com', 'msg_c@example.com');

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  cid uuid;
  m_hi uuid;
  m_hey uuid;
  cnt int;
  denied boolean;
  v_del boolean;
  v_blank boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'msg_a@example.com', '{"name":"Aaa","account_type":"member"}'::jsonb),
    (b, 'msg_b@example.com', '{"name":"Bbb","account_type":"member"}'::jsonb),
    (c, 'msg_c@example.com', '{"name":"Ccc","account_type":"member"}'::jsonb);

  -- A starts a conversation with B (idempotent) and sends a message.
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cid := public.create_direct_conversation(b);
  if cid <> public.create_direct_conversation(b) then
    raise exception 'create_direct_conversation is not idempotent';
  end if;
  insert into public.messages (conversation_id, sender_id, body)
    values (cid, a, 'hi') returning id into m_hi;

  -- Self-conversation is rejected.
  denied := false;
  begin perform public.create_direct_conversation(a);
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'self-conversation was not rejected'; end if;
  reset role;

  -- B replies.
  perform set_config('request.jwt.claims',
    json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.messages (conversation_id, sender_id, body)
    values (cid, b, 'hey') returning id into m_hey;

  -- Unread: B has 1 unread (A's "hi"); mark read → 0.
  select unread_count into cnt from public.list_conversations() where conversation_id = cid;
  if cnt <> 1 then raise exception 'B unread = % (expected 1)', cnt; end if;
  if public.unread_message_count() <> 1 then raise exception 'B total unread <> 1'; end if;
  perform public.mark_conversation_read(cid);
  if public.unread_message_count() <> 0 then raise exception 'B unread not cleared'; end if;
  reset role;

  -- Participant isolation: C sees nothing and cannot send.
  perform set_config('request.jwt.claims',
    json_build_object('sub', c::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.conversations;
  if cnt <> 0 then raise exception 'stranger sees % conversations (expected 0)', cnt; end if;
  select count(*) into cnt from public.messages;
  if cnt <> 0 then raise exception 'stranger sees % messages (expected 0)', cnt; end if;
  if (select count(*) from public.list_conversations()) <> 0 then
    raise exception 'stranger list_conversations not empty'; end if;
  denied := false;
  begin perform public.conversation_messages(cid);
  exception when no_data_found then denied := true; end;
  if not denied then raise exception 'stranger read conversation_messages'; end if;
  denied := false;
  begin insert into public.messages (conversation_id, sender_id, body) values (cid, c, 'intrude');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'stranger sent into a conversation'; end if;
  -- Stranger cannot read receipts either.
  select count(*) into cnt from public.message_read_receipts;
  if cnt <> 0 then raise exception 'stranger sees % receipts (expected 0)', cnt; end if;
  reset role;

  -- A: 1 unread (B's "hey"); receipt visibility; edit own; cannot edit B's.
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.unread_message_count() <> 1 then raise exception 'A total unread <> 1'; end if;
  -- A can see B's receipt on A's message.
  select count(*) into cnt from public.message_read_receipts;
  if cnt < 1 then raise exception 'A cannot see receipts in own conversation'; end if;
  -- Edit own message.
  update public.messages set body = 'hi (edited)', edited_at = now() where id = m_hi;
  get diagnostics cnt = row_count;
  if cnt <> 1 then raise exception 'A could not edit own message'; end if;
  -- Cannot edit B's message (RLS filters to 0 rows).
  update public.messages set body = 'hacked' where id = m_hey;
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'A edited another user''s message'; end if;
  -- Soft-delete own message → blanked in the RPC.
  update public.messages set deleted_at = now() where id = m_hi;
  select is_deleted, (body = '') into v_del, v_blank
  from public.conversation_messages(cid) where message_id = m_hi;
  if not coalesce(v_del, false) or not coalesce(v_blank, false) then
    raise exception 'soft-deleted message not blanked (deleted=% blank=%)', v_del, v_blank;
  end if;
  reset role;

  -- Block: B blocks A → A cannot send or open a new conversation.
  perform set_config('request.jwt.claims',
    json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.blocks (blocker_id, blocked_user_id) values (b, a);
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin insert into public.messages (conversation_id, sender_id, body) values (cid, a, 'after block');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'blocked user still sent a message'; end if;
  denied := false;
  begin perform public.create_direct_conversation(b);
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'blocked user opened a new conversation'; end if;
  reset role;

  -- Anonymous: no access to messaging tables.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  denied := false;
  begin perform 1 from public.conversations;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon read conversations'; end if;
  reset role;

  delete from auth.users where id in (a, b, c);
  raise notice 'Phase 5 messaging checks passed.';
end $$;
