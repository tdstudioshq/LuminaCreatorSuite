import { describe, expect, it } from "vitest";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  allowedTransitions,
  auditActionLabel,
  buildAuditEntry,
  canTransitionReport,
  countActiveReports,
  countReportsByStatus,
  filterReportsByStatus,
  isActiveStatus,
  isTerminalStatus,
  mapAuditLog,
  mapReport,
  normalizeResolution,
  REPORT_REASONS,
  reportReasonLabel,
  reportStatusLabel,
  reportSubjectLabel,
  sortReportsForQueue,
  validateReportInput,
  type ReportItem,
} from "@/lib/cabana-moderation";

type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];

const NOW = "2026-06-25T12:00:00.000Z";

function reportRow(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "r1",
    reporter_user_id: "u1",
    subject_type: "post",
    subject_id: "p1",
    reason: "spam",
    details: "looks spammy",
    status: "open",
    assigned_admin_user_id: null,
    resolution: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function item(overrides: Partial<ReportItem> = {}): ReportItem {
  return {
    id: "r1",
    reporterUserId: "u1",
    subjectType: "post",
    subjectId: "p1",
    reason: "spam",
    details: null,
    status: "open",
    assignedAdminUserId: null,
    resolution: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("mapReport", () => {
  it("maps a row to camelCase", () => {
    expect(mapReport(reportRow({ status: "reviewing", assigned_admin_user_id: "a1" }))).toEqual({
      id: "r1",
      reporterUserId: "u1",
      subjectType: "post",
      subjectId: "p1",
      reason: "spam",
      details: "looks spammy",
      status: "reviewing",
      assignedAdminUserId: "a1",
      resolution: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
});

describe("mapAuditLog", () => {
  function auditRow(before: Json | null, after: Json | null): AuditLogRow {
    return {
      id: "a1",
      actor_user_id: "admin1",
      actor_role: "admin",
      action: "report.resolved",
      target_type: "report",
      target_id: "r1",
      before,
      after,
      reason: "spam confirmed",
      request_id: null,
      ip_address: null,
      user_agent: null,
      created_at: NOW,
    };
  }
  it("keeps object before/after", () => {
    const mapped = mapAuditLog(auditRow({ status: "open" }, { status: "resolved" }));
    expect(mapped.before).toEqual({ status: "open" });
    expect(mapped.after).toEqual({ status: "resolved" });
    expect(mapped.actorRole).toBe("admin");
    expect(mapped.reason).toBe("spam confirmed");
  });
  it("coerces array/null before/after to empty objects", () => {
    const mapped = mapAuditLog(auditRow([1, 2] as unknown as Json, null));
    expect(mapped.before).toEqual({});
    expect(mapped.after).toEqual({});
  });
});

describe("validateReportInput", () => {
  it("normalizes valid input and trims/blanks details", () => {
    expect(
      validateReportInput({
        subjectType: "comment",
        subjectId: "  c1  ",
        reason: "harassment",
        details: "  bad  ",
      }),
    ).toEqual({ subjectType: "comment", subjectId: "c1", reason: "harassment", details: "bad" });
    expect(
      validateReportInput({ subjectType: "user", subjectId: "u9", reason: "scam" }).details,
    ).toBeNull();
    expect(
      validateReportInput({ subjectType: "user", subjectId: "u9", reason: "scam", details: "   " })
        .details,
    ).toBeNull();
  });
  it("accepts the Phase 8B safety reasons (hate, sexual_content)", () => {
    expect(
      validateReportInput({ subjectType: "creator", subjectId: "c1", reason: "hate" }).reason,
    ).toBe("hate");
    expect(
      validateReportInput({ subjectType: "message", subjectId: "m1", reason: "sexual_content" })
        .reason,
    ).toBe("sexual_content");
  });
  it("rejects invalid subject type / reason / subject id / details length", () => {
    expect(() =>
      validateReportInput({ subjectType: "nope", subjectId: "x", reason: "spam" }),
    ).toThrow(/subject type/);
    expect(() =>
      validateReportInput({ subjectType: "post", subjectId: "x", reason: "nope" }),
    ).toThrow(/reason/);
    expect(() =>
      validateReportInput({ subjectType: "post", subjectId: "  ", reason: "spam" }),
    ).toThrow(/subject is required/);
    expect(() =>
      validateReportInput({
        subjectType: "post",
        subjectId: "x",
        reason: "spam",
        details: "a".repeat(2001),
      }),
    ).toThrow(/2000 characters/);
  });
});

describe("normalizeResolution", () => {
  it("trims, blanks to null, rejects overlong", () => {
    expect(normalizeResolution("  done  ")).toBe("done");
    expect(normalizeResolution("   ")).toBeNull();
    expect(normalizeResolution(undefined)).toBeNull();
    expect(() => normalizeResolution("a".repeat(2001))).toThrow(/2000 characters/);
  });
});

describe("status state machine", () => {
  it("allows valid transitions and rejects no-ops / invalid", () => {
    expect(canTransitionReport("open", "reviewing")).toBe(true);
    expect(canTransitionReport("open", "resolved")).toBe(true);
    expect(canTransitionReport("reviewing", "open")).toBe(true);
    expect(canTransitionReport("resolved", "reviewing")).toBe(true);
    expect(canTransitionReport("dismissed", "reviewing")).toBe(true);
    expect(canTransitionReport("open", "open")).toBe(false);
    expect(canTransitionReport("resolved", "open")).toBe(false);
    expect(canTransitionReport("dismissed", "resolved")).toBe(false);
  });
  it("exposes allowed transitions", () => {
    expect(allowedTransitions("open")).toEqual(["reviewing", "resolved", "dismissed"]);
    expect(allowedTransitions("resolved")).toEqual(["reviewing"]);
  });
  it("classifies terminal vs active", () => {
    expect(isTerminalStatus("resolved")).toBe(true);
    expect(isTerminalStatus("dismissed")).toBe(true);
    expect(isTerminalStatus("open")).toBe(false);
    expect(isActiveStatus("reviewing")).toBe(true);
    expect(isActiveStatus("resolved")).toBe(false);
  });
});

describe("labels", () => {
  it("maps status/reason/subject labels", () => {
    expect(reportStatusLabel("reviewing")).toBe("Reviewing");
    expect(reportReasonLabel("impersonation")).toBe("Impersonation");
    expect(reportReasonLabel("hate")).toBe("Hate");
    expect(reportReasonLabel("sexual_content")).toBe("Sexual Content");
    expect(reportReasonLabel("scam")).toBe("Scam/Fraud");
    expect(reportSubjectLabel("user")).toBe("Member");
    expect(reportSubjectLabel("creator")).toBe("Creator");
  });
  it("every reason in REPORT_REASONS has a non-fallback label", () => {
    expect(REPORT_REASONS).toContain("hate");
    expect(REPORT_REASONS).toContain("sexual_content");
    expect(REPORT_REASONS).toHaveLength(8);
    for (const reason of REPORT_REASONS) {
      expect(reportReasonLabel(reason)).not.toBe(reason);
    }
  });
  it("maps known audit actions and title-cases unknown", () => {
    expect(auditActionLabel("report.resolved")).toBe("Report resolved");
    expect(auditActionLabel("report.assigned")).toBe("Report assigned");
    expect(auditActionLabel("report.open")).toBe("Report reopened");
    expect(auditActionLabel("member.restricted")).toBe("Member Restricted");
    expect(auditActionLabel("solo")).toBe("Solo");
  });
});

describe("queue helpers", () => {
  const reports = [
    item({ id: "a", status: "resolved", createdAt: "2026-06-20T00:00:00.000Z" }),
    item({ id: "b", status: "open", createdAt: "2026-06-21T00:00:00.000Z" }),
    item({ id: "c", status: "open", createdAt: "2026-06-23T00:00:00.000Z" }),
    item({ id: "d", status: "reviewing", createdAt: "2026-06-22T00:00:00.000Z" }),
    item({ id: "e", status: "dismissed", createdAt: "2026-06-19T00:00:00.000Z" }),
  ];
  it("counts by status", () => {
    expect(countReportsByStatus(reports)).toEqual({
      open: 2,
      reviewing: 1,
      resolved: 1,
      dismissed: 1,
    });
    expect(countReportsByStatus([])).toEqual({ open: 0, reviewing: 0, resolved: 0, dismissed: 0 });
  });
  it("counts active reports", () => {
    expect(countActiveReports(reports)).toBe(3);
  });
  it("filters by status", () => {
    expect(filterReportsByStatus(reports, "open").map((r) => r.id)).toEqual(["b", "c"]);
  });
  it("sorts active first, newest within a status, without mutating input", () => {
    const original = reports.map((r) => r.id);
    const sorted = sortReportsForQueue(reports);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "d", "a", "e"]);
    expect(reports.map((r) => r.id)).toEqual(original);
  });
  it("treats unparseable dates as oldest", () => {
    const sorted = sortReportsForQueue([
      item({ id: "x", status: "open", createdAt: "bad" }),
      item({ id: "y", status: "open", createdAt: NOW }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["y", "x"]);
  });
});

describe("buildAuditEntry", () => {
  it("builds a normalized entry with defaults", () => {
    expect(
      buildAuditEntry({
        actorRole: "moderator",
        action: "  report.resolved  ",
        targetType: " report ",
        targetId: "r1",
        before: { status: "open" },
        after: { status: "resolved" },
        reason: "  spam  ",
      }),
    ).toEqual({
      actorUserId: null,
      actorRole: "moderator",
      action: "report.resolved",
      targetType: "report",
      targetId: "r1",
      before: { status: "open" },
      after: { status: "resolved" },
      reason: "spam",
    });
  });
  it("defaults before/after/reason/target and keeps actorUserId", () => {
    expect(
      buildAuditEntry({
        actorUserId: "a1",
        actorRole: "admin",
        action: "x",
        targetType: "report",
        reason: "  ",
      }),
    ).toEqual({
      actorUserId: "a1",
      actorRole: "admin",
      action: "x",
      targetType: "report",
      targetId: null,
      before: {},
      after: {},
      reason: null,
    });
  });
  it("rejects blank action / target type", () => {
    expect(() =>
      buildAuditEntry({ actorRole: "admin", action: "  ", targetType: "report" }),
    ).toThrow(/action is required/);
    expect(() => buildAuditEntry({ actorRole: "admin", action: "x", targetType: "  " })).toThrow(
      /target type is required/,
    );
  });
});
