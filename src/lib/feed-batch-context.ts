// H-08 feed batching — the gate that tells per-card media/engagement hooks NOT
// to self-fetch because an enclosing <FeedBatchScope> is fetching them in one
// batched round-trip and seeding their React Query caches. Outside a scope
// (e.g. the single-post detail page) the gate is `false` and the hooks fetch
// individually exactly as before.
import { createContext, useContext } from "react";

export const FeedBatchContext = createContext(false);

/** True when rendered inside a <FeedBatchScope> (per-card hooks should not fetch). */
export function useFeedBatchGate(): boolean {
  return useContext(FeedBatchContext);
}
