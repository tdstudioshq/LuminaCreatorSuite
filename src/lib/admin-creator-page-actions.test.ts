import { describe, expect, it } from "vitest";
import {
  type AdminPageDeps,
  type CreatorPageRpc,
  type RpcResult,
  createCreatorPage,
  deleteCreatorLink,
  reorderCreatorLinks,
  setCreatorLinkVisibility,
  setCreatorPageStatus,
  transferCreatorPage,
  updateCreatorPage,
  upsertCreatorLink,
} from "@/lib/admin-creator-page-actions";

// ── Injected fakes (no browser, no Supabase) ────────────────────────────────
type Call = { fn: CreatorPageRpc; args: Record<string, unknown> };

function deps(opts: { admin?: boolean; result?: RpcResult }): {
  deps: AdminPageDeps;
  calls: Call[];
} {
  const calls: Call[] = [];
  const result = opts.result ?? { data: "new-id", error: null };
  return {
    calls,
    deps: {
      assertAdmin: async () => {
        if (opts.admin === false) throw new Error("You are not authorized to perform this action.");
      },
      rpc: async (fn, args) => {
        calls.push({ fn, args });
        return result;
      },
    },
  };
}

describe("authorization gate", () => {
  it("rejects a non-admin before any RPC is issued (every action)", async () => {
    const { deps: d, calls } = deps({ admin: false });
    await expect(createCreatorPage(d, { handle: "x", displayName: "X" })).rejects.toThrow(
      /not authorized/,
    );
    await expect(updateCreatorPage(d, { creatorProfileId: "p", name: "N" })).rejects.toThrow(
      /not authorized/,
    );
    await expect(
      setCreatorPageStatus(d, { creatorProfileId: "p", action: "publish" }),
    ).rejects.toThrow(/not authorized/);
    await expect(transferCreatorPage(d, { creatorProfileId: "p" })).rejects.toThrow(
      /not authorized/,
    );
    await expect(
      upsertCreatorLink(d, { creatorProfileId: "p", title: "t", url: "https://a.co" }),
    ).rejects.toThrow(/not authorized/);
    await expect(setCreatorLinkVisibility(d, { linkId: "l", isVisible: false })).rejects.toThrow(
      /not authorized/,
    );
    await expect(
      reorderCreatorLinks(d, { creatorProfileId: "p", orderedIds: ["a"] }),
    ).rejects.toThrow(/not authorized/);
    await expect(deleteCreatorLink(d, { linkId: "l" })).rejects.toThrow(/not authorized/);
    expect(calls).toHaveLength(0);
  });
});

describe("createCreatorPage", () => {
  it("normalizes the handle and forwards args, returning the id", async () => {
    const { deps: d, calls } = deps({ result: { data: "abc", error: null } });
    const out = await createCreatorPage(d, {
      handle: "  MyPage ",
      displayName: "My",
      bio: "b",
      headline: "h",
    });
    expect(out).toEqual({ id: "abc" });
    expect(calls[0]).toEqual({
      fn: "admin_create_creator_page",
      args: { _handle: "mypage", _display_name: "My", _bio: "b", _headline: "h" },
    });
  });

  it("rejects an empty handle before calling the RPC", async () => {
    const { deps: d, calls } = deps({});
    await expect(createCreatorPage(d, { handle: "   ", displayName: "X" })).rejects.toThrow(
      /Handle is required/,
    );
    expect(calls).toHaveLength(0);
  });

  it("maps a duplicate-handle RPC error to a safe message", async () => {
    const { deps: d } = deps({ result: { data: null, error: { code: "23505" } } });
    await expect(createCreatorPage(d, { handle: "taken", displayName: "X" })).rejects.toThrow(
      /already taken/,
    );
  });
});

describe("updateCreatorPage", () => {
  it("pre-validates appearance allow-lists before the RPC", async () => {
    const { deps: d, calls } = deps({});
    await expect(
      updateCreatorPage(d, { creatorProfileId: "p", fontFamily: "comic" }),
    ).rejects.toThrow(/font family/i);
    await expect(
      updateCreatorPage(d, { creatorProfileId: "p", accentColor: "not-hex" }),
    ).rejects.toThrow(/accent color/i);
    expect(calls).toHaveLength(0);
  });

  it("forwards only provided fields with nulls for the rest, normalizing handle", async () => {
    const { deps: d, calls } = deps({ result: { data: null, error: null } });
    await updateCreatorPage(d, {
      creatorProfileId: "p",
      handle: "NewH",
      headline: "hi",
      fontFamily: "serif",
    });
    expect(calls[0].fn).toBe("admin_update_creator_page");
    expect(calls[0].args._creator_profile_id).toBe("p");
    expect(calls[0].args._handle).toBe("newh");
    expect(calls[0].args._headline).toBe("hi");
    expect(calls[0].args._font_family).toBe("serif");
    expect(calls[0].args._name).toBeNull();
    expect(calls[0].args._background_style).toBeNull();
  });
});

