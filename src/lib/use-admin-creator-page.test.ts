import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminCreatorPageKeys } from "@/lib/use-admin-creator-page";

const PAGE_ID = "0a000000-0000-4000-8000-000000000001";

describe("admin creator-page query keys", () => {
  it("keeps detail and bounded audit caches distinct", () => {
    expect(adminCreatorPageKeys.all).toEqual(["admin-creator-page"]);
    expect(adminCreatorPageKeys.detail(PAGE_ID)).toEqual(["admin-creator-page", "detail", PAGE_ID]);
    expect(adminCreatorPageKeys.auditHistory(PAGE_ID)).toEqual([
      "admin-creator-page",
      "audit-history",
      PAGE_ID,
      50,
    ]);
    expect(adminCreatorPageKeys.auditHistory(PAGE_ID, 25)).toEqual([
      "admin-creator-page",
      "audit-history",
      PAGE_ID,
      25,
    ]);
  });

  it("gates both hooks on session and a selected creator page", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/use-admin-creator-page.ts"), "utf8");
    expect(source.match(/enabled: !loading && !!user && !!creatorProfileId/g)).toHaveLength(2);
    expect(source).toContain("getAdminCreatorPageDetail");
    expect(source).toContain("getAdminCreatorPageAuditHistory");
  });
});
