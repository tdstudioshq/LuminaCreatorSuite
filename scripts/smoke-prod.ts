#!/usr/bin/env bun
/* ============================================================================
 * CABANA — production smoke test (post-deploy verification)
 *
 * Run:   bun run smoke:prod          (requires .env.smoke — see .env.smoke.example)
 *        bun run smoke:prod --setup  (one-time: sign up user B as a member)
 *
 * Tests what REAL USERS can see: anon + password sessions only, publishable
 * key only (the script aborts if it detects a service-role key). Never touches
 * payouts, moderation writes, tips, purchases, or anything money-adjacent.
 * All created data carries a `smoke_<timestamp>` prefix and is cleaned up in
 * finally blocks + a startup sweep for prior crashed runs.
 *
 * ── API-SURFACE MANIFEST (every RPC/table/bucket touched, verified in source) ──
 *
 * RPCs (names/args from src/integrations/supabase/types.ts, "Functions"):
 *   relationship_follow_creator(_username)    types.ts:1907; relationship-actions.ts:31;
 *                                             matches lower(creator_profiles.handle), idempotent
 *                                             ON CONFLICT DO NOTHING (20260513:316,335-336)
 *   relationship_unfollow_creator(_username)  types.ts:1922; relationship-actions.ts:38
 *   relationship_state(_username)             types.ts:1911; relationship-actions.ts:64
 *   can_view_post(_post_id)                   types.ts:1663; the authz gate in
 *                                             getPostMediaUrls (post-actions.ts:403);
 *                                             anon-granted (20260514:166)
 *   feed_creator_posts(_username,_cursor,_limit) types.ts:1771; post-actions.ts:355;
 *                                             anon-granted (20260514:381); locked stubs
 *                                             for non-followers
 *   post_card(_post_id)                       types.ts:1863 (same locked-stub shape)
 *   start_conversation_with_username(_username) types.ts:1930; messaging-actions.ts:113
 *   conversation_messages(_conversation_id,…) types.ts:1677; messaging-actions.ts:153
 *   list_conversations()                      types.ts:1840; messaging-actions.ts:124
 *   creator_content_analytics(_limit)         types.ts:1713; analytics migration
 *                                             (20260524) grants authenticated only —
 *                                             anon must get a permission error
 *   is_current_user_admin()                   types.ts:1821
 *
 * Tables (mirroring the app's own access paths):
 *   posts / post_media   create-draft → media insert → publish flow mirrors
 *                        post-actions.ts:107-130 (insert w/ creator_profile_id,
 *                        status 'draft'), :288-303 (post_media insert w/
 *                        owner_user_id + storage_bucket 'post-media'), and the
 *                        publish patch {status:'published', published_at} from
 *                        resolvePublishPatch (cabana-posts.ts:261-267)
 *   notifications        app read path = select().eq('recipient_id', userId)
 *                        (notification-actions.ts:62-67 — the explicit filter IS
 *                        the admin-leak fix; RLS is the backstop). Follow
 *                        notifications: dedupe_key
 *                        'new_follower:<creator_profile_id>:<follower_user_id>'
 *                        (20260519:265) with ON CONFLICT (dedupe_key) DO NOTHING
 *                        (20260519:221) → re-runs assert EXISTENCE, not newness.
 *                        Clients may only flip read_at (no delete grant).
 *   messages             insert {conversation_id, sender_id, body,
 *                        message_type:'text'} (messaging-actions.ts:65-68);
 *                        cleanup = sender soft-delete via deleted_at
 *                        (messaging-actions.ts:78-84). Conversations have NO
 *                        user-facing delete path — rows remain by design.
 *   creator_profiles     own-row read (id, handle) — post-actions.ts:60-69
 *   public_creator_profiles  view; post_count is a real published-post count
 *                        since 20260530 (H5)
 *   transactions/payouts/creator_balances  admin-RLS reads with embedded
 *                        creator_profiles(handle, name) — admin-finance-actions.ts:48-49
 *
 * Storage buckets:
 *   avatars     PUBLIC bucket (20260511:336); path `<userId>/<file>` with
 *               {cacheControl:'3600', upsert:false, contentType} — cabana-store.ts:521-533;
 *               owner-scoped insert/select/update/delete (20260511:348-360)
 *   post-media  PRIVATE bucket (20260514:391); path `<userId>/<postId>/<file>`
 *               (use-posts.ts:177); owner-scoped all-ops RLS (20260514:397-400).
 *               The app signs via service role AFTER can_view_post authorizes
 *               (post-actions.ts:396-435); this script never carries the service
 *               key, so it verifies the same gate as anon + object serving via
 *               the owner-scoped signer.
 *
 * Realtime (use-messaging.ts:37-68):
 *   topic `<channelName>:<instanceId>` — UNIQUE PER INSTANCE (two components on
 *   one logical channel must not share a topic; supabase-js rejects a second
 *   binding added after the first topic subscribed — the regression under test).
 *   Binding: postgres_changes {event:'*', schema:'public', table:'messages'}
 *   with NO server-side filter (a conversation_id filter is rejected by
 *   Realtime — use-messaging.ts:108-114) + message_read_receipts; delivery is
 *   RLS-filtered by the subscriber's token.
 *
 * Auth (cabana-auth.ts): login = signInWithPassword (:102); signup =
 *   auth.signUp with options.data {name, account_type} + emailRedirectTo
 *   (:43-50). Email-confirmation is a Supabase project setting, not visible in
 *   code — detected at runtime (signUp returns a null session when required).
 *
 * Deploy surface (vite.config.ts:36-46 → .vercel/output/config.json):
 *   headers Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options,
 *   Referrer-Policy, Permissions-Policy on every route. Freshness marker: the
 *   /dashboard/link-in-bio route exists only since commit 1d385d7 (this cycle's
 *   grouped-sidebar nav refactor); JS chunks are hashed + code-split, so the
 *   marker-string-in-chunk approach is brittle — we assert the new route serves
 *   the app shell instead, self-calibrated against the 404 sentinel text
 *   "slipped out of the cabana" (__root.tsx:31).
 * ========================================================================== */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createClient,
  type RealtimeChannel,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

// ─────────────────────────────── Config ─────────────────────────────────────

const REPO_ROOT = join(import.meta.dir, "..");
const ENV_SMOKE_PATH = join(REPO_ROOT, ".env.smoke");
const DEFAULT_BASE_URL = "https://cabanagrp.com";
const CHECK_TIMEOUT_MS = 120_000;
const REALTIME_WAIT_MS = 15_000;
const NOT_FOUND_SENTINEL = "slipped out of the cabana"; // __root.tsx NotFoundComponent
const POST_MEDIA_BUCKET = "post-media"; // post-actions.ts:57
const AVATARS_BUCKET = "avatars"; // cabana-store.ts:525
// Same TXN_SELECT as admin-finance-actions.ts:48-49
const TXN_SELECT =
  "id, type, status, gross_cents, platform_fee_cents, processor_fee_cents, creator_net_cents, currency, reference_type, reference_id, payer_user_id, creator_profile_id, mock_provider_reference, created_at, creator_profiles(handle, name)";

// 1x1 transparent PNG.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const runId = `smoke_${Date.now()}`;

type CheckStatus = "PASS" | "FAIL" | "SKIP" | "FLAKY";
type CheckResult = { name: string; status: CheckStatus; detail: string };

