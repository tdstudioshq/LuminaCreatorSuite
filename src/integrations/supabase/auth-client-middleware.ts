// Client-side companion to the (generated) `auth-middleware.ts`.
//
// `requireSupabaseAuth` validates an `Authorization: Bearer <token>` header on
// the server. This client function-middleware reads the current Supabase
// session and attaches that header to outgoing server-function requests, so the
// two compose into an authenticated, RLS-scoped server-action tier.
//
// Not auto-generated — safe to edit.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseToken = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next(token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  },
);
