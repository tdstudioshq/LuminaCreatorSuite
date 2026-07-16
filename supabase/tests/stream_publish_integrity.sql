-- ============================================================================
-- CABANA — Stream publish integrity (20260541) behavioral checks
-- ============================================================================
-- Proves the two database-authoritative Stream invariants, WITHOUT touching
-- Cloudflare (database-only rows; fake 32-hex uids from md5(); self-cleaning):
--
--   A. Publish-readiness trigger on posts
--    1. owner publishes an image-only post (no stream media) — allowed
--    2. owner publishes a post with a genuinely READY stream video — allowed
--    3. raw publish of a post with a pending_upload video — BLOCKED
--    4. raw publish with a processing video — BLOCKED
--    5. raw publish with an errored video — BLOCKED
--    6. a failed publish leaves the post as draft (atomic, no partial write)
--    7. the same publish path the server action uses works once ready
--       (draft → published on the ready video)
--    8. a non-owner cannot publish another creator's post (RLS no-op)
--    9. editing an ALREADY-published post whose video LATER errored is NOT
--       blocked (the gate is transition-only, never a permanent lock)
--   10. a cloudflare-stream media row can NEVER exist without a lifecycle row
--       (composite FK) or without a provider uid (NOT NULL) — the "missing
--       lifecycle / missing provider identity" cases are prevented upstream,
--       and the trigger's not-exists clause is the belt behind them
--
--   B. Narrowed stream_videos INSERT grant
--   11. a creator CANNOT raw-insert a forged status='ready' row (42501)
--   12. a creator CANNOT raw-insert a forged ready_at / dimensions / error row
--   13. a creator STILL cannot UPDATE status directly (no grant — re-assert)
--   14. the legitimate 4-column upload-ticket insert still works
--   15. the trusted webhook lifecycle transition (service_role) still works
--   16. the INSERT grant covers EXACTLY the four ticket columns, and no
--       provider-controlled column
--
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users
where email in ('spi_a@example.com', 'spi_b@example.com');

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_profile_a uuid;
  v_profile_b uuid;
  v_post_img uuid;
  v_post_vid uuid;
  v_post_late uuid;
  v_sv uuid;
  v_sv_late uuid;
  v_status public.post_status;
  cnt int;
  denied boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_a, 'spi_a@example.com', '{"name":"SpiA"}'::jsonb),
    (v_b, 'spi_b@example.com', '{"name":"SpiB"}'::jsonb);

  select id into v_profile_a from public.creator_profiles where user_id = v_a;
  select id into v_profile_b from public.creator_profiles where user_id = v_b;
  if v_profile_a is null or v_profile_b is null then
    raise exception 'FAIL: setup — creator profiles were not provisioned';
  end if;

  -- ========================================================================
  -- A. Publish-readiness trigger
  -- ========================================================================
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- --- (1) image-only post publishes cleanly ---------------------------------
  insert into public.posts (creator_profile_id, caption, visibility, status)
    values (v_profile_a, 'image only', 'public', 'draft')
    returning id into v_post_img;
  -- an ordinary image media row (Supabase bucket) must not trip the gate
  insert into public.post_media
      (post_id, owner_user_id, kind, storage_bucket, storage_path, position)
    values (v_post_img, v_a, 'image', 'post-media',
            v_a || '/' || v_post_img || '/a.jpg', 0);
  update public.posts set status = 'published', published_at = now()
   where id = v_post_img;
  select status into v_status from public.posts where id = v_post_img;
  if v_status <> 'published' then
    raise exception 'FAIL: (1) image-only post did not publish (got %)', v_status;
  end if;

  -- --- set up a draft post with a stream video (pending_upload) ---------------
  insert into public.stream_videos
      (uid, owner_user_id, creator_profile_id, upload_expires_at)
    values (md5('spi_video'), v_a, v_profile_a, now() + interval '60 minutes')
    returning id into v_sv;
  insert into public.posts (creator_profile_id, caption, visibility, status)
    values (v_profile_a, 'video post', 'public', 'draft')
    returning id into v_post_vid;
  insert into public.post_media
      (post_id, owner_user_id, kind, storage_bucket, storage_path,
       processing_status, stream_video_id, position)
    values (v_post_vid, v_a, 'video', 'cloudflare-stream',
            v_a || '/stream/' || md5('spi_video'), 'processing', v_sv, 0);

  -- --- (3) pending_upload video blocks publish -------------------------------
  denied := false;
  begin
    update public.posts set status = 'published', published_at = now()
     where id = v_post_vid;
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (3) published a post whose video was pending_upload';
  end if;

  -- --- (6) the failed publish left the post as draft --------------------------
  select status into v_status from public.posts where id = v_post_vid;
  if v_status <> 'draft' then
    raise exception 'FAIL: (6) a blocked publish left status = % (expected draft)', v_status;
  end if;

  -- --- (4) processing video blocks publish ------------------------------------
  set local role service_role;
  update public.stream_videos set status = 'processing' where id = v_sv;
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin
    update public.posts set status = 'published', published_at = now()
     where id = v_post_vid;
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (4) published a post whose video was processing';
  end if;

  -- --- (5) errored video blocks publish ---------------------------------------
  set local role service_role;
  update public.stream_videos set status = 'error', error_code = 'ENCODE_FAIL'
   where id = v_sv;
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin
    update public.posts set status = 'published', published_at = now()
     where id = v_post_vid;
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (5) published a post whose video had errored';
  end if;

  -- --- (2)(7)(15) ready video: webhook flip, then publish succeeds ------------
  set local role service_role;             -- (15) trusted lifecycle transition
  update public.stream_videos
     set status = 'ready', ready_at = now(), duration_seconds = 5, width = 1280, height = 720
   where id = v_sv;
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.posts set status = 'published', published_at = now()   -- (7) app path
   where id = v_post_vid;
  select status into v_status from public.posts where id = v_post_vid;
  if v_status <> 'published' then          -- (2) ready media is publishable
    raise exception 'FAIL: (2) a post with a READY video did not publish (got %)', v_status;
  end if;

  -- --- (9) transition-only: a later error must not lock editing ---------------
  -- Mirror the lifecycle writer: a ready→error transition clears ready_at
  -- (the stream_videos_ready_at_coherent constraint forbids ready_at on a
  -- non-ready row).
  set local role service_role;
  update public.stream_videos set status = 'error', ready_at = null where id = v_sv;
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- The post is already published; editing it (status stays published) must NOT
  -- re-run the readiness gate, or a post-publish encode failure would brick the
  -- creator's ability to edit their own live post.
  update public.posts set caption = 'edited after publish' where id = v_post_vid;
  if (select caption from public.posts where id = v_post_vid) <> 'edited after publish' then
    raise exception 'FAIL: (9) editing an already-published post was wrongly blocked';
  end if;

  -- --- (8) a non-owner cannot publish someone else's post ---------------------
  -- Build the fixture as A (still the current role): a draft owned by A with a
  -- processing video. Then attempt the publish as B. RLS filters the row out, so
  -- B's UPDATE is a 0-row no-op (not an error) — the proof is A's post stays draft.
  insert into public.stream_videos
      (uid, owner_user_id, creator_profile_id, upload_expires_at)
    values (md5('spi_late'), v_a, v_profile_a, now() + interval '60 minutes')
    returning id into v_sv_late;
  insert into public.posts (creator_profile_id, caption, visibility, status)
    values (v_profile_a, 'A owned', 'public', 'draft')
    returning id into v_post_late;
  insert into public.post_media
      (post_id, owner_user_id, kind, storage_bucket, storage_path,
       processing_status, stream_video_id, position)
    values (v_post_late, v_a, 'video', 'cloudflare-stream',
            v_a || '/stream/' || md5('spi_late'), 'processing', v_sv_late, 0);
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.posts set status = 'published', published_at = now()
   where id = v_post_late;               -- 0 rows: RLS filters A's post from B
  reset role;
  select status into v_status from public.posts where id = v_post_late;
  if v_status <> 'draft' then
    raise exception 'FAIL: (8) a non-owner published another creator''s post (got %)', v_status;
  end if;

  -- --- (10) missing lifecycle row / provider identity are impossible upstream --
  -- The composite FK forbids a cloudflare-stream media row without a real
  -- stream_videos row, and uid is NOT NULL, so the "missing" cases the trigger
  -- fails closed on cannot be constructed. Prove the FK still bites.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin
    insert into public.post_media
        (post_id, owner_user_id, kind, storage_bucket, storage_path,
         stream_video_id, position)
      values (v_post_late, v_a, 'video', 'cloudflare-stream',
              v_a || '/stream/' || md5('ghost'), gen_random_uuid(), 9);
  exception when others then
    denied := true;                        -- FK: no such stream_videos row
  end;
  if not denied then
    raise exception 'FAIL: (10) attached cloudflare-stream media to a non-existent video';
  end if;

  -- ========================================================================
  -- B. Narrowed stream_videos INSERT grant
  -- ========================================================================
  -- --- (11) forged status='ready' is rejected at the privilege layer ----------
  denied := false;
  begin
    insert into public.stream_videos
        (uid, owner_user_id, creator_profile_id, status)
      values (md5('forge_ready'), v_a, v_profile_a, 'ready');
  exception when others then
    denied := true;                        -- 42501: no INSERT on column status
  end;
  if not denied then
    raise exception 'FAIL: (11) a creator raw-inserted a forged status=ready row';
  end if;

  -- --- (12) forged ready_at / dimensions / error are likewise rejected ---------
  denied := false;
  begin
    insert into public.stream_videos
        (uid, owner_user_id, creator_profile_id, ready_at)
      values (md5('forge_ts'), v_a, v_profile_a, now());
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (12a) a creator forged ready_at on insert';
  end if;
  denied := false;
  begin
    insert into public.stream_videos
        (uid, owner_user_id, creator_profile_id, width, height)
      values (md5('forge_dim'), v_a, v_profile_a, 1920, 1080);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (12b) a creator forged dimensions on insert';
  end if;

  -- --- (13) direct UPDATE of status is still refused (no grant) ----------------
  denied := false;
  begin
    update public.stream_videos set status = 'ready' where id = v_sv_late;
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: (13) a creator updated stream video status directly';
  end if;

  -- --- (14) the legitimate 4-column ticket insert still works -----------------
  insert into public.stream_videos
      (uid, owner_user_id, creator_profile_id, upload_expires_at)
    values (md5('legit_ticket'), v_a, v_profile_a, now() + interval '60 minutes');
  if not exists (
    select 1 from public.stream_videos
    where uid = md5('legit_ticket') and status = 'pending_upload'
  ) then
    raise exception 'FAIL: (14) the legitimate ticket insert did not land as pending_upload';
  end if;
  reset role;

  -- --- (16) the INSERT grant covers EXACTLY the four ticket columns -----------
  select count(*) into cnt from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'stream_videos'
     and grantee = 'authenticated' and privilege_type = 'INSERT';
  if cnt <> 4 then
    raise exception 'FAIL: (16a) authenticated INSERT grant covers % columns (expected 4)', cnt;
  end if;
  if exists (
    select 1 from information_schema.role_column_grants
     where table_schema = 'public' and table_name = 'stream_videos'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
       and column_name not in ('uid', 'owner_user_id', 'creator_profile_id', 'upload_expires_at')
  ) then
    raise exception 'FAIL: (16b) authenticated can INSERT a provider-controlled column';
  end if;
  -- The grant is column-scoped, so the TABLE-level insert signal is now gone
  -- (has_table_privilege does not roll up column grants) — the column privilege
  -- is what remains, and that is exactly the narrowing this migration makes.
  if has_table_privilege('authenticated', 'public.stream_videos', 'insert') then
    raise exception 'FAIL: (16c) authenticated still holds a table-wide INSERT on stream_videos';
  end if;
  if not has_column_privilege('authenticated', 'public.stream_videos', 'uid', 'insert') then
    raise exception 'FAIL: (16d) authenticated lost the legitimate column-scoped INSERT';
  end if;

  raise notice 'stream_publish_integrity: all checks passed.';
end $$;

delete from auth.users
where email in ('spi_a@example.com', 'spi_b@example.com');

select 'stream_publish_integrity checks passed' as result;