type Ctx = {
  anon: SupabaseClient;
  a: SupabaseClient;
  b: SupabaseClient;
  aSession: Session;
  bSession: Session;
  aUserId: string;
  bUserId: string;
  aCreatorProfileId: string;
  aHandle: string;
  aIsAdmin: boolean;
  supabaseUrl: string;
  baseUrl: string;
};

// ─────────────────────────────── Utilities ──────────────────────────────────

function log(section: string, msg: string) {
  console.log(`  [${section}] ${msg}`);
}

/** Full-fidelity error formatting — RLS failures need code/details/hint. */
function fmtError(e: unknown): string {
  if (e instanceof Error) {
    const extra = JSON.stringify(
      e,
      Object.getOwnPropertyNames(e).filter((k) => k !== "stack"),
    );
    return extra === "{}" || extra === `{"message":${JSON.stringify(e.message)}}`
      ? e.message
      : `${e.message} ${extra}`;
  }
  if (typeof e === "object" && e !== null) return JSON.stringify(e);
  return String(e);
}

/** Supabase error objects (Postgrest/Storage/Auth) → one readable line. */
function fmtSupabaseError(e: {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  name?: string;
}): string {
  return JSON.stringify({
    message: e.message,
    code: e.code,
    details: e.details ?? undefined,
    hint: e.hint ?? undefined,
    status: e.status,
    name: e.name,
  });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Recursively scan any JSON payload for forbidden substrings. */
function findForbidden(payload: unknown, forbidden: string[]): string[] {
  const text = JSON.stringify(payload) ?? "";
  return forbidden.filter((f) => text.includes(f));
}

// ─────────────────────────────── Env loading ────────────────────────────────

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const REQUIRED_KEYS = [
  "SMOKE_USER_A_EMAIL",
  "SMOKE_USER_A_PASSWORD",
  "SMOKE_USER_B_EMAIL",
  "SMOKE_USER_B_PASSWORD",
  "SMOKE_SUPABASE_URL",
  "SMOKE_SUPABASE_KEY",
] as const;

function printMissingEnvInstructions(missing: string[]) {
  console.error(`
✗ Production smoke test cannot run — missing configuration.

  ${existsSync(ENV_SMOKE_PATH) ? `.env.smoke exists but is missing: ${missing.join(", ")}` : `.env.smoke does not exist (expected at ${ENV_SMOKE_PATH}).`}

  To fix:
    1. cp .env.smoke.example .env.smoke
    2. Fill in:
       SMOKE_USER_A_EMAIL / SMOKE_USER_A_PASSWORD
         → an EXISTING creator account (ideally also admin, or the admin-finance
           assertions will SKIP). Must have a creator_profiles row.
       SMOKE_USER_B_EMAIL / SMOKE_USER_B_PASSWORD
         → a THROWAWAY member account. If it doesn't exist yet, pick fresh
           credentials and run:  bun run smoke:prod --setup
           (signs B up through the real signup path with account_type "member").
           If the Supabase project requires email confirmation, --setup will say
           so — confirm B's inbox once, then re-run without --setup.
       SMOKE_SUPABASE_URL / SMOKE_SUPABASE_KEY
         → already pre-filled in the example with the cloud cabanadatabase
           project URL + PUBLISHABLE key (never the service-role key).
    3. Re-run: bun run smoke:prod

  .env.smoke is gitignored — real credentials never get committed.
`);
}

/** Abort if the key is (or decodes to) a service-role credential. */
function assertNotServiceRole(key: string) {
  if (key.startsWith("sb_secret")) {
    console.error("✗ SMOKE_SUPABASE_KEY is a secret (service) key. Use the PUBLISHABLE key.");
    process.exit(2);
  }
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
      if (payload?.role === "service_role") {
        console.error("✗ SMOKE_SUPABASE_KEY is the service-role JWT. Use the PUBLISHABLE key.");
        process.exit(2);
      }
    } catch {
      // Not a decodable JWT — fine (publishable keys aren't JWTs).
    }
  }
}

// ─────────────────────────────── Setup (--setup) ────────────────────────────

/**
 * One-time signup of user B through the REAL signup path (cabana-auth.ts:43-50):
 * supabase.auth.signUp with options.data { name, account_type: "member" }.
 * The handle_new_user trigger provisions member_profiles from that metadata.
 */
