import { describe, expect, it } from "vitest";
import { getDemoCredentials, sanitizeAuthRedirect } from "./cabana-auth";

describe("sanitizeAuthRedirect", () => {
  it("preserves internal paths, queries, and hashes", () => {
    expect(sanitizeAuthRedirect("/creator/aurora?tab=posts#latest", "/dashboard")).toBe(
      "/creator/aurora?tab=posts#latest",
    );
  });

  it("rejects external, protocol-relative, malformed, and empty redirects", () => {
    for (const raw of [
      "https://example.com",
      "//example.com",
      "/\\example.com",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(sanitizeAuthRedirect(raw, "/dashboard")).toBe("/dashboard");
    }
  });
});

describe("getDemoCredentials", () => {
  it("maps each demo role to its seeded account", () => {
    expect(getDemoCredentials("fan")).toEqual({
      email: "fan@cabana.demo",
      password: "password123",
    });
    expect(getDemoCredentials("creator").email).toBe("creator@cabana.demo");
    expect(getDemoCredentials("admin").email).toBe("admin@cabana.demo");
  });
});
