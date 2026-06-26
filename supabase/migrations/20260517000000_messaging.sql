-- ============================================================================
-- CABANA — Phase 5: Messaging foundation
-- ============================================================================
-- Direct (1:1) conversations, messages, and read receipts with participant-
-- scoped RLS and Supabase Realtime. Purely additive.
--
-- NOT in this phase: paid messages, tips, attachments (image/video), and
-- notifications/push. The `message_type` enum carries `image`/`video`/`paid`/
-- `tip` values for forward-compatibility, but only `text` (user) and `system`
-- (server) are writable now.
--
-- RLS note: participant checks run through SECURITY DEFINER helpers
-- (`is_conversation_participant`, …) to avoid the classic
-- conversation_participants ⇄ policy recursion. Conversation creation and all
-- aggregate reads go through SECURITY DEFINER RPCs that derive the actor from
-- auth.uid() and expose no UUIDs beyond conversation/message ids.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enum
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.message_type as enum ('text', 'system', 'image', 'video', 'paid', 'tip');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  constraint conversation_participants_unique unique (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  message_type public.message_type not null default 'text',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messages_body_length check (char_length(body) <= 4000)
);

create table if not exists public.message_read_receipts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  reader_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  constraint message_read_receipts_unique unique (message_id, reader_id)
);

create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index if not exists message_read_receipts_reader_idx
  on public.message_read_receipts (reader_id);

drop trigger if exists touch_conversations_updated_at on public.conversations;
create trigger touch_conversations_updated_at
  before update on public.conversations
  for each row execute function public.touch_updated_at();

-- Bump the parent conversation's updated_at when a message arrives (drives inbox
-- ordering). SECURITY DEFINER so a participant's insert can touch the row.
create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists bump_conversation_after_message on public.messages;
create trigger bump_conversation_after_message
  after insert on public.messages
  for each row execute function public.bump_conversation_on_message();

-- ----------------------------------------------------------------------------
-- 2. Participant / block helpers (SECURITY DEFINER — break RLS recursion)
-- ----------------------------------------------------------------------------
create or replace function public.is_conversation_participant(_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = _conversation_id and p.user_id = (select auth.uid())
  )
$$;

-- True if a block exists (either direction) between the caller and any other
-- participant of the conversation.
create or replace function public.is_conversation_blocked(_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    join public.blocks b
      on (b.blocker_id = (select auth.uid()) and b.blocked_user_id = cp.user_id)
      or (b.blocker_id = cp.user_id and b.blocked_user_id = (select auth.uid()))
    where cp.conversation_id = _conversation_id
      and cp.user_id <> (select auth.uid())
  )
$$;

create or replace function public.is_message_in_my_conversation(_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.messages m
    join public.conversation_participants p on p.conversation_id = m.conversation_id
    where m.id = _message_id and p.user_id = (select auth.uid())
  )
$$;