async function setupUserB(env: Record<string, string>): Promise<void> {
  const client = createClient(env.SMOKE_SUPABASE_URL, env.SMOKE_SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  console.log(`\n── --setup: signing up ${env.SMOKE_USER_B_EMAIL} as a member account…`);
  const { data, error } = await client.auth.signUp({
    email: env.SMOKE_USER_B_EMAIL.trim().toLowerCase(),
    password: env.SMOKE_USER_B_PASSWORD,
    options: {
      data: { name: "Smoke Test Member", account_type: "member" },
      // Members land on /account (cabana-auth.ts:38-41).
      emailRedirectTo: `${DEFAULT_BASE_URL}/account`,
    },
  });
  if (error) {
    if (/already registered/i.test(error.message)) {
      console.log("  User B already exists — proceeding to credential validation.");
      return;
    }
    console.error(`✗ Signup failed: ${fmtSupabaseError(error)}`);
    process.exit(2);
  }
  if (!data.session) {
    console.error(`
✗ User B was created but NO session was returned — email confirmation is
  enabled in this Supabase project. B must be confirmed manually ONCE:
  open ${env.SMOKE_USER_B_EMAIL}'s inbox, click the confirmation link,
  then re-run: bun run smoke:prod (without --setup).
`);
    process.exit(2);
  }
  console.log("  ✓ User B created and immediately usable (no email confirmation required).");
  await client.auth.signOut({ scope: "local" });
}

// ─────────────────────────────── Sweep & residue ────────────────────────────

const SMOKE_CAPTION = /^smoke_\d{10,}/;

/** List a storage folder, returning file names starting with `smoke_`. */
async function listSmokeFiles(
  client: SupabaseClient,
  bucket: string,
  folder: string,
): Promise<string[]> {
  const { data, error } = await client.storage.from(bucket).list(folder, { limit: 100 });
  if (error) throw new Error(`storage list ${bucket}/${folder}: ${fmtSupabaseError(error)}`);
  return (data ?? []).filter((f) => f.name.startsWith("smoke_")).map((f) => `${folder}/${f.name}`);
}

/**
 * Delete leftover smoke_* data from prior crashed runs. Safe by construction:
 * post deletion is double-gated (SQL LIKE + strict client-side regex on the
 * caption) and storage deletion only touches files literally named smoke_*.
 */
async function sweepSmokeData(ctx: Ctx, label: string): Promise<string[]> {
  const removed: string[] = [];

  // 1. A's smoke posts (posts cascade post_media rows; storage objects removed too).
  // Scoped to A's own creator profile: the public-post SELECT policy would let
  // this read OTHER creators' posts, but only the owner can delete — a foreign
  // caption match would log a phantom "removed" and permanently fail residue.
  const { data: posts, error: postsErr } = await ctx.a
    .from("posts")
    .select("id, caption")
    .eq("creator_profile_id", ctx.aCreatorProfileId)
    .like("caption", "smoke\\_%")
    .limit(100);
  if (postsErr) throw new Error(`sweep posts read: ${fmtSupabaseError(postsErr)}`);
  const smokePosts = (posts ?? []).filter((p) => SMOKE_CAPTION.test(p.caption ?? ""));
  for (const post of smokePosts) {
    const { data: media } = await ctx.a
      .from("post_media")
      .select("storage_path")
      .eq("post_id", post.id);
    const { error: delErr } = await ctx.a.from("posts").delete().eq("id", post.id);
    if (delErr) throw new Error(`sweep post delete: ${fmtSupabaseError(delErr)}`);
    const paths = (media ?? [])
      .map((m) => m.storage_path)
      .filter((p) => p.startsWith(`${ctx.aUserId}/`));
    if (paths.length > 0) await ctx.a.storage.from(POST_MEDIA_BUCKET).remove(paths);
    removed.push(`post ${post.id} (+${paths.length} media object(s))`);
  }

  // 2. Orphaned smoke_* avatar objects under A's folder.
  const avatarFiles = await listSmokeFiles(ctx.a, AVATARS_BUCKET, ctx.aUserId);
  if (avatarFiles.length > 0) {
    await ctx.a.storage.from(AVATARS_BUCKET).remove(avatarFiles);
    removed.push(...avatarFiles.map((f) => `avatars object ${f}`));
  }

  // 3. Orphaned smoke_* post-media objects (upload succeeded, post insert didn't).
  const { data: mediaFolders } = await ctx.a.storage
    .from(POST_MEDIA_BUCKET)
    .list(ctx.aUserId, { limit: 50 });
  for (const entry of mediaFolders ?? []) {
    // Folders (post ids) come back without an id; files under <userId>/ directly are unexpected.
    if (entry.id) continue;
    const orphans = await listSmokeFiles(ctx.a, POST_MEDIA_BUCKET, `${ctx.aUserId}/${entry.name}`);
    if (orphans.length > 0) {
      await ctx.a.storage.from(POST_MEDIA_BUCKET).remove(orphans);
      removed.push(...orphans.map((f) => `post-media object ${f}`));
    }
  }

  // 4. B's leftover follow of A.
  const { data: relRows } = await ctx.b.rpc("relationship_state", { _username: ctx.aHandle });
  if (relRows?.[0]?.following === true) {
    await ctx.b.rpc("relationship_unfollow_creator", { _username: ctx.aHandle });
    removed.push(`follow B→${ctx.aHandle}`);
  }

  // 5. B's undeleted smoke messages (soft-delete, mirroring messaging-actions.ts:78-84).
  const { data: convos } = await ctx.b.rpc("list_conversations");
  for (const convo of (convos ?? []).slice(0, 10)) {
    const { data: msgs } = await ctx.b.rpc("conversation_messages", {
      _conversation_id: convo.conversation_id,
      _limit: 50,
    });
    for (const m of msgs ?? []) {
      if (m.mine && !m.is_deleted && typeof m.body === "string" && SMOKE_CAPTION.test(m.body)) {
        await ctx.b
          .from("messages")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", m.message_id);
        removed.push(`message ${m.message_id}`);
      }
    }
  }

  if (removed.length > 0) log(label, `removed: ${removed.join("; ")}`);
  else log(label, "no leftover smoke_* data found");
  return removed;
}

/** Read-only residue scan — proves the run left nothing smoke_* behind. */
async function checkCleanupResidue(ctx: Ctx): Promise<CheckResult> {
  const residue: string[] = [];

  const { data: posts } = await ctx.a
    .from("posts")
    .select("id, caption")
    .eq("creator_profile_id", ctx.aCreatorProfileId)
    .like("caption", "smoke\\_%")
    .limit(100);
  for (const p of (posts ?? []).filter((p) => SMOKE_CAPTION.test(p.caption ?? ""))) {
    residue.push(`post ${p.id}`);
  }

  residue.push(...(await listSmokeFiles(ctx.a, AVATARS_BUCKET, ctx.aUserId)));

  const { data: folders } = await ctx.a.storage
    .from(POST_MEDIA_BUCKET)
    .list(ctx.aUserId, { limit: 50 });
  for (const entry of folders ?? []) {
    if (entry.id) continue;
    residue.push(
      ...(await listSmokeFiles(ctx.a, POST_MEDIA_BUCKET, `${ctx.aUserId}/${entry.name}`)),
    );
  }

  const { data: relRows } = await ctx.b.rpc("relationship_state", { _username: ctx.aHandle });
  if (relRows?.[0]?.following === true) residue.push(`follow B→${ctx.aHandle}`);

  const { data: convos } = await ctx.b.rpc("list_conversations");
  for (const convo of (convos ?? []).slice(0, 10)) {
    const { data: msgs } = await ctx.b.rpc("conversation_messages", {
      _conversation_id: convo.conversation_id,
      _limit: 50,
    });
    for (const m of msgs ?? []) {
      if (m.mine && !m.is_deleted && typeof m.body === "string" && SMOKE_CAPTION.test(m.body)) {
        residue.push(`message ${m.message_id}`);
      }
    }
  }

  if (residue.length > 0) {
    return {
      name: "CLEANUP-RESIDUE",
      status: "FAIL",
      detail: `leftover smoke_* data: ${residue.join("; ")}`,
    };
  }
  return {
    name: "CLEANUP-RESIDUE",
    status: "PASS",
    detail:
      "no smoke_* posts, storage objects, follows, or undeleted messages remain. " +
      "Known intentional residue: system-written notification/activity rows (clients " +
      "cannot delete them; smoke notification marked read) and empty conversation rows " +
      "(no user-facing delete path exists; messages are soft-deleted).",
  };
}

// ─────────────────────────────── Check 1: deploy ────────────────────────────

async function checkDeployFreshness(ctx: Ctx): Promise<CheckResult> {
  const name = "DEPLOY-FRESHNESS";

  const res = await fetch(`${ctx.baseUrl}/`, { redirect: "follow" });
  assert(res.ok, `GET ${ctx.baseUrl}/ returned ${res.status}`);
  const requiredHeaders = [
    "strict-transport-security",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
  ];
  const missing = requiredHeaders.filter((h) => !res.headers.get(h));
  assert(
    missing.length === 0,
    `security headers missing on ${ctx.baseUrl}/: ${missing.join(", ")} ` +
      `(expected from vite.config.ts routeRules → .vercel/output/config.json)`,
  );
  log(name, `security headers present: ${requiredHeaders.join(", ")}`);

  // Freshness: /dashboard/link-in-bio exists only since commit 1d385d7 (grouped
  // sidebar / business-home nav refactor). Chunks are hashed + code-split, so we
  // assert the route serves the app shell rather than hunting marker strings.
  // Self-calibrate the 404 sentinel first so "no sentinel" can't silently pass.
  // The control path MUST be multi-segment: any unknown single-segment path
  // matches the /$username dynamic route (src/routes/$username.tsx) and SSRs
  // the creator-page shell with 200 instead of the not-found handler.
  const controlRes = await fetch(`${ctx.baseUrl}/definitely/not-a-route-${runId}`);
  const controlBody = await controlRes.text();
  const sentinelWorks = controlBody.includes(NOT_FOUND_SENTINEL) || controlRes.status === 404;
  assert(
    sentinelWorks,
    `404 control request did not show the not-found sentinel (status ${controlRes.status}) — ` +
      `freshness assertion would be inconclusive`,
  );

  const freshRes = await fetch(`${ctx.baseUrl}/dashboard/link-in-bio`);
  const freshBody = await freshRes.text();
  assert(
    freshRes.status !== 404 && !freshBody.includes(NOT_FOUND_SENTINEL),
    `/dashboard/link-in-bio rendered the 404 page (status ${freshRes.status}) — ` +
      `production is serving a build older than commit 1d385d7`,
  );
  log(name, `/dashboard/link-in-bio serves the app shell (status ${freshRes.status})`);

  return {
    name,
    status: "PASS",
    detail:
      "security headers present; /dashboard/link-in-bio (new this cycle) serves the app " +
      "shell while the 404 control page shows the sentinel",
  };
}

// ─────────────────────────────── Check 2: avatars ───────────────────────────

async function checkAvatarStorage(ctx: Ctx): Promise<CheckResult> {
  const name = "AVATAR-STORAGE";
  const path = `${ctx.aUserId}/${runId}.png`; // cabana-store.ts:524 layout
  let uploaded = false;
  try {
    // Upload as A, mirroring uploadAvatar's options (cabana-store.ts:525-529).
    const { error: upErr } = await ctx.a.storage
      .from(AVATARS_BUCKET)
      .upload(path, new Blob([PNG_1X1], { type: "image/png" }), {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/png",
      });
    assert(!upErr, `A's avatar upload failed: ${upErr ? fmtSupabaseError(upErr) : ""}`);
    uploaded = true;
    log(name, `uploaded ${path} as A`);

    // Download it back as A and compare sizes.
    const { data: blob, error: dlErr } = await ctx.a.storage.from(AVATARS_BUCKET).download(path);
    assert(!dlErr && blob, `download-back failed: ${dlErr ? fmtSupabaseError(dlErr) : "no data"}`);
    assert(
      blob.size === PNG_1X1.byteLength,
      `downloaded size ${blob.size} != uploaded ${PNG_1X1.byteLength}`,
    );

    // The bucket is public (20260511:336) — the public URL must serve it.
    const { data: pub } = ctx.a.storage.from(AVATARS_BUCKET).getPublicUrl(path);
    const pubRes = await fetch(pub.publicUrl);
    assert(pubRes.ok, `public avatar URL returned ${pubRes.status}`);
    log(name, "download-back and public URL fetch OK");

    // As anon: uploads must be REJECTED (owner-folder-scoped insert policy).
    const anonAttempts = [
      `${ctx.aUserId}/${runId}_anon.png`, // into A's folder
      `${runId}_anon/intruder.png`, // into a fabricated folder
    ];
    for (const anonPath of anonAttempts) {
      const { error: anonErr } = await ctx.anon.storage
        .from(AVATARS_BUCKET)
        .upload(anonPath, new Blob([PNG_1X1], { type: "image/png" }), {
          contentType: "image/png",
        });
      if (!anonErr) {
        // Clean up the breach artifact where possible before failing loudly.
        await ctx.a.storage.from(AVATARS_BUCKET).remove([anonPath]);
        throw new Error(`SECURITY: anon upload to avatars/${anonPath} SUCCEEDED — RLS breach`);
      }
      log(name, `anon upload to ${anonPath} rejected: ${fmtSupabaseError(anonErr)}`);
    }

    return {
      name,
      status: "PASS",
      detail: "A uploaded/downloaded/deleted a 1x1 PNG; both anon upload attempts rejected",
    };
  } finally {
    if (uploaded) {
      const { error } = await ctx.a.storage.from(AVATARS_BUCKET).remove([path]);
      if (error) console.error(`  [${name}] cleanup failed: ${fmtSupabaseError(error)}`);
    }
  }
}

// ───────────────────────── Checks 3+4: post media ───────────────────────────

type SmokePost = { postId: string; mediaId: string; storagePath: string };

/**
 * Create + publish a post with one 1x1 PNG, exactly mirroring the app flow:
 * draft insert (post-actions.ts:116-127) → client storage upload at
 * `<userId>/<postId>/<file>` (use-posts.ts:176-181) → post_media insert
 * (post-actions.ts:288-303) → publish patch (cabana-posts.ts:261-267).
 */
async function createSmokePost(ctx: Ctx, visibility: "public" | "followers"): Promise<SmokePost> {
  const { data: post, error: postErr } = await ctx.a
    .from("posts")
    .insert({
      creator_profile_id: ctx.aCreatorProfileId,
      caption: `${runId} ${visibility} probe`,
      visibility,
      price_cents: null,
      currency: "USD",
      status: "draft",
    })
    .select("id")
    .single();
  if (postErr) throw new Error(`post insert: ${fmtSupabaseError(postErr)}`);

  const storagePath = `${ctx.aUserId}/${post.id}/${runId}.png`;
  const { error: upErr } = await ctx.a.storage
    .from(POST_MEDIA_BUCKET)
    .upload(storagePath, new Blob([PNG_1X1], { type: "image/png" }), {
      contentType: "image/png",
      upsert: false,
    });
  if (upErr) throw new Error(`post-media upload: ${fmtSupabaseError(upErr)}`);

  const { data: media, error: mediaErr } = await ctx.a
    .from("post_media")
    .insert({
      post_id: post.id,
      owner_user_id: ctx.aUserId,
      kind: "image",
      storage_bucket: POST_MEDIA_BUCKET,
      storage_path: storagePath,
      mime_type: "image/png",
      width: 1,
      height: 1,
      position: 0,
    })
    .select("id")
    .single();
  if (mediaErr) throw new Error(`post_media insert: ${fmtSupabaseError(mediaErr)}`);

  const { error: pubErr } = await ctx.a
    .from("posts")
    .update({ status: "published", published_at: backdatedPublishedAt() })
    .eq("id", post.id);
  if (pubErr) throw new Error(`publish: ${fmtSupabaseError(pubErr)}`);

  return { postId: post.id, mediaId: media.id, storagePath };
}

/**
 * The visibility gates compare published_at to the DATABASE clock (can_view_post
 * / feed_creator_posts deny future-dated posts). The app stamps this on the
 * Vercel server; this script runs on a laptop whose clock may be seconds ahead
 * of the DB — backdate by 60s so a skewed local clock can't fake an RLS FAIL.
 */
function backdatedPublishedAt(): string {
  return new Date(Date.now() - 60_000).toISOString();
}

/** Delete a smoke post row (cascades post_media) + its storage object, as A. */
async function destroySmokePost(ctx: Ctx, post: SmokePost | null, checkName: string) {
  if (!post) return;
  const { error: delErr } = await ctx.a.from("posts").delete().eq("id", post.postId);
  if (delErr) console.error(`  [${checkName}] post cleanup failed: ${fmtSupabaseError(delErr)}`);
  const { error: rmErr } = await ctx.a.storage.from(POST_MEDIA_BUCKET).remove([post.storagePath]);
  if (rmErr) console.error(`  [${checkName}] storage cleanup failed: ${fmtSupabaseError(rmErr)}`);
}

async function checkPostMediaPublic(ctx: Ctx): Promise<CheckResult> {
  const name = "POST-MEDIA-PUBLIC";
  let post: SmokePost | null = null;
  try {
    post = await createSmokePost(ctx, "public");
    log(name, `published public post ${post.postId} with media ${post.mediaId}`);

    // The app's read path authorizes with can_view_post (post-actions.ts:403)
    // before signing. As anon, a public post must be viewable.
    const { data: canView, error: cvErr } = await ctx.anon.rpc("can_view_post", {
      _post_id: post.postId,
    });
    assert(!cvErr, `can_view_post errored: ${cvErr ? fmtSupabaseError(cvErr) : ""}`);
    assert(canView === true, `anon can_view_post on a public post returned ${canView}`);

    // The feed read path (feed_creator_posts, anon-granted) must list it unlocked
    // with the media item present.
    const { data: feed, error: feedErr } = await ctx.anon.rpc("feed_creator_posts", {
      _username: ctx.aHandle,
      _limit: 50,
    });
    assert(!feedErr, `feed_creator_posts errored: ${feedErr ? fmtSupabaseError(feedErr) : ""}`);
    const row = (feed ?? []).find((r: { post_id: string }) => r.post_id === post!.postId);
    assert(row, `published public post ${post.postId} missing from feed_creator_posts`);
    assert(row.locked === false, `public post came back locked=${row.locked}`);
    const mediaIds = Array.isArray(row.media) ? row.media.map((m: { id?: string }) => m?.id) : [];
    assert(
      mediaIds.includes(post.mediaId),
      `feed media (${JSON.stringify(mediaIds)}) does not include ${post.mediaId}`,
    );
    log(name, "anon feed shows the post unlocked with its media item");

    // Storage serving: the app signs with the service role after the same gate
    // (post-actions.ts:409-435); this script never carries that key, so verify
    // object serving through the owner-scoped signer (20260514:397 select policy).
    const { data: signed, error: signErr } = await ctx.a.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrl(post.storagePath, 300);
    assert(
      !signErr && signed?.signedUrl,
      `owner createSignedUrl failed: ${signErr ? fmtSupabaseError(signErr) : "no url"}`,
    );
    const signedRes = await fetch(signed.signedUrl);
    assert(signedRes.ok, `signed media URL returned ${signedRes.status}`);
    const bytes = await signedRes.arrayBuffer();
    assert(bytes.byteLength === PNG_1X1.byteLength, `signed URL served ${bytes.byteLength} bytes`);
    log(name, "signed media URL fetched 200 with matching bytes");

    return {
      name,
      status: "PASS",
      detail:
        "public post visible to anon via can_view_post + feed_creator_posts (unlocked, media " +
        "listed); storage object serves 200 via signed URL",
    };
  } finally {
    await destroySmokePost(ctx, post, name);
  }
}

async function checkPostMediaLocked(ctx: Ctx): Promise<CheckResult> {
  const name = "POST-MEDIA-LOCKED";
  let post: SmokePost | null = null;
  try {
    post = await createSmokePost(ctx, "followers");
    log(name, `published followers-only post ${post.postId}`);

    const { data: canView, error: cvErr } = await ctx.anon.rpc("can_view_post", {
      _post_id: post.postId,
    });
    assert(!cvErr, `can_view_post errored: ${cvErr ? fmtSupabaseError(cvErr) : ""}`);
    assert(canView === false, `anon can_view_post on a followers post returned ${canView}`);

    // Anon feed must show a locked stub…
    const { data: feed, error: feedErr } = await ctx.anon.rpc("feed_creator_posts", {
      _username: ctx.aHandle,
      _limit: 50,
    });
    assert(!feedErr, `feed_creator_posts errored: ${feedErr ? fmtSupabaseError(feedErr) : ""}`);
    const row = (feed ?? []).find((r: { post_id: string }) => r.post_id === post!.postId);
    assert(row, `followers post ${post.postId} missing from anon feed (expected a locked stub)`);
    assert(row.locked === true, `followers post came back locked=${row.locked} for anon`);
    assert(
      !Array.isArray(row.media) || row.media.length === 0,
      `locked stub leaked media entries: ${JSON.stringify(row.media)}`,
    );

    // …and NOTHING in the payloads may reference the locked post's media. The
    // forbidden set is post-media-specific on purpose: creator avatar_url is a
    // PUBLIC avatars-bucket storage URL that legitimately appears on every row
    // (feed/post_card return it un-blanked by design), so scanning for generic
    // "/storage/v1/" would deterministically false-FAIL on any avatar'd creator.
    // Nothing in a correct payload ever references the private post-media
    // bucket, the object path, or its <userId>/<postId> folder.
    const { data: card, error: cardErr } = await ctx.anon.rpc("post_card", {
      _post_id: post.postId,
    });
    assert(!cardErr, `post_card errored: ${cardErr ? fmtSupabaseError(cardErr) : ""}`);
    const cardRow = (card ?? [])[0];
    assert(cardRow, `post_card returned no row for the locked post (expected a locked stub)`);
    assert(cardRow.locked === true, `post_card stub came back locked=${cardRow.locked} for anon`);
    assert(
      !Array.isArray(cardRow.media) || cardRow.media.length === 0,
      `post_card stub leaked media entries: ${JSON.stringify(cardRow.media)}`,
    );
    const forbidden = [
      post.storagePath,
      `${ctx.aUserId}/${post.postId}`, // path prefix, in case of renamed objects
      `/${POST_MEDIA_BUCKET}/`, // any URL form into the private bucket
    ];
    const leaks = [...findForbidden(feed, forbidden), ...findForbidden(card, forbidden)];
    assert(
      leaks.length === 0,
      `locked-post payload contains storage references: ${JSON.stringify(leaks)}`,
    );
    // The stub must also blank the caption (only visibility metadata survives).
    const captionLeaks = [
      ...findForbidden(row.caption ?? "", [runId]),
      ...findForbidden(cardRow.caption ?? "", [runId]),
    ];
    assert(captionLeaks.length === 0, `locked stub leaked the caption to anon`);
    log(name, "anon feed + post_card show a locked stub with zero post-media references");

    return {
      name,
      status: "PASS",
      detail:
        "followers-only post appears to anon as a locked stub (feed + post_card, caption/media " +
        "blanked); recursive scan found zero references to the private post-media object",
    };
  } finally {
    await destroySmokePost(ctx, post, name);
  }
}

// ───────────────────────── Check 5: notifications ───────────────────────────

async function checkNotificationScoping(ctx: Ctx): Promise<CheckResult> {
  const name = "NOTIFICATION-SCOPING";
  let followed = false;
  try {
    // Preconditions that legitimately SUPPRESS the notification (emit_notification
    // returns without inserting): A disabled in-app notifications, or A blocked B.
    // Both are by-design states of the real account — SKIP, don't false-FAIL.
    const { data: prefs } = await ctx.a
      .from("notification_preferences")
      .select("in_app_enabled")
      .eq("user_id", ctx.aUserId)
      .maybeSingle();
    if (prefs && prefs.in_app_enabled === false) {
      return {
        name,
        status: "SKIP",
        detail:
          "user A has in-app notifications disabled (notification_preferences.in_app_enabled" +
          "=false) — the follow event is suppressed by design; enable it to run this check",
      };
    }
    const { data: blockRows } = await ctx.a
      .from("blocks")
      .select("blocked_user_id")
      .eq("blocker_id", ctx.aUserId)
      .eq("blocked_user_id", ctx.bUserId)
      .limit(1);
    if ((blockRows ?? []).length > 0) {
      return {
        name,
        status: "SKIP",
        detail: "user A has blocked user B — follow notifications are suppressed by design",
      };
    }

    const { error: followErr } = await ctx.b.rpc("relationship_follow_creator", {
      _username: ctx.aHandle,
    });
    assert(!followErr, `follow failed: ${followErr ? fmtSupabaseError(followErr) : ""}`);
    followed = true;
    log(name, `B followed ${ctx.aHandle}`);

    // The follow trigger emits with dedupe_key
    // 'new_follower:<creator_profile_id>:<follower_id>' (20260519:265) and
    // ON CONFLICT DO NOTHING — so on re-runs the row already EXISTS (with its
    // first-run created_at) rather than being re-created. Assert existence via a
    // TARGETED dedupe-key read — a newest-N page would stop containing the pinned
    // row once enough newer notifications accumulate on the real account.
    const expectedDedupe = `new_follower:${ctx.aCreatorProfileId}:${ctx.bUserId}`;
    let followRow: { id: string; read_at: string | null } | undefined;
    for (let i = 0; i < 10 && !followRow; i++) {
      const { data: hit, error: hitErr } = await ctx.a
        .from("notifications")
        .select("id, recipient_id, read_at")
        .eq("recipient_id", ctx.aUserId)
        .eq("dedupe_key", expectedDedupe)
        .maybeSingle();
      assert(!hitErr, `A dedupe-key read failed: ${hitErr ? fmtSupabaseError(hitErr) : ""}`);
      followRow = hit ?? undefined;
      if (!followRow) await sleep(500);
    }
    assert(followRow, `follow notification (dedupe_key ${expectedDedupe}) never appeared for A`);

    // A's app-path read (notification-actions.ts:62-67): explicit recipient
    // filter — this filter IS the staff-leak fix under test, since A is staff
    // and the admin SELECT policy would otherwise pour other users' rows in.
    const { data: aRows, error: aErr } = await ctx.a
      .from("notifications")
      .select("*")
      .eq("recipient_id", ctx.aUserId)
      .order("created_at", { ascending: false })
      .limit(200);
    assert(!aErr, `A notifications read failed: ${aErr ? fmtSupabaseError(aErr) : ""}`);
    const foreign = (aRows ?? []).filter((r) => r.recipient_id !== ctx.aUserId);
    assert(
      foreign.length === 0,
      `A's app-path notification read returned ${foreign.length} row(s) for OTHER recipients`,
    );
    log(name, "follow notification present for A; every returned row is scoped to A");

    // B's app-path read: same filter, all rows must be B's.
    const { data: bRows, error: bErr } = await ctx.b
      .from("notifications")
      .select("*")
      .eq("recipient_id", ctx.bUserId)
      .order("created_at", { ascending: false })
      .limit(200);
    assert(!bErr, `B notifications read failed: ${bErr ? fmtSupabaseError(bErr) : ""}`);
    const bForeign = (bRows ?? []).filter((r) => r.recipient_id !== ctx.bUserId);
    assert(bForeign.length === 0, `B's read returned ${bForeign.length} foreign row(s)`);

    // B is NOT staff — an UNFILTERED read proves pure-RLS scoping too.
    const { data: bBare, error: bBareErr } = await ctx.b
      .from("notifications")
      .select("recipient_id")
      .limit(200);
    assert(!bBareErr, `B unfiltered read failed: ${bBareErr ? fmtSupabaseError(bBareErr) : ""}`);
    const bLeaks = (bBare ?? []).filter((r) => r.recipient_id !== ctx.bUserId);
    assert(
      bLeaks.length === 0,
      `RLS leak: B's UNFILTERED notifications read returned ${bLeaks.length} foreign row(s)`,
    );
    log(name, "B's filtered and unfiltered reads are both scoped to B");

    // Politeness: don't leave a phantom unread badge on A's real account.
    // (Notifications are system-written and non-deletable by clients — by design.)
    if (followRow && followRow.read_at === null) {
      await ctx.a
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", followRow.id);
    }

    return {
      name,
      status: "PASS",
      detail:
        "follow event delivered to A (dedupe-key match, idempotent across re-runs); A's " +
        "app-path read (A is staff) and B's filtered + unfiltered reads all returned only " +
        "their own rows. Notification row marked read (clients cannot delete; by design).",
    };
  } finally {
    if (followed) {
      const { error } = await ctx.b.rpc("relationship_unfollow_creator", {
        _username: ctx.aHandle,
      });
      if (error) console.error(`  [${name}] unfollow cleanup failed: ${fmtSupabaseError(error)}`);
    }
  }
}

// ───────────────────────── Check 6: realtime ────────────────────────────────

type RealtimeAttempt = {
  ok: boolean;
  detail: string;
  channelError: boolean;
};

async function realtimeAttempt(ctx: Ctx, attempt: number): Promise<RealtimeAttempt> {
  const name = "REALTIME-MESSAGING";
  const body = `${runId} realtime probe ${attempt}`;
  const channels: RealtimeChannel[] = [];
  let conversationId: string | null = null;
  let channelError = false;

  try {
    // Two simultaneous subscriptions with DISTINCT topics, mirroring the
    // `${channelName}:${instanceId}` per-instance pattern (use-messaging.ts:55)
    // — e.g. the inbox list + the global unread badge mounted at once. Bindings
    // mirror useConversations/useUnreadMessages (use-messaging.ts:81,131):
    // UNFILTERED postgres_changes on messages + message_read_receipts (a
    // conversation_id filter is rejected by Realtime — use-messaging.ts:108-114).
    ctx.a.realtime.setAuth(ctx.aSession.access_token);

    const received: boolean[] = [false, false];
    const receivers: Promise<void>[] = [];

    for (const [i, topic] of [
      `inbox:${runId}-${attempt}1`,
      `unread:${runId}-${attempt}2`,
    ].entries()) {
      const channel = ctx.a.channel(topic);
      channels.push(channel);
      let resolveMsg: () => void;
      receivers.push(new Promise<void>((r) => (resolveMsg = r)));
      for (const table of ["messages", "message_read_receipts"]) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          (payload: { eventType: string; new: Record<string, unknown> }) => {
            if (payload.eventType === "INSERT" && payload.new?.body === body) {
              received[i] = true;
              resolveMsg();
            }
          },
        );
      }
      const subscribed = new Promise<void>((resolve, reject) => {
        channel.subscribe((status, err) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            channelError = true;
            reject(
              new Error(
                `channel ${topic} subscription ${status}: ${err ? fmtError(err) : "no error detail"}`,
              ),
            );
          }
        });
      });
      await withTimeout(subscribed, REALTIME_WAIT_MS, `subscribe ${topic}`);
      log(name, `subscribed ${topic}`);
    }

    // B starts (or reuses) the direct conversation and sends the probe message,
    // via the exact app paths (messaging-actions.ts:113 RPC, :65-68 insert).
    const { data: cid, error: convErr } = await ctx.b.rpc("start_conversation_with_username", {
      _username: ctx.aHandle,
    });
    if (convErr) throw new Error(`start_conversation: ${fmtSupabaseError(convErr)}`);
    conversationId = cid as string;

    const { error: sendErr } = await ctx.b.from("messages").insert({
      conversation_id: conversationId,
      sender_id: ctx.bUserId,
      body,
      message_type: "text",
    });
    if (sendErr) throw new Error(`message insert: ${fmtSupabaseError(sendErr)}`);
    log(name, `B sent probe message in conversation ${conversationId}`);

    await withTimeout(
      Promise.all(receivers),
      REALTIME_WAIT_MS,
      `both channels receiving the INSERT (got: inbox=${received[0]}, unread=${received[1]})`,
    );
    return {
      ok: true,
      detail: "both simultaneous subscriptions received the INSERT",
      channelError,
    };
  } catch (e) {
    return { ok: false, detail: fmtError(e), channelError };
  } finally {
    for (const channel of channels) {
      await ctx.a.removeChannel(channel).catch(() => {});
    }
    if (conversationId) {
      // Soft-delete the probe message as its sender (messaging-actions.ts:78-84).
      // The conversation row itself has no user-facing delete path (by design).
      const { error } = await ctx.b
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("sender_id", ctx.bUserId)
        .eq("body", body);
      if (error) console.error(`  [${name}] message cleanup failed: ${fmtSupabaseError(error)}`);
    }
  }
}

