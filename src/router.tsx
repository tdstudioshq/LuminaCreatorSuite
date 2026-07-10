import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Fail fast on deterministic errors (default retry:3 ≈ 15s of spinner before
  // any error UI); realtime surfaces already invalidate their queries explicitly.
  const queryClient = new QueryClient({
    // retry:1 fails fast; refetchOnWindowFocus:false stops a full query
    // fan-out (feed N+1, ledger, dashboard) from firing on every tab refocus —
    // live surfaces (messages/notifications) refresh via Realtime invalidation.
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload matched routes on hover/touch intent so navigation feels instant.
    // Safe here: routes have no data loaders and beforeLoads are cheap client
    // session checks / pure redirects (thrown redirects are discarded on preload).
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
