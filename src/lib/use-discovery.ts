import { useQuery } from "@tanstack/react-query";
import { getDiscoverySearchResults, getDiscoverySnapshot } from "@/lib/discovery-actions";
import { normalizeDiscoveryQuery } from "@/lib/cabana-discovery";

const discoverySnapshotKey = ["discovery", "snapshot"] as const;
const discoverySearchKey = (query: string) => ["discovery", "search", query] as const;

export function useDiscoverySnapshot() {
  return useQuery({
    queryKey: discoverySnapshotKey,
    queryFn: () => getDiscoverySnapshot(),
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
