// Client-side companion to the (generated) `auth-middleware.ts`.
//
// `requireSupabaseAuth` validates an `Authorization: Bearer <token>` header on
// the server. This client function-middleware reads the current Supabase
// session and attaches that header to outgoing server-function requests, so the
// two compose into an authenticated, RLS-scoped server-action tier.
//
// It ALSO closes the M-18 auth-failure hole: when the server middleware
// short-circuits an unauthenticated/expired call it does so by THROWING a
// `Response` (401/403). TanStack's server-fn client deserializes that thrown
// Response and *resolves* it as the call result (a Response is not an Error, so
// serverFnFetcher returns it rather than throwing). Without a guard, every
// authenticated read then renders the 401 body as data (fake $0.00 / empty
// states) and every write fires a false `onSuccess` (e.g. "Subscribed!") for an
// action that never ran server-side. Since this client middleware wraps every
// authed action (it is composed alongside `requireSupabaseAuth`/
// `optionalSupabaseAuth` in all of them), coercing a non-OK `Response` result
// into a thrown Error here fixes all consumers at once — React Query then treats
// it as the error it is (→ QueryErrorState / mutation `onError`). Success
// payloads are always plain data (never a `Response`), so the guard only fires
// on the auth short-circuit; guest-callable (`optionalSupabaseAuth`) reads never
// produce a 401 and are unaffected.
//
// ⚠️ VERSION-COUPLED: this guard depends on TanStack Start's internal client
// middleware shape — that `next()` resolves to a context object whose `result`
// field holds the (thrown-and-deserialized) `Response`. Verified against
// `@tanstack/react-start@^1.167.50` (see package.json). If a future upgrade
// changes how a thrown server-side `Response` surfaces on the client (e.g. it
// starts rejecting instead of resolving, or moves off `ctx.result`), this
// coercion silently no-ops and the M-18 fake-data-on-401 regression returns —
// re-verify this path when bumping `@tanstack/react-start`.
//
// Not auto-generated — safe to edit.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseToken = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const ctx = await next(token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);

    const payload = (ctx as { result?: unknown } | undefined)?.result;
    if (payload instanceof Response && !payload.ok) {
      const status = payload.status;
      throw new Error(
        status === 401 || status === 403
          ? "Your session has expired. Please sign in again."
          : `Request failed (${status}).`,
      );
    }
    return ctx;
  },
);
