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
  validateCreatePageInput,
  validateTransferInput,
  validateUpdatePageInput,
  validateUpsertLinkInput,
} from "@/lib/admin-creator-page-actions";

// ── Injected fakes (no browser, no Supabase) ────────────────────────────────
type Call = { fn: CreatorPageRpc; args: Record<string, unknown> };
const PAGE_ID = "ca000000-0000-4000-a000-000000000001";
const USER_ID = "ca000000-0000-4000-a000-000000000002";
const LINK_ID = "ca000000-0000-4000-b000-000000000001";
const LINK_ID_2 = "ca000000-0000-4000-b000-000000000002";

function deps(opts: { admin?: boolean; result?: RpcResult }): {
  deps: AdminPageDeps;
  calls: Call[];
} {
  const calls: Call[] = [];
  const result = opts.result ?? { data: PAGE_ID, error: null };
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
    await expect(updateCreatorPage(d, { creatorProfileId: PAGE_ID, name: "N" })).rejects.toThrow(
      /not authorized/,
    );
    await expect(
      setCreatorPageStatus(d, { creatorProfileId: PAGE_ID, action: "publish" }),
    ).rejects.toThrow(/not authorized/);
    await expect(transferCreatorPage(d, { creatorProfileId: PAGE_ID })).rejects.toThrow(
      /not authorized/,
    );
    await expect(
      upsertCreatorLink(d, { creatorProfileId: PAGE_ID, title: "t", url: "https://a.co" }),
    ).rejects.toThrow(/not authorized/);
    await expect(
      setCreatorLinkVisibility(d, { linkId: LINK_ID, isVisible: false }),
    ).rejects.toThrow(/not authorized/);
    await expect(
      reorderCreatorLinks(d, { creatorProfileId: PAGE_ID, orderedIds: [LINK_ID] }),
    ).rejects.toThrow(/not authorized/);
    await expect(deleteCreatorLink(d, { linkId: LINK_ID })).rejects.toThrow(/not authorized/);
    expect(calls).toHaveLength(0);
  });
});

describe("createCreatorPage", () => {
  it("normalizes the handle and forwards args, returning the id", async () => {
    const { deps: d, calls } = deps({ result: { data: PAGE_ID, error: null } });
    const out = await createCreatorPage(d, {
      handle: "  MyPage ",
      displayName: "My",
      bio: "b",
      headline: "h",
    });
    expect(out).toEqual({ id: PAGE_ID });
    expect(calls[0]).toEqual({
      fn: "admin_create_creator_page",
      args: { _handle: "mypage", _display_name: "My", _bio: "b", _headline: "h" },
    });
  });

  it("rejects an empty handle before calling the RPC", async () => {
    const { deps: d, calls } = deps({});
    await expect(createCreatorPage(d, { handle: "   ", displayName: "X" })).rejects.toThrow(
      /Handle must use/,
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
      updateCreatorPage(d, { creatorProfileId: PAGE_ID, fontFamily: "comic" }),
    ).rejects.toThrow(/font family/i);
    await expect(
      updateCreatorPage(d, { creatorProfileId: PAGE_ID, accentColor: "not-hex" }),
    ).rejects.toThrow(/accent color/i);
    expect(calls).toHaveLength(0);
  });

  it("forwards only provided fields with nulls for the rest, normalizing handle", async () => {
    const { deps: d, calls } = deps({ result: { data: null, error: null } });
    await updateCreatorPage(d, {
      creatorProfileId: PAGE_ID,
      handle: "NewH",
      headline: "hi",
      fontFamily: "serif",
    });
    expect(calls[0].fn).toBe("admin_update_creator_page");
    expect(calls[0].args._creator_profile_id).toBe(PAGE_ID);
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
      setCreatorPageStatus(d, { creatorProfileId: PAGE_ID, action: "delete" as never }),
    ).rejects.toThrow(/Invalid status action/);
    expect(calls).toHaveLength(0);
  });

  it("forwards a valid action", async () => {
    const { deps: d, calls } = deps({ result: { data: null, error: null } });
    await setCreatorPageStatus(d, { creatorProfileId: PAGE_ID, action: "archive" });
    expect(calls[0]).toEqual({
      fn: "admin_set_creator_page_status",
      args: { _creator_profile_id: PAGE_ID, _action: "archive" },
    });
  });

  it("maps a check_violation (bad transition) to the RPC message", async () => {
    const { deps: d } = deps({
      result: { data: null, error: { code: "23514", message: "Invalid status transition" } },
    });
    await expect(
      setCreatorPageStatus(d, { creatorProfileId: PAGE_ID, action: "publish" }),
    ).rejects.toThrow(/status change is not allowed/i);
  });
});

