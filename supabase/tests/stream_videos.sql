-- ============================================================================
-- CABANA — Cloudflare Stream DB contract (20260536) behavioral checks
-- ============================================================================
-- Proves the stream_videos ownership + lifecycle model and the post_media
-- linkage, WITHOUT touching Cloudflare (database-only temporary rows; fake
-- 32-hex uids from md5(); everything cleaned up at the end):
--    1. anon cannot SELECT stream_videos
--    2. anon cannot INSERT
--    3. a member (non-creator) cannot INSERT
--    4. creator A can INSERT an owned row
--    5. creator A sees their own row
--    6. creator B cannot see A's row
--    7. creator B cannot DELETE A's row
--    8. a creator cannot UPDATE status directly (no grant, no policy)
--    9. service_role can update status/metadata (stream_videos AND the
--       column-scoped post_media.processing_status)
--   10. A can attach their own stream video to their own post
--   11. B cannot attach A's stream video to B's post (composite FK)
--   12. B cannot attach B's own stream video to A's post (20260533 WITH CHECK)
--   13. bucket 'cloudflare-stream' without stream_video_id fails (coherence)
--   14. stream_video_id with bucket 'post-media' fails (coherence)
--   15. one stream video cannot be attached twice at a time (partial unique index)
--   16. existing image post_media rows still insert and read normally
--   17. deleting a post cascades its post_media rows
--   18. after post deletion the stream_videos row SURVIVES, unattached
--       (intended lifecycle: it becomes an orphan-sweep candidate)
--   19. deleting a stream_videos row cascades its attached post_media row
--       (render metadata only), leaving the post itself intact
--   20. the 20260533 cross-post/foreign-folder protections still hold
--   21. object grants match the least-privilege model
--   22. post_media has exactly its pre-existing policy set (nothing changed)
--
-- Why the numeric CHECKs are >= 0 (not > 0): the pure parser maps Cloudflare's
-- documented -1 "unknown" sentinels to NULL, so >= 0 pins everything the app
-- can write while guaranteeing an undocumented zero-dimension payload can
-- never stall a webhook ready-flip. A stalled lifecycle is user-visible; a
-- stored zero is cosmetic junk.
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in ('stream_a@example.com', 'stream_b@example.com', 'stream_m@example.com');

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_m uuid := gen_random_uuid();
  v_profile_a uuid;
  v_profile_b uuid;
  v_post_a uuid;
  v_post_a2 uuid;
  v_post_b uuid;
  v_sv_a uuid;
  v_sv_a2 uuid;
  v_sv_b uuid;
  v_media uuid;
  v_status public.stream_video_status;
  cnt int;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_a, 'stream_a@example.com', '{"name":"StreamA"}'::jsonb),
    (v_b, 'stream_b@example.com', '{"name":"StreamB"}'::jsonb),
    (v_m, 'stream_m@example.com', '{"name":"StreamM","account_type":"member"}'::jsonb);

  select id into v_profile_a from public.creator_profiles where user_id = v_a;
  select id into v_profile_b from public.creator_profiles where user_id = v_b;
  if v_profile_a is null or v_profile_b is null then
    raise exception 'FAIL: setup — creator profiles were not provisioned';
  end if;
  if exists (select 1 from public.creator_profiles where user_id = v_m) then
    raise exception 'FAIL: setup — member unexpectedly has a creator profile';
  end if;

  -- --- (1)(2) anon: no read, no insert ---------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  denied := false;
  begin
    perform 1 from public.stream_videos;
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (1) anon can SELECT stream_videos';
  end if;
  denied := false;
  begin
    insert into public.stream_videos (uid, owner_user_id, creator_profile_id)
      values (md5('anon_try'), v_a, v_profile_a);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (2) anon can INSERT into stream_videos';
  end if;
  reset role;

  -- --- (3) member (non-creator) cannot INSERT --------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_m::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin
    insert into public.stream_videos (uid, owner_user_id, creator_profile_id)
      values (md5('member_try'), v_m, v_profile_a);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (3) a member inserted a stream video row';
  end if;
  reset role;

  -- --- (4)(5) creator A inserts + reads own rows ------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.stream_videos (uid, owner_user_id, creator_profile_id, upload_expires_at)
    values (md5('stream_a_1'), v_a, v_profile_a, now() + interval '60 minutes')
    returning id into v_sv_a;
  insert into public.stream_videos (uid, owner_user_id, creator_profile_id)
    values (md5('stream_a_2'), v_a, v_profile_a)
    returning id into v_sv_a2;
  if v_sv_a is null or v_sv_a2 is null then
    raise exception 'FAIL: (4) creator A could not insert own stream video rows';
  end if;

  -- A cannot declare someone else as owner (WITH CHECK owner = auth.uid()).
  denied := false;
  begin
    insert into public.stream_videos (uid, owner_user_id, creator_profile_id)
      values (md5('spoof_owner'), v_b, v_profile_a);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (4b) creator A inserted a row owned by someone else';
  end if;

  -- A cannot claim B's creator profile on an owned row.
  denied := false;
  begin
    insert into public.stream_videos (uid, owner_user_id, creator_profile_id)
      values (md5('spoof_profile'), v_a, v_profile_b);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (4c) creator A inserted a row claiming B''s creator profile';
  end if;

  select count(*) into cnt from public.stream_videos;
  if cnt <> 2 then
    raise exception 'FAIL: (5) creator A sees % stream video rows (expected exactly own 2)', cnt;
  end if;

  -- --- (8) creator cannot UPDATE status directly ------------------------------
  denied := false;
  begin
    update public.stream_videos set status = 'ready' where id = v_sv_a;
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (8) creator updated stream video status directly';
  end if;

  -- --- A authors posts and attaches media ------------------------------------
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_a, 'A stream post', 'public', 'published', now())
    returning id into v_post_a;
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_a, 'A second post', 'public', 'published', now())
    returning id into v_post_a2;

  -- (10) A attaches their own stream video to their own post.
  insert into public.post_media
      (post_id, owner_user_id, kind, storage_bucket, storage_path, processing_status,
       stream_video_id, position)
    values (v_post_a, v_a, 'video', 'cloudflare-stream',
            v_a || '/stream/' || md5('stream_a_1'), 'processing', v_sv_a, 0)
    returning id into v_media;
  if v_media is null then
    raise exception 'FAIL: (10) creator A could not attach own stream video to own post';
  end if;

  -- (13) Sentinel bucket WITHOUT the FK is incoherent.
  denied := false;
  begin
    insert into public.post_media
        (post_id, owner_user_id, kind, storage_bucket, storage_path, position)
      values (v_post_a, v_a, 'video', 'cloudflare-stream',
              v_a || '/stream/' || md5('no_fk'), 1);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (13) cloudflare-stream bucket accepted without stream_video_id';
  end if;

  -- (14) The FK WITHOUT the sentinel bucket is incoherent (no masquerading).
  denied := false;
  begin
    insert into public.post_media
        (post_id, owner_user_id, kind, storage_bucket, storage_path, stream_video_id, position)
      values (v_post_a, v_a, 'video', 'post-media',
              v_a || '/' || v_post_a || '/fake.mp4', v_sv_a2, 1);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (14) a stream row masqueraded as a Supabase Storage row';
  end if;

  -- (15) The same stream video cannot attach twice.
  denied := false;
  begin
    insert into public.post_media
        (post_id, owner_user_id, kind, storage_bucket, storage_path, processing_status,
         stream_video_id, position)
      values (v_post_a2, v_a, 'video', 'cloudflare-stream',
              v_a || '/stream/' || md5('stream_a_1'), 'processing', v_sv_a, 0);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (15) one stream video attached to two media rows';
  end if;

  -- (16) Plain image rows still insert and read exactly as before.
  insert into public.post_media (post_id, owner_user_id, kind, storage_path, position)
    values (v_post_a2, v_a, 'image', v_a || '/' || v_post_a2 || '/photo.jpg', 0);
  select count(*) into cnt from public.post_media where post_id = v_post_a2 and kind = 'image';
  if cnt <> 1 then
    raise exception 'FAIL: (16) image post_media insert/read regressed (got % rows)', cnt;
  end if;

  -- (20) 20260533 regression — A cannot use a foreign storage_path prefix.
  denied := false;
  begin
    insert into public.post_media (post_id, owner_user_id, kind, storage_path, position)
      values (v_post_a2, v_a, 'image', v_b || '/' || v_post_a2 || '/foreign.jpg', 1);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (20a) foreign-folder storage_path accepted (20260533 regressed)';
  end if;

  reset role;

  -- --- creator B: isolation + attack matrix -----------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- (6) B sees none of A's rows.
  select count(*) into cnt from public.stream_videos;
  if cnt <> 0 then
    raise exception 'FAIL: (6) creator B sees % of A''s stream video rows', cnt;
  end if;

  -- (7) B's delete of A's row affects nothing.
  delete from public.stream_videos where id = v_sv_a2;

  -- B provisions their own post + stream video for the attack matrix.
  insert into public.posts (creator_profile_id, caption, visibility, status, published_at)
    values (v_profile_b, 'B post', 'public', 'published', now())
    returning id into v_post_b;
  insert into public.stream_videos (uid, owner_user_id, creator_profile_id)
    values (md5('stream_b_1'), v_b, v_profile_b)
    returning id into v_sv_b;

  -- (11) B cannot attach A's stream video to B's own post: the 20260533 policy
  -- passes (B owns the post, B-prefixed path) — the COMPOSITE FK is what stops
  -- it, because (v_sv_a2, v_b) does not exist in stream_videos(id, owner).
  denied := false;
  begin
    insert into public.post_media
        (post_id, owner_user_id, kind, storage_bucket, storage_path, processing_status,
         stream_video_id, position)
      values (v_post_b, v_b, 'video', 'cloudflare-stream',
              v_b || '/stream/' || md5('stream_a_2'), 'processing', v_sv_a2, 0);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (11) creator B attached A''s stream video to B''s post';
  end if;

  -- (12) B cannot attach B's own stream video to A's post (20260533 WITH CHECK:
  -- caller must own the target post).
  denied := false;
  begin
    insert into public.post_media
        (post_id, owner_user_id, kind, storage_bucket, storage_path, processing_status,
         stream_video_id, position)
      values (v_post_a, v_b, 'video', 'cloudflare-stream',
              v_b || '/stream/' || md5('stream_b_1'), 'processing', v_sv_b, 5);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (12) creator B attached a stream video to A''s post';
  end if;

  -- (20b) 20260533 regression — B still cannot inject an image into A's post.
  denied := false;
  begin
    insert into public.post_media (post_id, owner_user_id, kind, storage_path, position)
      values (v_post_a, v_b, 'image', v_b || '/' || v_post_a || '/inject.jpg', 6);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (20b) cross-post image injection succeeded (20260533 regressed)';
  end if;

  reset role;

  -- (7 verified) A's row survived B's delete attempt.
  if not exists (select 1 from public.stream_videos where id = v_sv_a2) then
    raise exception 'FAIL: (7) creator B deleted A''s stream video row';
  end if;

  -- --- (9) service_role lifecycle writes --------------------------------------
  set local role service_role;
  update public.stream_videos
     set status = 'ready', duration_seconds = 5.5, size_bytes = 4190963,
         width = 1280, height = 720, ready_at = now()
   where id = v_sv_a;
  update public.post_media set processing_status = 'ready', width = 1280, height = 720
   where id = v_media;
  reset role;

  select status into v_status from public.stream_videos where id = v_sv_a;
  if v_status <> 'ready' then
    raise exception 'FAIL: (9) service_role status update did not apply (got %)', v_status;
  end if;
  select count(*) into cnt from public.post_media
   where id = v_media and processing_status = 'ready';
  if cnt <> 1 then
    raise exception 'FAIL: (9b) service_role post_media.processing_status update did not apply';
  end if;

  -- --- (17)(18) post deletion: media cascades, ledger row SURVIVES ------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.posts where id = v_post_a;
  reset role;

  select count(*) into cnt from public.post_media where post_id = v_post_a;
  if cnt <> 0 then
    raise exception 'FAIL: (17) post deletion left % media rows behind', cnt;
  end if;
  if not exists (select 1 from public.stream_videos where id = v_sv_a) then
    raise exception 'FAIL: (18) stream_videos row did not survive post deletion';
  end if;
  if exists (select 1 from public.post_media where stream_video_id = v_sv_a) then
    raise exception 'FAIL: (18b) stream video still referenced after post deletion';
  end if;

  -- --- (19) stream_videos deletion cascades the attached media row ------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.post_media
      (post_id, owner_user_id, kind, storage_bucket, storage_path, processing_status,
       stream_video_id, position)
    values (v_post_a2, v_a, 'video', 'cloudflare-stream',
            v_a || '/stream/' || md5('stream_a_2'), 'processing', v_sv_a2, 2)
    returning id into v_media;
  delete from public.stream_videos where id = v_sv_a2;
  reset role;

  if exists (select 1 from public.post_media where id = v_media) then
    raise exception 'FAIL: (19) attached media row survived stream video deletion';
  end if;
  if not exists (select 1 from public.posts where id = v_post_a2) then
    raise exception 'FAIL: (19b) post was harmed by stream video deletion';
  end if;

  -- --- (21) grants: least privilege -------------------------------------------
  if has_table_privilege('anon', 'public.stream_videos', 'select')
     or has_table_privilege('anon', 'public.stream_videos', 'insert')
     or has_table_privilege('anon', 'public.stream_videos', 'update')
     or has_table_privilege('anon', 'public.stream_videos', 'delete') then
    raise exception 'FAIL: (21) anon holds a privilege on stream_videos';
  end if;
  if not (has_table_privilege('authenticated', 'public.stream_videos', 'select')
      and has_table_privilege('authenticated', 'public.stream_videos', 'insert')
      and has_table_privilege('authenticated', 'public.stream_videos', 'delete')) then
    raise exception 'FAIL: (21b) authenticated is missing select/insert/delete on stream_videos';
  end if;
  if has_table_privilege('authenticated', 'public.stream_videos', 'update') then
    raise exception 'FAIL: (21c) authenticated can UPDATE stream_videos (system-only writes)';
  end if;
  if not (has_table_privilege('service_role', 'public.stream_videos', 'select')
      and has_table_privilege('service_role', 'public.stream_videos', 'update')
      and has_table_privilege('service_role', 'public.stream_videos', 'delete')) then
    raise exception 'FAIL: (21d) service_role is missing lifecycle privileges on stream_videos';
  end if;
  -- post_media lifecycle write is COLUMN-scoped: exactly the 3 intended columns.
  select count(*) into cnt from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'post_media'
     and grantee = 'service_role' and privilege_type = 'UPDATE'
     and column_name in ('processing_status', 'width', 'height');
  if cnt <> 3 then
    raise exception 'FAIL: (21e) service_role post_media UPDATE not on the 3 columns (got %)', cnt;
  end if;
  if exists (select 1 from information_schema.role_column_grants
             where table_schema = 'public' and table_name = 'post_media'
               and grantee = 'service_role' and privilege_type = 'UPDATE'
               and column_name in ('post_id', 'owner_user_id', 'storage_path',
                                   'storage_bucket', 'stream_video_id')) then
    raise exception 'FAIL: (21f) service_role can UPDATE post_media linkage/path columns';
  end if;

  -- --- (22) post_media policy set unchanged -----------------------------------
  select count(*) into cnt from pg_policies
   where schemaname = 'public' and tablename = 'post_media';
  if cnt <> 1 then
    raise exception 'FAIL: (22) post_media has % policies (expected exactly 1)', cnt;
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'post_media'
                   and policyname = 'Owners manage own post media') then
    raise exception 'FAIL: (22b) the 20260533 post_media policy is missing or renamed';
  end if;
  select count(*) into cnt from pg_policies
   where schemaname = 'public' and tablename = 'stream_videos';
  if cnt <> 3 then
    raise exception 'FAIL: (22c) stream_videos has % policies (expected 3)', cnt;
  end if;

  raise notice 'stream_videos checks passed';

  delete from auth.users where id in (v_a, v_b, v_m);
end $$;