revoke execute on function public.is_conversation_participant(uuid) from public, anon;
revoke execute on function public.is_conversation_blocked(uuid) from public, anon;
revoke execute on function public.is_message_in_my_conversation(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
grant execute on function public.is_conversation_blocked(uuid) to authenticated;
grant execute on function public.is_message_in_my_conversation(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS + base privileges (all messaging is private — anon fully revoked)
-- ----------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_read_receipts enable row level security;

create policy "Participants read own conversations"
  on public.conversations for select
  using ((select public.is_conversation_participant(id)));

create policy "Participants read conversation roster"
  on public.conversation_participants for select
  using ((select public.is_conversation_participant(conversation_id)));

create policy "Participants read conversation messages"
  on public.messages for select
  using ((select public.is_conversation_participant(conversation_id)));

-- Send: only as yourself, only inside your conversation, only text, never across
-- a block.
create policy "Participants send messages"
  on public.messages for insert
  with check (
    sender_id = (select auth.uid())
    and message_type = 'text'
    and (select public.is_conversation_participant(conversation_id))
    and not (select public.is_conversation_blocked(conversation_id))
  );

-- Edit / soft-delete only your own messages.
create policy "Senders update own messages"
  on public.messages for update
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

create policy "Participants read receipts"
  on public.message_read_receipts for select
  using ((select public.is_message_in_my_conversation(message_id)));

create policy "Participants create own receipts"
  on public.message_read_receipts for insert
  with check (
    reader_id = (select auth.uid())
    and (select public.is_message_in_my_conversation(message_id))
  );

grant select on public.conversations to authenticated;
grant select on public.conversation_participants to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select, insert on public.message_read_receipts to authenticated;
revoke all on public.conversations from anon;
revoke all on public.conversation_participants from anon;
revoke all on public.messages from anon;
revoke all on public.message_read_receipts from anon;

-- ----------------------------------------------------------------------------
-- 4. RPCs (actor derived from auth.uid(); ID-free safe identity)
-- ----------------------------------------------------------------------------
-- Find-or-create a 1:1 conversation with another user. Rejects self and any
-- block (either direction). New conversations cannot be opened across a block.
create or replace function public.create_direct_conversation(_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cid uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if _other_user_id = v_uid then
    raise exception 'You cannot message yourself' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.profiles where id = _other_user_id) then
    raise exception 'Recipient not found' using errcode = 'no_data_found';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_uid and b.blocked_user_id = _other_user_id)
       or (b.blocker_id = _other_user_id and b.blocked_user_id = v_uid)
  ) then
    raise exception 'Messaging is unavailable with this user' using errcode = 'check_violation';
  end if;

  select c.id into v_cid
  from public.conversations c
  where exists (select 1 from public.conversation_participants p
                where p.conversation_id = c.id and p.user_id = v_uid)
    and exists (select 1 from public.conversation_participants p
                where p.conversation_id = c.id and p.user_id = _other_user_id)
    and (select count(*) from public.conversation_participants p where p.conversation_id = c.id) = 2
  limit 1;

  if v_cid is not null then
    return v_cid;
  end if;

  insert into public.conversations default values returning id into v_cid;
  insert into public.conversation_participants (conversation_id, user_id)
    values (v_cid, v_uid), (v_cid, _other_user_id);
  return v_cid;
end;
$$;

-- Username-based entry point (the public creator page exposes a handle, not a
-- UUID). Resolves a creator handle or member username to a user id, then
-- find-or-creates the 1:1 conversation via create_direct_conversation.
create or replace function public.start_conversation_with_username(_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select cp.user_id into v_other
  from public.creator_profiles cp
  where lower(cp.handle) = lower(btrim(_username)) and cp.user_id is not null
  limit 1;

  if v_other is null then
    select mp.user_id into v_other
    from public.member_profiles mp
    where lower(mp.username) = lower(btrim(_username))
    limit 1;
  end if;

  if v_other is null then
    raise exception 'Recipient not found' using errcode = 'no_data_found';
  end if;

  return public.create_direct_conversation(v_other);
end;
$$;

-- The caller's conversations with the other party's safe identity, a last-message
-- preview, and the caller's unread count. Ordered by recency.
create or replace function public.list_conversations()
returns table (
  conversation_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  last_message_preview text,
  last_message_type public.message_type,
  last_message_at timestamptz,
  unread_count bigint,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    c.id,
    coalesce(mp.username, cp.handle),
    coalesce(mp.display_name, cp.name, pr.name),
    coalesce(mp.avatar_url, cp.avatar_url),
    case
      when lm.deleted_at is not null then ''
      else left(lm.body, 140)
    end,
    lm.message_type,
    lm.created_at,
    (
      select count(*) from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> v_uid
        and m.deleted_at is null
        and not exists (
          select 1 from public.message_read_receipts r
          where r.message_id = m.id and r.reader_id = v_uid
        )
    ),
    c.updated_at
  from public.conversations c
  join public.conversation_participants me
    on me.conversation_id = c.id and me.user_id = v_uid
  join public.conversation_participants other
    on other.conversation_id = c.id and other.user_id <> v_uid
  join public.profiles pr on pr.id = other.user_id
  left join public.member_profiles mp on mp.user_id = other.user_id
  left join public.creator_profiles cp on cp.user_id = other.user_id
  left join lateral (
    select m.body, m.message_type, m.created_at, m.deleted_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  order by c.updated_at desc;
end;
$$;

-- The other party's safe identity for one conversation (participant-gated).
create or replace function public.conversation_header(_conversation_id uuid)
returns table (
  conversation_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_conversation_participant(_conversation_id) then
    raise exception 'Conversation not found' using errcode = 'no_data_found';
  end if;

  return query
  select
    _conversation_id,
    coalesce(mp.username, cp.handle),
    coalesce(mp.display_name, cp.name, pr.name),
    coalesce(mp.avatar_url, cp.avatar_url)
  from public.conversation_participants other
  join public.profiles pr on pr.id = other.user_id
  left join public.member_profiles mp on mp.user_id = other.user_id
  left join public.creator_profiles cp on cp.user_id = other.user_id
  where other.conversation_id = _conversation_id and other.user_id <> v_uid
  limit 1;
end;
$$;

-- Messages for a conversation (participant-gated). Deleted messages are blanked.
create or replace function public.conversation_messages(
  _conversation_id uuid,
  _cursor timestamptz default null,
  _limit integer default 50
)
returns table (
  message_id uuid,
  sender_username text,
  sender_display_name text,
  sender_avatar_url text,
  body text,
  message_type public.message_type,
  mine boolean,
  is_deleted boolean,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_conversation_participant(_conversation_id) then
    raise exception 'Conversation not found' using errcode = 'no_data_found';
  end if;

  return query
  select
    m.id,
    coalesce(mp.username, cp.handle),
    coalesce(mp.display_name, cp.name, pr.name),
    coalesce(mp.avatar_url, cp.avatar_url),
    case when m.deleted_at is not null then '' else m.body end,
    m.message_type,
    (m.sender_id = v_uid),
    (m.deleted_at is not null),
    m.created_at,
    m.edited_at
  from public.messages m
  join public.profiles pr on pr.id = m.sender_id
  left join public.member_profiles mp on mp.user_id = m.sender_id
  left join public.creator_profiles cp on cp.user_id = m.sender_id
  where m.conversation_id = _conversation_id
    and (_cursor is null or m.created_at < _cursor)
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(_limit, 50), 100));
end;
$$;

-- Mark all of the other party's undeleted messages in a conversation as read.
create or replace function public.mark_conversation_read(_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_conversation_participant(_conversation_id) then
    raise exception 'Conversation not found' using errcode = 'no_data_found';
  end if;

  insert into public.message_read_receipts (message_id, reader_id)
  select m.id, v_uid
  from public.messages m
  where m.conversation_id = _conversation_id
    and m.sender_id <> v_uid
    and m.deleted_at is null
  on conflict (message_id, reader_id) do nothing;
end;
$$;

-- Total unread messages across all of the caller's conversations.
create or replace function public.unread_message_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.messages m
  join public.conversation_participants p
    on p.conversation_id = m.conversation_id and p.user_id = (select auth.uid())
  where m.sender_id <> (select auth.uid())
    and m.deleted_at is null
    and not exists (
      select 1 from public.message_read_receipts r
      where r.message_id = m.id and r.reader_id = (select auth.uid())
    )
$$;

revoke execute on function public.create_direct_conversation(uuid) from public, anon;
revoke execute on function public.start_conversation_with_username(text) from public, anon;
revoke execute on function public.list_conversations() from public, anon;
revoke execute on function public.conversation_header(uuid) from public, anon;
revoke execute on function public.conversation_messages(uuid, timestamptz, integer) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.unread_message_count() from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
grant execute on function public.start_conversation_with_username(text) to authenticated;
grant execute on function public.list_conversations() to authenticated;
grant execute on function public.conversation_header(uuid) to authenticated;
grant execute on function public.conversation_messages(uuid, timestamptz, integer) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.unread_message_count() to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Realtime — publish messages + receipts (RLS still gates delivery)
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.message_read_receipts;
exception when duplicate_object then null;
end $$;