describe("transferCreatorPage", () => {
  it("forwards toUserId, defaulting to null (clear ownership)", async () => {
    const { deps: d, calls } = deps({ result: { data: null, error: null } });
    await transferCreatorPage(d, { creatorProfileId: PAGE_ID });
    expect(calls[0].args).toEqual({ _creator_profile_id: PAGE_ID, _to_user_id: null });
    await transferCreatorPage(d, { creatorProfileId: PAGE_ID, toUserId: USER_ID });
    expect(calls[1].args._to_user_id).toBe(USER_ID);
  });
});

describe("link actions", () => {
  it("upsert pre-validates kind and URL scheme", async () => {
    const { deps: d, calls } = deps({});
    await expect(
      upsertCreatorLink(d, {
        creatorProfileId: PAGE_ID,
        title: "t",
        url: "https://a.co",
        kind: "button",
      }),
    ).rejects.toThrow(/link kind/i);
    await expect(
      upsertCreatorLink(d, {
        creatorProfileId: PAGE_ID,
        title: "t",
        url: "javascript:alert(1)",
      }),
    ).rejects.toThrow(/http/i);
    expect(calls).toHaveLength(0);
  });

  it("upsert forwards defaults and returns the id", async () => {
    const { deps: d, calls } = deps({ result: { data: LINK_ID, error: null } });
    const out = await upsertCreatorLink(d, {
      creatorProfileId: PAGE_ID,
      title: "T",
      url: "https://a.co",
    });
    expect(out).toEqual({ id: LINK_ID });
    expect(calls[0].args).toMatchObject({
      _creator_profile_id: PAGE_ID,
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
    await expect(
      reorderCreatorLinks(d, { creatorProfileId: PAGE_ID, orderedIds: [] }),
    ).rejects.toThrow(/No links/);
    await expect(
      reorderCreatorLinks(d, { creatorProfileId: PAGE_ID, orderedIds: [LINK_ID, LINK_ID] }),
    ).rejects.toThrow(/Duplicate/);
    expect(calls).toHaveLength(0);
  });

  it("reorder / visibility / delete forward correctly", async () => {
    const { deps: d, calls } = deps({ result: { data: null, error: null } });
    await reorderCreatorLinks(d, {
      creatorProfileId: PAGE_ID,
      orderedIds: [LINK_ID, LINK_ID_2],
    });
    await setCreatorLinkVisibility(d, { linkId: LINK_ID, isVisible: false });
    await deleteCreatorLink(d, { linkId: LINK_ID });
    expect(calls.map((c) => c.fn)).toEqual([
      "admin_reorder_creator_links",
      "admin_set_creator_link_visibility",
      "admin_delete_creator_link",
    ]);
    expect(calls[0].args._ordered_ids).toEqual([LINK_ID, LINK_ID_2]);
    expect(calls[1].args).toEqual({ _link_id: LINK_ID, _is_visible: false });
    expect(calls[2].args).toEqual({ _link_id: LINK_ID });
  });
});

describe("runtime input validation", () => {
  it("normalizes create fields and enforces required lengths", () => {
    expect(
      validateCreatePageInput({
        handle: "  New_Page ",
        displayName: "  New Page ",
        bio: " bio ",
      }),
    ).toMatchObject({ handle: "new_page", displayName: "New Page", bio: "bio" });
    expect(() => validateCreatePageInput({ handle: "bad handle", displayName: "Name" })).toThrow(
      /Handle/,
    );
    expect(() => validateCreatePageInput({ handle: "good", displayName: "" })).toThrow(
      /Display name/,
    );
  });

  it("validates ids, appearance, asset URLs, and ownership targets", () => {
    expect(() => validateUpdatePageInput({ creatorProfileId: "bad", name: "Name" })).toThrow(
      /page ID/,
    );
    expect(() =>
      validateUpdatePageInput({ creatorProfileId: PAGE_ID, theme: "custom-css" }),
    ).toThrow(/theme/i);
    expect(() =>
      validateUpdatePageInput({ creatorProfileId: PAGE_ID, avatarUrl: "javascript:alert(1)" }),
    ).toThrow(/HTTP or HTTPS/);
    expect(validateTransferInput({ creatorProfileId: PAGE_ID, toUserId: null })).toEqual({
      creatorProfileId: PAGE_ID,
      toUserId: null,
    });
    expect(() => validateTransferInput({ creatorProfileId: PAGE_ID, toUserId: "bad" })).toThrow(
      /account ID/,
    );
  });

  it("rejects placeholder URLs and invalid link fields", () => {
    expect(() =>
      validateUpsertLinkInput({ creatorProfileId: PAGE_ID, title: "Link", url: "https://" }),
    ).toThrow(/valid HTTP/);
    expect(() =>
      validateUpsertLinkInput({
        creatorProfileId: PAGE_ID,
        title: "Link",
        url: "https://example.com",
        position: -1,
      }),
    ).toThrow(/position/);
  });
});