async function checkRealtimeMessaging(ctx: Ctx): Promise<CheckResult> {
  const name = "REALTIME-MESSAGING";

  // Success is judged BEFORE the channelError flag: subscribe() status callbacks
  // fire for the channel's whole lifetime in realtime-js, so a transient socket
  // blip mid-window can set channelError even though both events arrived and
  // realtime-js auto-rejoined. If both channels received the INSERT, the
  // per-instance-topic regression is definitionally absent. A channel-error
  // attempt that failed to deliver gets the same single retry as a timeout.
  const first = await realtimeAttempt(ctx, 1);
  if (first.ok) {
    return {
      name,
      status: "PASS",
      detail:
        "two simultaneous subscriptions (distinct per-instance topics) both received B's " +
        `message INSERT within 15s${first.channelError ? " (a transient channel error was auto-recovered)" : "; no channel-subscription errors"}`,
    };
  }

  log(name, `first attempt failed (${first.detail}) — retrying once`);
  const second = await realtimeAttempt(ctx, 2);
  if (second.ok) {
    return {
      name,
      status: "FLAKY",
      detail: `passed on retry; first attempt: ${first.detail}`,
    };
  }
  if (first.channelError || second.channelError) {
    return {
      name,
      status: "FAIL",
      detail:
        `delivery failed with channel-subscription error(s) (possible per-instance-topic ` +
        `regression) — attempt 1: ${first.detail}; attempt 2: ${second.detail}`,
    };
  }
  return {
    name,
    status: "FAIL",
    detail: `both attempts timed out — attempt 1: ${first.detail}; attempt 2: ${second.detail}`,
  };
}

