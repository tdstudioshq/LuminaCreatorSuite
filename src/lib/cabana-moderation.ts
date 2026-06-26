// ============================================================================
// CABANA — admin moderation & audit domain layer (PURE)
// ----------------------------------------------------------------------------
// No React, no Supabase, no browser APIs, no side effects. Single source of
// truth for the Phase 8 moderation slice: row → domain mapping, report-input
// validation, the report-status state machine, queue grouping/counts, display
// labels, and the canonical audit-entry shape that mirrors the SQL trigger.
// The server actions (`moderation-actions.ts`) and hooks (`use-moderation.ts`)
// delegate rule + display logic here so it stays testable without a DB.
//
// INTERNAL / staff only. This slice is moderation + audit; it does not move
// money or send any external notification.
// ============================================================================
import type { Database, Json } from "@/integrations/supabase/types";

export type ReportSubjectType = Database["public"]["Enums"]["report_subject_type"];
export type ReportReason = Database["public"]["Enums"]["report_reason"];
export type ReportStatus = Database["public"]["Enums"]["report_status"];
export type AuditActorRole = Database["public"]["Enums"]["audit_actor_role"];

type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];

export const REPORT_SUBJECT_TYPES: readonly ReportSubjectType[] = [
  "user",
  "creator",
  "post",
  "comment",
  "message",
];
// Ordered for the member-facing report reason selector (Phase 8B). Validation
// uses membership only, so this order is purely presentational; the DB enum keeps
// the original physical order with `hate` / `sexual_content` appended.
export const REPORT_REASONS: readonly ReportReason[] = [
  "spam",
  "harassment",
  "hate",
  "sexual_content",
  "impersonation",
  "scam",
  "copyright",
  "other",
];
export const REPORT_STATUSES: readonly ReportStatus[] = [
  "open",
  "reviewing",
  "resolved",
  "dismissed",
];

const MAX_DETAILS = 2000;
const MAX_RESOLUTION = 2000;

// ─────────────────────────────── Domain types ───────────────────────────────

export type ReportItem = {
  id: string;
  reporterUserId: string;
  subjectType: ReportSubjectType;
  subjectId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  assignedAdminUserId: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogItem = {
  id: string;
  actorUserId: string | null;
  actorRole: AuditActorRole;
  action: string;
  targetType: string;
  targetId: string | null;
  before: Record<string, Json>;
  after: Record<string, Json>;
  reason: string | null;
  createdAt: string;
};

export type ReportInput = {
  subjectType: ReportSubjectType;
  subjectId: string;
  reason: ReportReason;
  details: string | null;
};

export type ReportStatusCounts = Record<ReportStatus, number>;

export type AuditEntry = {
  actorUserId: string | null;
  actorRole: AuditActorRole;
  action: string;
  targetType: string;
  targetId: string | null;
  before: Record<string, Json>;
  after: Record<string, Json>;
  reason: string | null;
};

// ─────────────────────────────── Mappers ────────────────────────────────────

export function mapReport(row: ReportRow): ReportItem {
  return {
    id: row.id,
    reporterUserId: row.reporter_user_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    assignedAdminUserId: row.assigned_admin_user_id,
    resolution: row.resolution,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asObject(value: Json | null | undefined): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

export function mapAuditLog(row: AuditLogRow): AuditLogItem {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    before: asObject(row.before),
    after: asObject(row.after),
    reason: row.reason,
    createdAt: row.created_at,
  };
}

// ─────────────────────────────── Validation ─────────────────────────────────

/**
 * Validate + normalize a report submission. Throws on invalid input (the server
 * action surfaces the message). Blank details normalize to null.
 */
export function validateReportInput(input: {
  subjectType?: unknown;
  subjectId?: unknown;
  reason?: unknown;
  details?: unknown;
}): ReportInput {
  const subjectType = input.subjectType;
  if (
    typeof subjectType !== "string" ||
    !REPORT_SUBJECT_TYPES.includes(subjectType as ReportSubjectType)
  ) {
    throw new Error("A valid report subject type is required.");
  }
  const reason = input.reason;
  if (typeof reason !== "string" || !REPORT_REASONS.includes(reason as ReportReason)) {
    throw new Error("A valid report reason is required.");
  }
  if (typeof input.subjectId !== "string" || input.subjectId.trim().length === 0) {
    throw new Error("A report subject is required.");
  }
  const rawDetails = typeof input.details === "string" ? input.details.trim() : "";
  if (rawDetails.length > MAX_DETAILS) {
    throw new Error(`Report details must be ${MAX_DETAILS} characters or fewer.`);
  }
  return {
    subjectType: subjectType as ReportSubjectType,
    subjectId: input.subjectId.trim(),
    reason: reason as ReportReason,
    details: rawDetails.length > 0 ? rawDetails : null,
  };
}

/** Validate + normalize a staff resolution note (optional). */
export function normalizeResolution(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length > MAX_RESOLUTION) {
    throw new Error(`Resolution must be ${MAX_RESOLUTION} characters or fewer.`);
  }
  return text.length > 0 ? text : null;
}

// ─────────────────────────────── Status state machine ───────────────────────

const TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  open: ["reviewing", "resolved", "dismissed"],
  reviewing: ["open", "resolved", "dismissed"],
  resolved: ["reviewing"], // reopen
  dismissed: ["reviewing"], // reopen
};

