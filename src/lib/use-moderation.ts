// ============================================================================
// CABANA — admin moderation & audit React hooks (Phase 8)
// ----------------------------------------------------------------------------
// React Query bindings over the moderation server actions. Reads are RLS-scoped
// server-side (staff see all reports + the audit log); these hooks only gate on
// an authenticated session — the routes themselves enforce the staff/admin gate.
// Mutations invalidate the reports + audit-log queries so the queue and trail
// stay live after a triage action.
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/cabana-auth";
import type { ReportStatus } from "@/lib/cabana-moderation";
import {
  assignReport,
  createReport,
  getAuditLogs,
  getReportDetail,
  getReports,
  updateReportStatus,
} from "@/lib/moderation-actions";

const reportsKey = ["reports"] as const;
const auditKey = ["audit-logs"] as const;

// ─────────────────────────────── Reads ──────────────────────────────────────

export function useReports(status?: ReportStatus) {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: [...reportsKey, status ?? "all"] as const,
    enabled: !loading && !!user,
    queryFn: () => getReports({ data: { status } }),
  });
}

export function useReportDetail(reportId: string | undefined) {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: [...reportsKey, "detail", reportId] as const,
    enabled: !loading && !!user && !!reportId,
    queryFn: () => getReportDetail({ data: { reportId: reportId! } }),
  });
}

export function useAuditLogs(targetId?: string) {
  const { user, loading } = useAuthSession();
  return useQuery({
    queryKey: [...auditKey, targetId ?? "all"] as const,
    enabled: !loading && !!user,
    queryFn: () => getAuditLogs({ data: { targetId } }),
  });
}

// ─────────────────────────────── Mutations ──────────────────────────────────

function useInvalidateModeration() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: reportsKey });
    qc.invalidateQueries({ queryKey: auditKey });
  };
}

export function useAssignReport() {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: (reportId: string) => assignReport({ data: { reportId } }),
    onSuccess: invalidate,
  });
}

export function useUpdateReportStatus() {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: (input: { reportId: string; status: ReportStatus; resolution?: string }) =>
      updateReportStatus({ data: input }),
    onSuccess: invalidate,
  });
}

export function useCreateReport() {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: (input: {
      subjectType: string;
      subjectId: string;
      reason: string;
      details?: string;
    }) => createReport({ data: input }),
    onSuccess: invalidate,
  });
}
