import { describe, expect, it } from "vitest";
import {
  hasValidationErrors,
  isValidCreatorAccountId,
  moveCreatorLinkIds,
  normalizeCreatorAccountId,
  normalizedCreatorLinkUrl,
  safeCreatorEditorError,
  validateCreatorIdentity,
  validateCreatorLinkDraft,
} from "@/lib/cabana-admin-creator-editor";

describe("creator identity editor validation", () => {
  it("accepts and normalizes a plausible identity", () => {
    expect(
      validateCreatorIdentity({
        handle: "  Aurora-Vale  ",
        name: "Aurora Vale",
        headline: "Sound artist",
        bio: "Biography",
      }),
    ).toEqual({});
  });

  it("reports missing and oversized fields", () => {
    const errors = validateCreatorIdentity({
      handle: "not valid!",
      name: " ",
      headline: "x".repeat(161),
      bio: "x".repeat(2_001),
    });
    expect(errors).toEqual({
      handle: "Use 1–64 lowercase letters, numbers, hyphens, or underscores.",
      name: "Display name is required.",
      headline: "Headline must be 160 characters or fewer.",
      bio: "Biography must be 2,000 characters or fewer.",
    });
    expect(hasValidationErrors(errors)).toBe(true);
    expect(hasValidationErrors({})).toBe(false);
  });

  it("requires a handle", () => {
    expect(
      validateCreatorIdentity({ handle: " ", name: "Name", headline: "", bio: "" }).handle,
    ).toBe("Handle is required.");
  });
});

describe("safe editor errors", () => {
  it("maps known user-correctable failures", () => {
    expect(safeCreatorEditorError(new Error("That handle is already taken"), "Nope")).toBe(
      "That handle is already taken.",
    );
    expect(safeCreatorEditorError(new Error("Handle 'admin' is reserved"), "Nope")).toBe(
      "That handle is reserved.",
    );
    expect(
      safeCreatorEditorError(new Error("Destination account already owns a creator page"), "Nope"),
    ).toBe("That creator account already owns a creator page.");
    expect(
      safeCreatorEditorError(
        new Error("Destination account is not a valid creator account"),
        "Nope",
      ),
    ).toBe("That UUID does not identify an eligible creator account.");
    expect(
      safeCreatorEditorError(new Error("That creator account already owns a page."), "Nope"),
    ).toBe("That creator account already owns a creator page.");
    expect(
      safeCreatorEditorError(
        new Error("That account is not eligible to own a creator page."),
        "Nope",
      ),
    ).toBe("That UUID does not identify an eligible creator account.");
    expect(safeCreatorEditorError(new Error("That status change is not allowed."), "Nope")).toBe(
      "That status change is not allowed.",
    );
  });

  it("does not render unknown database text", () => {
    expect(
      safeCreatorEditorError(new Error("relation public.secret does not exist"), "Try again."),
    ).toBe("Try again.");
    expect(safeCreatorEditorError(null, "Try again.")).toBe("Try again.");
  });
});

describe("creator ownership input", () => {
  it("accepts a trimmed UUID without exposing account data", () => {
    expect(isValidCreatorAccountId(" 550E8400-E29B-41D4-A716-446655440000 ")).toBe(true);
    expect(normalizeCreatorAccountId(" 550E8400-E29B-41D4-A716-446655440000 ")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("rejects malformed identifiers", () => {
    expect(isValidCreatorAccountId("creator@example.com")).toBe(false);
    expect(isValidCreatorAccountId("not-a-uuid")).toBe(false);
  });
});

describe("link editor validation and ordering", () => {
  it("normalizes valid HTTP links", () => {
    expect(validateCreatorLinkDraft({ title: "Site", url: "example.com", kind: "link" })).toEqual(
      {},
    );
    expect(normalizedCreatorLinkUrl(" example.com/profile ")).toBe("https://example.com/profile");
  });

  it("rejects empty titles and non-HTTP schemes", () => {
    expect(
      validateCreatorLinkDraft({ title: " ", url: "javascript:alert(1)", kind: "embed" }),
    ).toEqual({
      title: "Link title is required.",
      url: "Enter a complete HTTP or HTTPS URL.",
    });
    expect(validateCreatorLinkDraft({ title: "Header", url: "", kind: "header" }).url).toBe(
      "Link URL is required.",
    );
  });

  it("moves ids deterministically and respects the boundaries", () => {
    expect(moveCreatorLinkIds(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveCreatorLinkIds(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveCreatorLinkIds(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveCreatorLinkIds(["a", "b"], "missing", "down")).toEqual(["a", "b"]);
  });
});
