-- ============================================================================
-- CABANA — post_media INSERT ownership hardening (20260533)
--
-- Corrective, additive-only. No table/column/enum/grant/data change; only the
-- post_media write policy's WITH CHECK is tightened. SELECT/UPDATE/DELETE
-- row visibility (the USING clause) is UNCHANGED.
--
-- Problem (cross-post media injection): the baseline (20260514) write policy
--
--     create policy "Owners manage own post media"
--       on public.post_media for all
--       using       (owner_user_id = (select auth.uid()))
--       with check  (owner_user_id = (select auth.uid()));
--
-- validates ONLY that the new row's owner_user_id equals the caller. It never
-- checks (a) that the caller owns the target post, or (b) that storage_path
-- lives under the caller's own storage folder. Because `posts` has public /
-- followers SELECT policies and `post_media` grants INSERT to `authenticated`,
-- ANY signed-in creator can `POST /rest/v1/post_media` a row with
-- owner_user_id = self, post_id = a VICTIM's post, storage_path = anything —
-- bypassing the (ineffective) app-layer guard in addPostMedia entirely. The
-- feed RPCs aggregate all post_media by post_id with no owner filter and the
-- service-role signer signs whatever storage_path the row carries after
-- can_view_post on the victim's post, so the injected media renders inside the
-- victim's post for every viewer — and the victim cannot see or remove it
-- (post_media SELECT is owner-only). Two proven vectors:
--   * ATTACK 1 — attach the attacker's own media to a victim's post (defacement).
--   * ATTACK 2 — set storage_path into a victim's folder (republishing the
--     victim's private object under the attacker's public post).
--
-- Fix: replace the write policy with one whose WITH CHECK additionally requires
-- that the caller OWNS the target post (via the existing is_current_user_creator
-- helper on posts.creator_profile_id) AND that storage_path's first segment is
-- the caller's own uid (mirroring the post-media bucket's owner-scoped object
-- policy, `(storage.foldername(name))[1] = auth.uid()::text`). Legitimate
-- uploads use the path layout `<user_id>/<post_id>/<file>` and always target the
-- creator's own post, so owner uploads are preserved.
--
-- USING is intentionally left as owner_user_id = auth.uid() so SELECT / UPDATE /
-- DELETE protections are unchanged (owner-only, never widened). No grants, no
-- other tables, and no other functions are touched.
--
-- Rollback (restores the prior, vulnerable policy):
--   drop policy "Owners manage own post media" on public.post_media;
--   create policy "Owners manage own post media"
--     on public.post_media for all
--     using (owner_user_id = (select auth.uid()))
--     with check (owner_user_id = (select auth.uid()));
-- ============================================================================

drop policy if exists "Owners manage own post media" on public.post_media;

create policy "Owners manage own post media"
  on public.post_media for all
  using (owner_user_id = (select auth.uid()))
  with check (
    -- 1. The row's declared owner is the caller (unchanged).
    owner_user_id = (select auth.uid())
    -- 2. The caller owns the target post (blocks cross-post injection).
    and exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and public.is_current_user_creator(p.creator_profile_id)
    )
    -- 3. storage_path lives under the caller's own folder (blocks republishing a
    --    victim's private object path). Mirrors the post-media bucket policy.
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );
