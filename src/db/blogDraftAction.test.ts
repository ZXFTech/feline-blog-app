import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  findFirst: vi.fn(),
  logger: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  default: { $transaction: mocks.transaction, blogDraft: { findFirst: mocks.findFirst } },
}));
vi.mock("@/lib/auth/userAuth", () => ({ hasBlogRoles: mocks.auth }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sdk/config", () => ({ getSdkDatabaseSchema: () => "public" }));
vi.mock("@/lib/logger/Logger", () => ({ default: { error: mocks.logger } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  discardBlogDraft,
  getBlogDraft,
  getBlogEditorData,
  getMyBlogDrafts,
  publishBlogDraft,
  saveBlogDraft,
} from "@/db/blogDraftAction";
const id = "e96e85a3-26e8-443b-80aa-f0551cb0c455";
const input = {
  draftId: id,
  blogId: null,
  expectedRevision: 0,
  saveRequestId: id,
  title: "",
  content: "\n raw \n",
  tags: [],
};
beforeEach(() => vi.clearAllMocks());
describe("draft action authorization", () => {
  // spec 0016 covers: AC-13. Role rejection must precede all database access.
  it("blocks every private action before database access for an authenticated reader", async () => {
    mocks.auth.mockResolvedValue({ status: "forbidden", message: "没有作者权限" });
    const results = await Promise.all([
      getBlogDraft(id),
      getBlogEditorData(1),
      getMyBlogDrafts(1),
      saveBlogDraft(input),
      publishBlogDraft({ draftId: id, expectedRevision: 1, publishRequestId: id }),
      discardBlogDraft({ draftId: id, expectedRevision: 1 }),
    ]);
    expect(results.map((result) => result.status)).toEqual(Array(6).fill("forbidden"));
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  // spec 0016 covers: AC-6, AC-13. Invalid requests cannot reach persistence.
  it.each([
    ["read draft", () => getBlogDraft("not-a-uuid")],
    ["read editor", () => getBlogEditorData(-1)],
    ["read list", () => getMyBlogDrafts(Number.NaN)],
    ["save", () => saveBlogDraft({ ...input, title: "x".repeat(192) })],
    ["publish", () => publishBlogDraft({ draftId: id, expectedRevision: 0, publishRequestId: id })],
    ["delete", () => discardBlogDraft({ draftId: id, expectedRevision: 0 })],
  ] as const)("rejects invalid %s input before database access", async (_name, invoke) => {
    mocks.auth.mockResolvedValue({ status: "success", data: { id: "owner" } });
    expect((await invoke()).status).toBe("invalid_input");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  // spec 0016 covers: AC-6, AC-13. Neither the response nor logs may contain draft data.
  it("returns a safe failure without logging private content or raw database diagnostics", async () => {
    mocks.auth.mockResolvedValue({ status: "success", data: { id: "owner" } });
    const privateInput = {
      ...input,
      title: "recognizable-private-title",
      content: "recognizable-private-body",
      tags: [{ content: "recognizable-private-tag", color: "blue" }],
    };
    const diagnostic = "recognizable-private-body recognizable-private-tag token-secret-marker";
    mocks.transaction.mockRejectedValueOnce(new Error(diagnostic));
    const result = await saveBlogDraft(privateInput);
    expect(result).toEqual({
      status: "temporary_failure",
      message: "暂时无法完成草稿操作，请重试",
    });
    expect(mocks.logger).toHaveBeenCalledExactlyOnceWith({
      operation: "saveBlogDraft",
      category: "unexpected",
      userId: "owner",
      errorClass: "Error",
    });
    const exposed = JSON.stringify({ result, logs: mocks.logger.mock.calls });
    for (const value of [
      privateInput.title,
      privateInput.content,
      privateInput.tags[0].content,
      "token-secret-marker",
    ])
      expect(exposed).not.toContain(value);
  });

  it("blocks every private action before database access for an anonymous caller", async () => {
    mocks.auth.mockResolvedValue({ status: "unauthenticated", message: "请重新登录" });
    for (const result of await Promise.all([
      getBlogDraft(id),
      getBlogEditorData(1),
      getMyBlogDrafts(1),
      saveBlogDraft(input),
      publishBlogDraft({ draftId: id, expectedRevision: 1, publishRequestId: id }),
      discardBlogDraft({ draftId: id, expectedRevision: 1 }),
    ])) {
      expect(result.status).toBe("unauthenticated");
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("never reads another author's draft and does not expose the supplied UUID as authority", async () => {
    mocks.auth.mockResolvedValue({ status: "success", data: { id: "owner" } });
    mocks.findFirst.mockResolvedValue(null);
    expect((await getBlogDraft(id)).status).toBe("not_found");
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id, authorId: "owner", deletedAt: null }),
      })
    );
  });
});