/** Whether a report may move directly from `from` to `to` (same → same is not a move). */
export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

/** The statuses a report in `from` may move to. */
export function allowedTransitions(from: ReportStatus): readonly ReportStatus[] {
  return TRANSITIONS[from];
}

/** Resolved + dismissed are terminal (a closed report). */
export function isTerminalStatus(status: ReportStatus): boolean {
  return status === "resolved" || status === "dismissed";
}

/** Open + reviewing are the active (still-actionable) statuses. */
export function isActiveStatus(status: ReportStatus): boolean {
  return !isTerminalStatus(status);
}

// ─────────────────────────────── Display labels ─────────────────────────────

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Resolved",
  dismissed: "Dismissed",
};
const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate: "Hate",
  sexual_content: "Sexual Content",
  impersonation: "Impersonation",
  copyright: "Copyright",
  scam: "Scam/Fraud",
  other: "Other",
};
const SUBJECT_LABELS: Record<ReportSubjectType, string> = {
  user: "Member",
  creator: "Creator",
  post: "Post",
  comment: "Comment",
  message: "Message",
};

export function reportStatusLabel(status: ReportStatus): string {
  return STATUS_LABELS[status] ?? status;
}
export function reportReasonLabel(reason: ReportReason): string {
  return REASON_LABELS[reason] ?? reason;
}
export function reportSubjectLabel(subjectType: ReportSubjectType): string {
  return SUBJECT_LABELS[subjectType] ?? subjectType;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "report.open": "Report reopened",
  "report.reviewing": "Report under review",
  "report.resolved": "Report resolved",
  "report.dismissed": "Report dismissed",
  "report.assigned": "Report assigned",
};

/** Human label for an audit action key (falls back to a title-cased form). */
export function auditActionLabel(action: string): string {
  const known = AUDIT_ACTION_LABELS[action];
  if (known) return known;
  return action
    .split(/[._]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─────────────────────────────── Queue helpers ──────────────────────────────

const STATUS_ORDER: Record<ReportStatus, number> = {
  open: 0,
  reviewing: 1,
  resolved: 2,
  dismissed: 3,
};

export function countReportsByStatus(reports: readonly ReportItem[]): ReportStatusCounts {
  const counts: ReportStatusCounts = { open: 0, reviewing: 0, resolved: 0, dismissed: 0 };
  for (const r of reports) counts[r.status] += 1;
  return counts;
}

/** Number of still-actionable (open + reviewing) reports. */
export function countActiveReports(reports: readonly ReportItem[]): number {
  let n = 0;
  for (const r of reports) if (isActiveStatus(r.status)) n += 1;
  return n;
}

export function filterReportsByStatus(
  reports: readonly ReportItem[],
  status: ReportStatus,
): ReportItem[] {
  return reports.filter((r) => r.status === status);
}

/**
 * Triage order for the queue: active statuses first (open before reviewing),
 * then terminal ones; newest first within a status. Pure + stable (does not
 * mutate the input).
 */
export function sortReportsForQueue(reports: readonly ReportItem[]): ReportItem[] {
  return [...reports].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    const at = Date.parse(a.createdAt);
    const bt = Date.parse(b.createdAt);
    const am = Number.isNaN(at) ? 0 : at;
    const bm = Number.isNaN(bt) ? 0 : bt;
    return bm - am;
  });
}

// ─────────────────────────────── Audit entry shape ──────────────────────────

/**
 * Canonical audit-entry shape for a privileged action, mirroring what the SQL
 * `on_report_change_audit` trigger writes. The trigger is the source of truth
 * for report triage; this builder keeps the TS shape aligned (and is reusable
 * for any future client-surfaced audit preview / non-trigger audit write).
 */
export function buildAuditEntry(params: {
  actorUserId?: string | null;
  actorRole: AuditActorRole;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: Record<string, Json> | null;
  after?: Record<string, Json> | null;
  reason?: string | null;
}): AuditEntry {
  const action = params.action.trim();
  if (action.length === 0) throw new Error("An audit action is required.");
  const targetType = params.targetType.trim();
  if (targetType.length === 0) throw new Error("An audit target type is required.");
  return {
    actorUserId: params.actorUserId ?? null,
    actorRole: params.actorRole,
    action,
    targetType,
    targetId: params.targetId ?? null,
    before: params.before ?? {},
    after: params.after ?? {},
    reason: params.reason?.trim() ? params.reason.trim() : null,
  };
}