// ───────────────────────── Checks 7+8: DB state ─────────────────────────────

async function checkDbState(ctx: Ctx): Promise<CheckResult> {
  const name = "DB-STATE";

  // creator_content_analytics is granted to authenticated only (20260524):
  // anon must get a PERMISSION error — not "function not found" (which would
  // mean the migration never reached this database).
  const { data: anonData, error: anonErr } = await ctx.anon.rpc("creator_content_analytics", {
    _limit: 1,
  });
  if (!anonErr) {
    throw new Error(
      `SECURITY: anon executed creator_content_analytics and got ${JSON.stringify(anonData)}`,
    );
  }
  const missingFn =
    anonErr.code === "PGRST202" ||
    anonErr.code === "42883" ||
    /could not find the function|does not exist/i.test(anonErr.message ?? "");
  assert(
    !missingFn,
    `creator_content_analytics MISSING from production DB: ${fmtSupabaseError(anonErr)}`,
  );
  const denied = anonErr.code === "42501" || /permission denied/i.test(anonErr.message ?? "");
  assert(denied, `expected a permission denial for anon, got: ${fmtSupabaseError(anonErr)}`);
  log(name, `anon creator_content_analytics correctly denied (${anonErr.code})`);

  // public_creator_profiles.post_count must be a REAL published-post count
  // (20260530 H5 replaced a hardcoded 0). "Is a number" can't tell the two view
  // definitions apart — the hardcoded 0 is also a number — so measure the count
  // across publishing one caption-only smoke post: +1 proves the live view
  // actually counts; no change means H5 never reached this database.
  const readPostCount = async (): Promise<number> => {
    const { data: profile, error: viewErr } = await ctx.a
      .from("public_creator_profiles")
      .select("username, post_count")
      .eq("username", ctx.aHandle)
      .maybeSingle();
    assert(
      !viewErr,
      `public_creator_profiles read failed: ${viewErr ? fmtSupabaseError(viewErr) : ""}`,
    );
    assert(profile, `no public_creator_profiles row for ${ctx.aHandle}`);
    assert(
      typeof profile.post_count === "number",
      `post_count is ${JSON.stringify(profile.post_count)} (expected a number)`,
    );
    return profile.post_count;
  };

  const before = await readPostCount();
  let probePostId: string | null = null;
  let delta = 0;
  try {
    const { data: probe, error: probeErr } = await ctx.a
      .from("posts")
      .insert({
        creator_profile_id: ctx.aCreatorProfileId,
        caption: `${runId} post_count probe`,
        visibility: "public",
        price_cents: null,
        currency: "USD",
        status: "draft",
      })
      .select("id")
      .single();
    assert(!probeErr, `probe post insert failed: ${probeErr ? fmtSupabaseError(probeErr) : ""}`);
    probePostId = probe.id;
    const { error: pubErr } = await ctx.a
      .from("posts")
      .update({ status: "published", published_at: backdatedPublishedAt() })
      .eq("id", probe.id);
    assert(!pubErr, `probe post publish failed: ${pubErr ? fmtSupabaseError(pubErr) : ""}`);
    delta = (await readPostCount()) - before;
  } finally {
    if (probePostId) {
      const { error } = await ctx.a.from("posts").delete().eq("id", probePostId);
      if (error) console.error(`  [${name}] probe post cleanup failed: ${fmtSupabaseError(error)}`);
    }
  }
  assert(
    delta === 1,
    `post_count did not track a newly published post (delta ${delta}, count ${before} before) — ` +
      `the 20260530 H5 view fix (real count instead of hardcoded 0) is likely NOT applied to ` +
      `this database`,
  );
  log(name, `public_creator_profiles.post_count tracks published posts (${before} → +1)`);

  return {
    name,
    status: "PASS",
    detail:
      `creator_content_analytics exists and denies anon (${anonErr.code}); ` +
      `public_creator_profiles.post_count is a real live count (tracked a published post, ` +
      `${before} → ${before + 1})`,
  };
}

