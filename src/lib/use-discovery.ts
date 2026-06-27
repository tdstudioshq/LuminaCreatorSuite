import { useQuery } from "@tanstack/react-query";
import { getDiscoverySearchResults, getDiscoverySnapshot } from "@/lib/discovery-actions";
import { normalizeDiscoveryQuery, type DiscoveryTimeWindow } from "@/lib/cabana-discovery";

const discoverySnapshotKey = (timeWindow: DiscoveryTimeWindow) =>
  ["discovery", "snapshot", timeWindow] as const;
const discoverySearchKey = (query: string) => ["discovery", "search", query] as const;

export function useDiscoverySnapshot(timeWindow: DiscoveryTimeWindow = "7d") {
  return useQuery({
    queryKey: discoverySnapshotKey(timeWindow),
    queryFn: () => getDiscoverySnapshot({ data: { timeWindow } }),
    placeholderData: (previous) => previous,
  });
}

export function useDiscoverySearch(query: string) {
  const normalized = normalizeDiscoveryQuery(query);
  return useQuery({
    queryKey: discoverySearchKey(normalized),
    enabled: normalized.length > 0,
    queryFn: () => getDiscoverySearchResults({ data: { query: normalized } }),
  });
}
