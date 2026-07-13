// POST /api/webhooks/stream — Cloudflare Stream lifecycle webhook.
// Thin by convention: verification, parsing, and the guarded lifecycle write
// all live in the server-only handler module, imported DYNAMICALLY inside the
// server handler so no server code can reach a client bundle. Only POST is
// registered; other methods fall through to the router's not-found handling
// (the handler itself also 405s as a belt).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/webhooks/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleStreamWebhookRequest } = await import("@/lib/stream-webhook.server");
        return handleStreamWebhookRequest(request);
      },
    },
  },
});