async function checkAdminFinance(ctx: Ctx): Promise<CheckResult> {
  const name = "ADMIN-FINANCE";
  if (!ctx.aIsAdmin) {
    return {
      name,
      status: "SKIP",
      detail: "user A is not an admin (is_current_user_admin=false) — admin-RLS reads untestable",
    };
  }
  // Same select as getAdminTransactions (admin-finance-actions.ts:76-88).
  const { data: rows, error } = await ctx.a
    .from("transactions")
    .select(TXN_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);
  assert(!error, `admin transactions read failed: ${error ? fmtSupabaseError(error) : ""}`);
  if (!rows || rows.length === 0) {
    return {
      name,
      status: "SKIP",
      detail: "ledger has no transactions visible to admin — creator-name join untestable",
    };
  }
  // Rows that still reference a creator must resolve handle+name through the
  // embedded join; FK-nulled rows (deleted accounts, by design) are exempt.
  // Null-only checks: creator_profiles.name is `text not null default ''`, so an
  // EMPTY string is schema-legal live data (creator never set a display name) —
  // only a missing embed / SQL NULL means the join actually failed to resolve.
  const linked = rows.filter((r) => r.creator_profile_id !== null);
  const broken = linked.filter((r) => {
    const embed = r.creator_profiles as { handle?: string | null; name?: string | null } | null;
    const creator = Array.isArray(embed) ? embed[0] : embed;
    return creator?.handle == null || creator?.name == null;
  });
  assert(
    broken.length === 0,
    `${broken.length}/${linked.length} linked transaction(s) resolved a null creator name/handle`,
  );
  return {
    name,
    status: "PASS",
    detail: `${rows.length} ledger row(s) read under admin RLS; all ${linked.length} creator-linked rows resolve non-null creator handle+name`,
  };
}

