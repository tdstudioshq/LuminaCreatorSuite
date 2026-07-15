// ============================================================================
// CABANA — admin creator-page editor read hooks
// ----------------------------------------------------------------------------
// Session state controls whether requests start; route/UI gates are UX only.
// Both server actions independently assert admin and remain caller-RLS-scoped.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import {
  getAdminCreatorPageAuditHistory,
  getAdminCreatorPageDetail,
} from "@/lib/admin-creator-page-read-actions";
import { useAuthSession } from "@/lib/cabana-auth";
import { ADMIN_CREATOR_PAGE_AUDIT_DEFAULT_LIMIT } from "@/lib/cabana-admin-creator-page-detail";

export const adminCreatorPageKeys = {
  all: ["admin-creator-page"] as const,
  detail: (creatorProfileId: string) => ["admin-creator-page", "detail", creatorProfileId] as const,
  auditHistory: (creatorProfileId: string, limit = ADMIN_CREATOR_PAGE_AUDIT_DEFAULT_LIMIT) =>
    ["admin-creator-page", "audit-history", creatorProfileId, limit] as const,
};

export function useAdminCreatorPageDetail(creatorProfileId: string | undefined) {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: adminCreatorPageKeys.detail(creatorProfileId ?? ""),
    enabled: !loading && !!user && !!creatorProfileId,
    queryFn: () => getAdminCreatorPageDetail({ data: { creatorProfileId: creatorProfileId! } }),
  });
}

export function useAdminCreatorPageAuditHistory(
  creatorProfileId: string | undefined,
  limit = ADMIN_CREATOR_PAGE_AUDIT_DEFAULT_LIMIT,
) {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: adminCreatorPageKeys.auditHistory(creatorProfileId ?? "", limit),
    enabled: !loading && !!user && !!creatorProfileId,
    queryFn: () =>
      getAdminCreatorPageAuditHistory({
        data: { creatorProfileId: creatorProfileId!, limit },
      }),
  });
}
