import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES,
  DEFAULT_ACCOUNT_TYPE,
  MEMBER_BIO_MAX,
  MEMBER_DISPLAY_NAME_MAX,
  accountHomePath,
  defaultMemberProfile,
  isCreator,
  isMember,
  mapMemberProfile,
  normalizeMemberProfileInput,
  resolveAccountType,
  shapeAccountContext,
} from "./cabana-account";

describe("resolveAccountType", () => {
  it("treats only the exact string 'member' as a member", () => {
    expect(resolveAccountType("member")).toBe("member");
  });

  it("defaults everything else to creator", () => {
    for (const raw of [
      "creator",
      "Member",
      "MEMBER",
      " member ",
      "",
      undefined,
      null,
      0,
      false,
      {},
      ["member"],
      "admin",
    ]) {
      expect(resolveAccountType(raw)).toBe("creator");
    }
  });

  it("uses creator as the documented default", () => {
    expect(DEFAULT_ACCOUNT_TYPE).toBe("creator");
    expect(ACCOUNT_TYPES).toEqual(["creator", "member"]);
  });
});

describe("isMember / isCreator", () => {
  it("are mutually exclusive", () => {
    expect(isMember("member")).toBe(true);
    expect(isCreator("member")).toBe(false);
    expect(isCreator("creator")).toBe(true);
    expect(isMember("creator")).toBe(false);
  });
});

describe("accountHomePath", () => {
  it("routes members to /settings and creators to /dashboard", () => {
    expect(accountHomePath("member")).toBe("/settings");
    expect(accountHomePath("creator")).toBe("/dashboard");
  });
});

describe("defaultMemberProfile", () => {
  it("uses a trimmed name when present", () => {
    expect(defaultMemberProfile({ name: "  Jordan  " })).toEqual({
      displayName: "Jordan",
      bio: "",
    });
  });

  it("falls back to 'Member' when name is empty/whitespace/missing/null", () => {
    expect(defaultMemberProfile({ name: "" }).displayName).toBe("Member");
    expect(defaultMemberProfile({ name: "   " }).displayName).toBe("Member");
    expect(defaultMemberProfile({ name: null }).displayName).toBe("Member");
    expect(defaultMemberProfile().displayName).toBe("Member");
  });
});

describe("normalizeMemberProfileInput", () => {
  it("trims display name and bio", () => {
    expect(normalizeMemberProfileInput({ displayName: "  Ann  ", bio: "  hi  " })).toEqual({
      displayName: "Ann",
      bio: "hi",
    });
  });

  it("caps lengths", () => {
    const longName = "x".repeat(MEMBER_DISPLAY_NAME_MAX + 25);
    const longBio = "y".repeat(MEMBER_BIO_MAX + 100);
    const out = normalizeMemberProfileInput({ displayName: longName, bio: longBio });
    expect(out.displayName).toHaveLength(MEMBER_DISPLAY_NAME_MAX);
    expect(out.bio).toHaveLength(MEMBER_BIO_MAX);
  });

  it("tolerates missing/null fields", () => {
    expect(normalizeMemberProfileInput({})).toEqual({ displayName: "", bio: "" });
    expect(normalizeMemberProfileInput({ displayName: null, bio: null })).toEqual({
      displayName: "",
      bio: "",
    });
  });
});

describe("mapMemberProfile", () => {
  it("maps a row to the camelCase domain shape", () => {
    expect(
      mapMemberProfile({
        id: "m1",
        user_id: "u1",
        username: "ren",
        display_name: "Ren",
        bio: "fan",
        avatar_url: null,
        created_at: "2026-06-25T00:00:00Z",
        updated_at: "2026-06-25T00:00:00Z",
      }),
    ).toEqual({
      id: "m1",
      userId: "u1",
      username: "ren",
      displayName: "Ren",
      bio: "fan",
      avatarUrl: null,
      createdAt: "2026-06-25T00:00:00Z",
      updatedAt: "2026-06-25T00:00:00Z",
    });
  });
});

describe("shapeAccountContext", () => {
  it("shapes a full creator context", () => {
    expect(
      shapeAccountContext({
        userId: "u1",
        profile: { account_type: "creator", name: "Aurora", email: "a@x.com" },
        roleRows: [{ role: "user" }, { role: "admin" }],
      }),
    ).toEqual({
      userId: "u1",
      accountType: "creator",
      roles: ["user", "admin"],
      name: "Aurora",
      email: "a@x.com",
    });
  });

  it("defaults to creator and empty roles when data is missing", () => {
    expect(shapeAccountContext({ userId: "u2", profile: null, roleRows: null })).toEqual({
      userId: "u2",
      accountType: "creator",
      roles: [],
      name: null,
      email: null,
    });
  });

  it("preserves a member account type", () => {
    const ctx = shapeAccountContext({
      userId: "u3",
      profile: { account_type: "member", name: null, email: "m@x.com" },
      roleRows: [],
    });
    expect(ctx.accountType).toBe("member");
    expect(ctx.roles).toEqual([]);
  });
});