// ─────────────────────────────── Main ───────────────────────────────────────

async function main() {
  console.log(`\nCABANA production smoke test — run ${runId}\n`);

  // Phase 1: prerequisites — fail fast with instructions before anything runs.
  const fileEnv = existsSync(ENV_SMOKE_PATH) ? parseEnvFile(ENV_SMOKE_PATH) : {};
  const env: Record<string, string> = { ...fileEnv };
  for (const key of REQUIRED_KEYS) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  const missing = REQUIRED_KEYS.filter((k) => !env[k]);
  if (missing.length > 0) {
    printMissingEnvInstructions(missing);
    process.exit(2);
  }
  assertNotServiceRole(env.SMOKE_SUPABASE_KEY);

  const supabaseUrl = env.SMOKE_SUPABASE_URL.replace(/\/+$/, "");
  const baseUrl = (env.SMOKE_BASE_URL ?? process.env.SMOKE_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );

  if (process.argv.includes("--setup")) {
    await setupUserB(env);
  }

  const clientOpts = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  } as const;
  const anon = createClient(supabaseUrl, env.SMOKE_SUPABASE_KEY, clientOpts);
  const a = createClient(supabaseUrl, env.SMOKE_SUPABASE_KEY, clientOpts);
  const b = createClient(supabaseUrl, env.SMOKE_SUPABASE_KEY, clientOpts);

  // Validate BOTH users' credentials up front (cabana-auth.ts:102 login path) —
  // never report downstream checks as FAIL when the real problem is credentials.
  console.log("── Validating credentials…");
  const [aAuth, bAuth] = [
    await a.auth.signInWithPassword({
      email: env.SMOKE_USER_A_EMAIL.trim().toLowerCase(),
      password: env.SMOKE_USER_A_PASSWORD,
    }),
    await b.auth.signInWithPassword({
      email: env.SMOKE_USER_B_EMAIL.trim().toLowerCase(),
      password: env.SMOKE_USER_B_PASSWORD,
    }),
  ];
  for (const [label, auth, hint] of [
    ["A", aAuth, "SMOKE_USER_A_* must be an existing creator/admin account."],
    [
      "B",
      bAuth,
      'SMOKE_USER_B_* may not exist yet — run "bun run smoke:prod --setup" to sign it up, ' +
        'or fix the password. If the error is "Email not confirmed", confirm B\'s inbox once.',
    ],
  ] as const) {
    if (auth.error || !auth.data.session) {
      console.error(
        `\n✗ ABORT: user ${label} cannot sign in — no checks were run.\n  ${
          auth.error ? fmtSupabaseError(auth.error) : "no session returned"
        }\n  ${hint}\n`,
      );
      process.exit(2);
    }
  }
  const aSession = aAuth.data.session!;
  const bSession = bAuth.data.session!;
  const aUserId = aSession.user.id;
  const bUserId = bSession.user.id;
  console.log(`  ✓ A signed in (${aUserId})`);
  console.log(`  ✓ B signed in (${bUserId})`);

  // A must be a creator (checks 3-5 depend on the creator profile).
  const { data: creator, error: creatorErr } = await a
    .from("creator_profiles")
    .select("id, handle")
    .eq("user_id", aUserId)
    .maybeSingle();
  if (creatorErr || !creator) {
    console.error(
      `\n✗ ABORT: user A has no creator_profiles row — A must be an existing creator.\n  ${
        creatorErr ? fmtSupabaseError(creatorErr) : ""
      }\n`,
    );
    process.exit(2);
  }
  const { data: isAdmin } = await a.rpc("is_current_user_admin");
  console.log(`  ✓ A is creator "${creator.handle}" (admin: ${isAdmin === true})\n`);

  const ctx: Ctx = {
    anon,
    a,
    b,
    aSession,
    bSession,
    aUserId,
    bUserId,
    aCreatorProfileId: creator.id,
    aHandle: creator.handle,
    aIsAdmin: isAdmin === true,
    supabaseUrl,
    baseUrl,
  };

  // Startup sweep: remove leftovers from prior crashed runs.
  console.log("── Sweeping leftover smoke_* data from prior runs…");
  try {
    await sweepSmokeData(ctx, "sweep");
  } catch (e) {
    console.error(`  sweep error (continuing): ${fmtError(e)}`);
  }
  console.log("");

  // Run every check — one failing never crashes the run.
  const checks: Array<[string, (ctx: Ctx) => Promise<CheckResult>]> = [
    ["DEPLOY-FRESHNESS", checkDeployFreshness],
    ["AVATAR-STORAGE", checkAvatarStorage],
    ["POST-MEDIA-PUBLIC", checkPostMediaPublic],
    ["POST-MEDIA-LOCKED", checkPostMediaLocked],
    ["NOTIFICATION-SCOPING", checkNotificationScoping],
    ["REALTIME-MESSAGING", checkRealtimeMessaging],
    ["DB-STATE", checkDbState],
    ["ADMIN-FINANCE", checkAdminFinance],
  ];
  const results: CheckResult[] = [];
  for (const [checkName, fn] of checks) {
    console.log(`── ${checkName}`);
    try {
      results.push(await withTimeout(fn(ctx), CHECK_TIMEOUT_MS, checkName));
    } catch (e) {
      results.push({ name: checkName, status: "FAIL", detail: fmtError(e) });
    }
    console.log("");
  }

  // Final step: prove the run left no smoke_* data behind.
  console.log("── CLEANUP-RESIDUE");
  try {
    results.push(await withTimeout(checkCleanupResidue(ctx), CHECK_TIMEOUT_MS, "residue scan"));
  } catch (e) {
    results.push({ name: "CLEANUP-RESIDUE", status: "FAIL", detail: fmtError(e) });
  }

  // Summary table.
  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\n${"═".repeat(78)}\nRESULTS — run ${runId}\n`);
  for (const r of results) {
    const icon =
      r.status === "PASS" ? "✓" : r.status === "SKIP" ? "○" : r.status === "FLAKY" ? "~" : "✗";
    console.log(`  ${icon} ${r.name.padEnd(width)}  ${r.status.padEnd(5)}  ${r.detail}`);
  }
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, FLAKY: 0 };
  for (const r of results) counts[r.status]++;
  console.log(
    `\n  ${counts.PASS} passed, ${counts.FAIL} failed, ${counts.SKIP} skipped, ${counts.FLAKY} flaky\n`,
  );

  // scope:"local" is load-bearing — the default GLOBAL scope revokes every
  // refresh token the user has, force-logging the REAL admin account out of all
  // their devices on every smoke run.
  await Promise.allSettled([
    a.auth.signOut({ scope: "local" }),
    b.auth.signOut({ scope: "local" }),
  ]);
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✗ Unexpected top-level failure: ${fmtError(e)}`);
  process.exit(1);
});
