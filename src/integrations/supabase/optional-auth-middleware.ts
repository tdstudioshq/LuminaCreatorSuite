// Optional-auth companion to `auth-middleware.ts`.
//
// `requireSupabaseAuth` rejects unauthenticated callers. Some server functions
// (e.g. reading a creator's PUBLIC posts) must work for guests while still
// honoring a signed-in viewer's identity (so follower-only content resolves via
// `auth.uid()` inside SECURITY DEFINER RPCs). This middleware:
//   * forwards a valid Bearer token to a request-scoped, RLS-enforced client
//     and sets `userId`, OR
//   * falls back to an anonymous client (`userId = null`) when no/invalid token
//     is present — it never throws on missing auth.
//
// Not auto-generated — safe to edit.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const optionalSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response("Supabase environment is not configured", { status: 500 });
    }

    const authConfig = {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    } as const;

    const token = getRequest()
      ?.headers.get("authorization")
      ?.replace(/^Bearer /, "")
      .trim();

    let supabase: SupabaseClient<Database>;
    let userId: string | null = null;

    if (token) {
      supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: authConfig,
      });
      const { data, error } = await supabase.auth.getClaims(token);
      if (error || !data?.claims?.sub) {
        // Invalid/expired token → treat as an anonymous viewer rather than 401.
        supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: authConfig,
        });
      } else {
        userId = data.claims.sub;
      }
    } else {
      supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: authConfig,
      });
    }

    return next({ context: { supabase, userId } });
  },
);