describe("setCreatorPageStatus", () => {
  it("rejects an invalid action without an RPC", async () => {
    const { deps: d, calls } = deps({});
    await expect(
      setCreatorPageStatus(d, { creatorProfileId: "p", action: "delete" as never }),
    ).rejects.toThrow(/Invalid status action/);
    expect(calls).toHaveLength(0);
  });

  it("forwards a valid action", async () => {
    const { deps: d, calls } = deps({ result: { data: null, error: null } });
    await setCreatorPageStatus(d, { creatorProfileId: "p", action: "archive" });
    expect(calls[0]).toEqual({
      fn: "admin_set_creator_page_status",
      args: { _creator_profile_id: "p", _action: "archive" },
    });
  });

  it("maps a check_violation (bad transition) to the RPC message", async () => {
    const { deps: d } = deps({
      result: { data: null, error: { code: "23514", message: "Invalid status transition" } },
    });
    await expect(
      setCreatorPageStatus(d, { creatorProfileId: "p", action: "publish" }),
    ).rejects.toThrow(/Invalid status transition/);
  });
});

describe("transferCreatorPage", () => {
  it("forwards toUserId, defaulting to null (clear ownership)", async () => {
    const { deps: d, calls } = deps({ result: { data: null, error: null } });
    await transferCreatorPage(d, { creatorProfileId: "p" });
    expect(calls[0].args).toEqual({ _creator_profile_id: "p", _to_user_id: null });
    await transferCreatorPage(d, { creatorProfileId: "p", toUserId: "u" });
    expect(calls[1].args._to_user_id).toBe("u");
  });
});

describe("link actions", () => {
  it("upsert pre-validates kind and URL scheme", async () => {
    const { deps: d, calls } = deps({});
    await expect(
      upsertCreatorLink(d, {
        creatorProfileId: "p",
        title: "t",
        url: "https://a.co",
        kind: "button",
      }),
    ).rejects.toThrow(/link kind/i);
    await expect(
      upsertCreatorLink(d, { creatorProfileId: "p", title: "t", url: "javascript:alert(1)" }),
    ).rejects.toThrow(/http/i);
    expect(calls).toHaveLength(0);
  });

  it("upsert forwards defaults and returns the id", async () => {
    const { deps: d, calls } = deps({ result: { data: "link1", error: null } });
    const out = await upsertCreatorLink(d, {
      creatorProfileId: "p",
      title: "T",
      url: "https://a.co",
    });
    expect(out).toEqual({ id: "link1" });
    expect(calls[0].args).toMatchObject({
      _creator_profile_id: "p",
      _title: "T",
      _url: "https://a.co",
      _id: null,
      _icon: "globe",
      _kind: "link",
      _is_visible: true,
    });
  });

  it("reorder rejects empty and duplicate lists before the RPC", async () => {
    const { deps: d, calls } = deps({});
    await expect(reorderCreatorLinks(d, { creatorProfileId: "p", orderedIds: [] })).rejects.toThrow(
      /No links/,
    );
    await expect(
      reorderCreatorLinks(d, { creatorProfileId: "p", orderedIds: ["a", "a"] }),
    ).rejects.toThrow(/Duplicate/);
    expect(calls).toHaveLength(0);
  });

  it("reorder / visibility / delete forward correctly", async () => {
    const { deps: d, calls } = deps({ result: { data: null, error: null } });
    await reorderCreatorLinks(d, { creatorProfileId: "p", orderedIds: ["a", "b"] });
    await setCreatorLinkVisibility(d, { linkId: "l", isVisible: false });
    await deleteCreatorLink(d, { linkId: "l" });
    expect(calls.map((c) => c.fn)).toEqual([
      "admin_reorder_creator_links",
      "admin_set_creator_link_visibility",
      "admin_delete_creator_link",
    ]);
    expect(calls[0].args._ordered_ids).toEqual(["a", "b"]);
    expect(calls[1].args).toEqual({ _link_id: "l", _is_visible: false });
    expect(calls[2].args).toEqual({ _link_id: "l" });
  });
});
