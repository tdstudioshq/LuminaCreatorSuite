// ============================================================================
// CABANA — protected admin moderation & audit server actions (Phase 8)
// ----------------------------------------------------------------------------
// The moderation queue (`reports`) and the audit trail (`audit_logs`). All run
// under the caller's RLS (`attachSupabaseToken` + `requireSupabaseAuth`):
//   * any authenticated user may create a report and read their own;
//   * STAFF (admin/moderator) read all reports + the audit log and triage
//     reports — enforced by the staff-only RLS policies, not by these handlers.
// Audit rows are written by the Phase 8 DB trigger on report changes (no client
// INSERT into audit_logs). No service role. Must stay outside any `**/server/**`
// path.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type AuditLogItem,
  type ReportItem,
  type ReportStatus,
  REPORT_STATUSES,
  canTransitionReport,
  mapAuditLog,
  mapReport,
  normalizeResolution,
  reportStatusLabel,
  validateReportInput,
} from "@/lib/cabana-moderation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID.test(raw)) throw new Error(`A valid ${label} is required.`);
  return raw.toLowerCase();
}

function optionalStatus(raw: unknown): ReportStatus | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string" || !REPORT_STATUSES.includes(raw as ReportStatus)) {
    throw new Error("A valid report status is required.");
  }
  return raw as ReportStatus;
}

function requiredStatus(raw: unknown): ReportStatus {
  const status = optionalStatus(raw);
  if (!status) throw new Error("A valid report status is required.");
  return status;
}

// ─────────────────────────────── Reads ──────────────────────────────────────

/**
 * Reports visible to the caller (RLS: own if a reporter, all if staff), newest
 * first. Optional status filter for the triage queue tabs.
 */
export const getReports = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { status?: unknown } | undefined) => ({
    status: optionalStatus(raw?.status),
  }))
  .handler(async ({ context, data }): Promise<ReportItem[]> => {
    const { supabase } = context;
    let query = supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapReport);
  });

/** A single report (RLS-scoped). Returns null if not visible / not found. */
export const getReportDetail = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { reportId?: unknown }) => ({ reportId: uuid(raw?.reportId, "report id") }))
  .handler(async ({ context, data }): Promise<ReportItem | null> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("reports")
      .select("*")
      .eq("id", data.reportId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? mapReport(row) : null;
  });

/** The audit trail (RLS: staff only), newest first. Optional target filter. */
export const getAuditLogs = createServerFn({ method: "GET" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { targetId?: unknown } | undefined) => ({
    targetId: raw?.targetId === undefined ? undefined : uuid(raw?.targetId, "target id"),
  }))
  .handler(async ({ context, data }): Promise<AuditLogItem[]> => {
    const { supabase } = context;
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.targetId) query = query.eq("target_id", data.targetId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapAuditLog);
  });

// ─────────────────────────────── Writes ─────────────────────────────────────

/** File a report (reporter = the caller). Any authenticated user. */
export const createReport = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator(
    (raw: { subjectType?: unknown; subjectId?: unknown; reason?: unknown; details?: unknown }) =>
      validateReportInput(raw),
  )
  .handler(async ({ context, data }): Promise<ReportItem> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("reports")
      .insert({
        reporter_user_id: userId,
        subject_type: data.subjectType,
        subject_id: data.subjectId,
        reason: data.reason,
        details: data.details,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapReport(row);
  });

/** Assign a report to the calling staff member (RLS: staff only). */
export const assignReport = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { reportId?: unknown }) => ({ reportId: uuid(raw?.reportId, "report id") }))
  .handler(async ({ context, data }): Promise<ReportItem> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("reports")
      .update({ assigned_admin_user_id: userId })
      .eq("id", data.reportId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapReport(row);
  });

/**
 * Move a report to a new status (RLS: staff only). The target transition is
 * validated against the current status before the write; the DB trigger appends
 * the audit row atomically.
 */
export const updateReportStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseToken, requireSupabaseAuth])
  .inputValidator((raw: { reportId?: unknown; status?: unknown; resolution?: unknown }) => ({
    reportId: uuid(raw?.reportId, "report id"),
    status: requiredStatus(raw?.status),
    resolution: normalizeResolution(raw?.resolution),
  }))
  .handler(async ({ context, data }): Promise<ReportItem> => {
    const { supabase } = context;
    const { data: current, error: readError } = await supabase
      .from("reports")
      .select("status")
      .eq("id", data.reportId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("Report not found.");
    if (!canTransitionReport(current.status, data.status)) {
      throw new Error(
        `Cannot move a report from ${reportStatusLabel(current.status)} to ${reportStatusLabel(data.status)}.`,
      );
    }
    const { data: row, error } = await supabase
      .from("reports")
      .update({ status: data.status, resolution: data.resolution })
      .eq("id", data.reportId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapReport(row);
  });
