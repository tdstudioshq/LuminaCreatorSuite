-- ============================================================================
-- CABANA — analytics_events hardening (20260535) behavioral checks
-- ============================================================================
-- Proves the abuse/integrity hardening while preserving legitimate tracking:
--   1. legitimate anon insert using only the allowed columns succeeds,
--   2. anon cannot provide a custom id,
--   3. anon cannot provide a custom created_at,
--   4. authenticated cannot provide a custom id or created_at,
--   5. generated id + created_at are populated by defaults,
--   6. unknown event_type fails,
--   7. non-object metadata fails,
--   8. oversized metadata fails,
--   9. oversized target_id fails,
--   10. invalid/nonexistent profile target fails,
--   11. existing owner analytics READS still work,
--   12. the (profile_id, created_at desc) index exists with the intended order,
--   13. no unrelated policies/grants changed: client INSERT is column-scoped to
--       the four columns (NOT table-wide), authenticated SELECT + both RLS
--       policies unchanged.
-- Self-cleaning; any failed assertion exits non-zero.
-- ============================================================================

delete from auth.users where email in ('ae_owner@example.com');

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_profile uuid;
  denied boolean;
  cnt int;
  idxdef text;
  v_id uuid;
  v_created timestamptz;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_owner, 'ae_owner@example.com', '{"name":"Owner"}'::jsonb);
  select id into v_profile from public.creator_profiles where user_id = v_owner;

  -- ============ anon =============
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;

  -- (1) legitimate anon insert using only allowed columns.
  insert into public.analytics_events (event_type, profile_id, target_id, metadata)
    values ('page_view', v_profile, null, jsonb_build_object('handle','owner'));
  insert into public.analytics_events (event_type, profile_id, target_id)
    values ('link_click', v_profile, 'lnk_1');

  -- (2) anon cannot provide a custom id.
  denied := false;
  begin insert into public.analytics_events (id, event_type, profile_id)
        values (gen_random_uuid(), 'page_view', v_profile);
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: anon set a custom id'; end if;

  -- (3) anon cannot provide a custom created_at.
  denied := false;
  begin insert into public.analytics_events (event_type, profile_id, created_at)
        values ('page_view', v_profile, now() - interval '400 days');
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: anon set a custom created_at'; end if;

  -- (6) unknown event_type fails.
  denied := false;
  begin insert into public.analytics_events (event_type, profile_id) values ('bogus_type', v_profile);
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: unknown event_type accepted'; end if;

  -- (7) non-object metadata fails (array / scalar / string).
  denied := false;
  begin insert into public.analytics_events (event_type, profile_id, metadata)
        values ('page_view', v_profile, '[1,2,3]'::jsonb);
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: array metadata accepted'; end if;
  denied := false;
  begin insert into public.analytics_events (event_type, profile_id, metadata)
        values ('page_view', v_profile, '"a string"'::jsonb);
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: string metadata accepted'; end if;

  -- (8) oversized metadata fails.
  denied := false;
  begin insert into public.analytics_events (event_type, profile_id, metadata)
        values ('page_view', v_profile, jsonb_build_object('j', repeat('x', 100000)));
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: oversized metadata accepted'; end if;

  -- (9) oversized target_id fails.
  denied := false;
  begin insert into public.analytics_events (event_type, profile_id, target_id)
        values ('link_click', v_profile, repeat('y', 300));
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: oversized target_id accepted'; end if;

  -- (10) invalid/nonexistent profile target fails.
  denied := false;
  begin insert into public.analytics_events (event_type, profile_id)
        values ('page_view', '11111111-1111-4111-a111-111111111111');
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: nonexistent profile target accepted'; end if;
  reset role;

  -- ============ authenticated (owner) =============
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  set local role authenticated;

  -- (4) authenticated cannot provide custom id or created_at.
  denied := false;
  begin insert into public.analytics_events (id, event_type, profile_id)
        values (gen_random_uuid(), 'product_click', v_profile);
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: authenticated set a custom id'; end if;
  denied := false;
  begin insert into public.analytics_events (event_type, profile_id, created_at)
        values ('product_click', v_profile, now() - interval '400 days');
  exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: authenticated set a custom created_at'; end if;

  -- legitimate authenticated insert (allowed columns).
  insert into public.analytics_events (event_type, profile_id, target_id)
    values ('product_click', v_profile, 'prod_1');

  -- (11) existing owner READS still work (owner sees own profile's 3 events).
  select count(*) into cnt from public.analytics_events where profile_id = v_profile;
  if cnt <> 3 then raise exception 'FAIL: owner read returned % rows (expected 3)', cnt; end if;

  -- (5) generated id + created_at populated by defaults on a legit row.
  select id, created_at into v_id, v_created
  from public.analytics_events where profile_id = v_profile order by created_at desc limit 1;
  if v_id is null then raise exception 'FAIL: id default not populated'; end if;
  if v_created is null or v_created < now() - interval '5 minutes' or v_created > now() + interval '1 minute' then
    raise exception 'FAIL: created_at default not populated with server now() (got %)', v_created;
  end if;
  reset role;

  -- (12) the (profile_id, created_at desc) index exists with the intended order.
  select pg_get_indexdef(i.indexrelid) into idxdef
  from pg_index i join pg_class c on c.oid = i.indexrelid
  where c.relname = 'analytics_events_profile_created_idx';
  if idxdef is null then raise exception 'FAIL: analytics_events_profile_created_idx missing'; end if;
  if idxdef !~* 'profile_id' or idxdef !~* 'created_at desc' then
    raise exception 'FAIL: index not (profile_id, created_at desc): %', idxdef;
  end if;
  if position('profile_id' in idxdef) > position('created_at' in idxdef) then
    raise exception 'FAIL: index column order wrong: %', idxdef;
  end if;

  -- (13) grants/policies: client INSERT is column-scoped (not table-wide),
  --      authenticated SELECT + 2 policies unchanged.
  --      anon has column INSERT on exactly the 4 intended columns.
  select count(*) into cnt from information_schema.role_column_grants
  where table_schema='public' and table_name='analytics_events'
    and grantee='anon' and privilege_type='INSERT'
    and column_name in ('profile_id','event_type','target_id','metadata');
  if cnt <> 4 then raise exception 'FAIL: anon column INSERT not on the 4 columns (got %)', cnt; end if;
  --      anon must NOT have column INSERT on id or created_at.
  if exists (select 1 from information_schema.role_column_grants
             where table_schema='public' and table_name='analytics_events'
               and grantee='anon' and privilege_type='INSERT'
               and column_name in ('id','created_at')) then
    raise exception 'FAIL: anon can insert id/created_at'; end if;
  --      no TABLE-WIDE INSERT grant remains for anon/authenticated.
  if exists (select 1 from information_schema.role_table_grants
             where table_schema='public' and table_name='analytics_events'
               and grantee in ('anon','authenticated') and privilege_type='INSERT') then
    raise exception 'FAIL: table-wide INSERT grant still present'; end if;
  --      authenticated column INSERT on the 4 columns present.
  select count(*) into cnt from information_schema.role_column_grants
  where table_schema='public' and table_name='analytics_events'
    and grantee='authenticated' and privilege_type='INSERT'
    and column_name in ('profile_id','event_type','target_id','metadata');
  if cnt <> 4 then raise exception 'FAIL: authenticated column INSERT not on the 4 columns (got %)', cnt; end if;
  --      authenticated SELECT (owner reads) unchanged.
  if not exists (select 1 from information_schema.role_table_grants
                 where table_schema='public' and table_name='analytics_events'
                   and grantee='authenticated' and privilege_type='SELECT') then
    raise exception 'FAIL: authenticated SELECT grant changed'; end if;
  --      both RLS policies unchanged.
  select count(*) into cnt from pg_policies where schemaname='public' and tablename='analytics_events';
  if cnt <> 2 then raise exception 'FAIL: analytics_events policy count changed (%, expected 2)', cnt; end if;

  raise notice 'analytics_events hardening checks passed';

  delete from auth.users where id = v_owner;
end $$;
