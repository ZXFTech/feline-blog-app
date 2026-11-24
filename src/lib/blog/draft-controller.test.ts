import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftController } from "@/lib/blog/draft-controller";
import type {
  BlogEditorSeed,
  SavedDraft,
  SaveDraftInput,
  PublishedDraft,
  PublishDraftInput,
} from "@/types/blog-draft";
import { actionResult, type ActionResult } from "@/lib/server/actionResult";

const seed: BlogEditorSeed = {
  draftId: null,
  blogId: null,
  title: "",
  content: "",
  tags: [],
  revision: 0,
  publishedRevision: 0,
  savedAt: null,
};
function setup(
  save = vi.fn(async (_input: SaveDraftInput) =>
    actionResult.success<SavedDraft>({
      draftId: _input.draftId,
      revision: _input.expectedRevision + 1,
      publishedRevision: 0,
      savedAt: "2026-10-24T00:00:00Z",
    })
  )
) {
  const publish = vi.fn(
    async (_input: PublishDraftInput): Promise<ActionResult<PublishedDraft>> => {
      void _input;
      return actionResult.success({
        blogId: 42,
        publishedRevision: 1,
        publicationState: "available" as const,
      });
    }
  );
  const controller = new DraftController(seed, { save, publish, load: vi.fn(), onSaved: vi.fn() });
  return { controller, save, publish };
}
afterEach(() => vi.useRealTimers());
describe("draft autosave", () => {
  // spec 0016 covers: AC-1, AC-4. Every confirmed field resets the same timer.
  it("waits for the last title or tag change before saving the complete snapshot", async () => {
    vi.useFakeTimers();
    const { controller: c, save } = setup();
    c.update({ content: "\n  原文  \n" });
    await vi.advanceTimersByTimeAsync(800);
    c.update({ title: "最新标题" });
    await vi.advanceTimersByTimeAsync(800);
    c.update({ tags: [{ content: "已确认标签", color: "currentColor" }] });
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "最新标题",
        content: "\n  原文  \n",
        tags: [{ content: "已确认标签", color: "currentColor" }],
      })
    );
    expect(c.getState().phase).toBe("saved");
    c.dispose();
  });

  // spec 0016 covers: AC-4. A previous response must not shorten the next debounce.
  it("waits out the remaining debounce after a slow earlier save finishes", async () => {
    vi.useFakeTimers();
    let complete!: (value: ReturnType<typeof actionResult.success<SavedDraft>>) => void;
    const { controller: c, save } = setup();
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    c.update({ content: "first" });
    await vi.advanceTimersByTimeAsync(1000);
    c.update({ content: "latest" });
    await vi.advanceTimersByTimeAsync(400);
    complete(
      actionResult.success({
        draftId: c.getState().draftId,
        revision: 1,
        publishedRevision: 0,
        savedAt: "confirmed",
      })
    );
    await vi.advanceTimersByTimeAsync(599);
    expect(save).toHaveBeenCalledTimes(1);
    expect(c.getState().phase).toBe("dirty");
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({ content: "latest", expectedRevision: 1 });
    expect(c.getState().phase).toBe("saved");
    c.dispose();
  });

  // spec 0016 covers: AC-6, AC-13. Deterministic refusals must never become an automatic loop.
  it.each(["unauthenticated", "forbidden", "invalid_input"] as const)(
    "keeps all fields and stops automatic requests after %s until an explicit retry",
    async (status) => {
      vi.useFakeTimers();
      const save = vi.fn(
        async (request: SaveDraftInput) =>
          actionResult.success<SavedDraft>({
            draftId: request.draftId,
            revision: request.expectedRevision + 1,
            publishedRevision: 0,
            savedAt: "confirmed",
          }) as ActionResult<SavedDraft>
      );
      save.mockResolvedValueOnce(actionResult.failure(status, "请重新确认后重试"));
      const c = new DraftController(seed, { save, publish: vi.fn(), load: vi.fn() });
      c.update({
        title: "本页标题",
        content: "本页正文",
        tags: [{ content: "私有", color: "blue" }],
      });
      await vi.advanceTimersByTimeAsync(1000);
      c.update({ content: "拒绝后继续写作" });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(save).toHaveBeenCalledTimes(1);
      expect(c.getState()).toMatchObject({
        phase: "failed",
        failure: { status },
        snapshot: {
          title: "本页标题",
          content: "拒绝后继续写作",
          tags: [{ content: "私有", color: "blue" }],
        },
      });
      expect(await c.retry()).toBe(true);
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1][0]).toMatchObject({
        content: "拒绝后继续写作",
        expectedRevision: 0,
      });
      expect(save.mock.calls[1][0].saveRequestId).not.toBe(save.mock.calls[0][0].saveRequestId);
      expect(c.getState().phase).toBe("saved");
      c.dispose();
    }
  );

  // spec 0016 covers: AC-9. A failed refresh cannot replace any local field.
  it("keeps the conflicting snapshot when loading fails and replaces it only after a confirmed load", async () => {
    const load = vi.fn(
      async (): Promise<ActionResult<BlogEditorSeed>> =>
        actionResult.failure("temporary_failure", "读取失败")
    );
    const c = new DraftController(seed, {
      save: vi.fn(async () => actionResult.failure("conflict", "已更新")),
      publish: vi.fn(),
      load,
    });
    const local = {
      title: "local",
      content: "\n local body \n",
      tags: [{ content: "local", color: "red" }],
    };
    c.update(local);
    await c.flush();
    expect(await c.loadLatest()).toBe(false);
    expect(c.getState().snapshot).toEqual(local);
    expect(c.getState().phase).toBe("conflict");
    expect(c.isFrozen()).toBe(false);
    load.mockResolvedValueOnce(
      actionResult.success({
        ...seed,
        draftId: crypto.randomUUID(),
        revision: 3,
        title: "server",
        content: "server body",
        tags: [{ content: "server", color: "blue" }],
      })
    );
    expect(await c.loadLatest()).toBe(true);
    expect(c.getState()).toMatchObject({
      phase: "saved",
      revision: 3,
      failure: null,
      snapshot: {
        title: "server",
        content: "server body",
        tags: [{ content: "server", color: "blue" }],
      },
    });
    c.dispose();
  });

  // spec 0016 covers: AC-7. Repeated confirmation remains one logical publication.
  it("allows only one receipt confirmation while its response is pending", async () => {
    const { controller: c, publish, save } = setup();
    publish.mockRejectedValueOnce(new Error("response lost"));
    await c.submit();
    let complete!: (value: ActionResult<PublishedDraft>) => void;
    publish.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    const first = c.confirmPublication();
    await Promise.all([c.confirmPublication(), c.submit()]);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][0]).toEqual(publish.mock.calls[0][0]);
    expect(c.isFrozen()).toBe(true);
    complete(
      actionResult.success({ blogId: 42, publishedRevision: 1, publicationState: "available" })
    );
    await first;
    expect(c.getState().publication).toBe("success");
    expect(save).toHaveBeenCalledTimes(1);
    c.dispose();
  });

  it.each([
    ["ASCII", "x".repeat(1_100_000)],
    ["UTF-8", "中".repeat(360_000)],
    ["JSON escaping", "\n".repeat(540_000)],
  ])(
    "rejects an oversized %s request before transport and saves corrected input on retry",
    async (_label, content) => {
      const { controller: c, save } = setup();
      c.update({ content });
      expect(await c.flush()).toBe(false);
      expect(save).not.toHaveBeenCalled();
      expect(c.getState().failure?.status).toBe("invalid_input");
      expect(c.getState().snapshot.content).toBe(content);
      c.update({ content: "已缩短到正常长度，应该可以重新保存。" });
      expect(await c.retry()).toBe(true);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0].content).toBe("已缩短到正常长度，应该可以重新保存。");
      expect(c.getState().phase).toBe("saved");
      c.dispose();
    }
  );

  it("allows a request close to the existing 1 MiB boundary", async () => {
    const { controller: c, save } = setup();
    c.update({ content: "x".repeat(1024 * 1024 - 1000) });
    expect(await c.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    c.dispose();
  });
  it("recovers the saved state when oversized input is corrected back to the confirmed snapshot", async () => {
    const { controller: c, save } = setup();
    c.update({ content: "confirmed" });
    await c.flush();
    c.update({ content: "x".repeat(1_100_000) });
    expect(await c.flush()).toBe(false);
    c.update({ content: "confirmed" });
    expect(await c.retry()).toBe(true);
    expect(c.getState().phase).toBe("saved");
    expect(c.getState().failure).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    c.dispose();
  });
  it("blocks automatic retries after a failure and resumes only after an explicit retry", async () => {
    vi.useFakeTimers();
    const { controller: c, save } = setup();
    save.mockRejectedValueOnce(new Error("offline"));
    c.update({ content: "work" });
    await vi.advanceTimersByTimeAsync(1000);
    c.update({ content: "more work" });
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(1);
    await c.retry();
    expect(c.getState().snapshot.content).toBe("more work");
    expect(c.getState().phase).toBe("saved");
    c.dispose();
  });
  it("stops on a conflict and replaces all fields only after a successful explicit reload", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ status: "conflict" as const, message: "updated elsewhere" }));
    const load = vi.fn(async () =>
      actionResult.success({
        ...seed,
        draftId: crypto.randomUUID(),
        revision: 2,
        title: "server",
        content: "server body",
        tags: [{ content: "server tag", color: "blue" }],
      })
    );
    const c = new DraftController(seed, { save, publish: vi.fn(), load });
    c.update({ title: "local", content: "local body" });
    await vi.advanceTimersByTimeAsync(1000);
    c.update({ content: "keep this" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(c.getState().snapshot.content).toBe("keep this");
    expect(await c.retry()).toBe(false);
    expect(await c.loadLatest()).toBe(true);
    expect(c.getState().snapshot).toEqual({
      title: "server",
      content: "server body",
      tags: [{ content: "server tag", color: "blue" }],
    });
    c.dispose();
  });
  it("ignores a save completion after disposal and never fires its URL callback", async () => {
    let resolve!: (value: ReturnType<typeof actionResult.success<SavedDraft>>) => void;
    const onSaved = vi.fn();
    const c = new DraftController(seed, {
      save: async () =>
        new Promise((r) => {
          resolve = r;
        }),
      publish: vi.fn(),
      load: vi.fn(),
      onSaved,
    });
    c.update({ title: "old session" });
    const pending = c.flush();
    await Promise.resolve();
    c.dispose();
    resolve(
      actionResult.success({ draftId: "old", revision: 1, publishedRevision: 0, savedAt: "now" })
    );
    expect(await pending).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(c.getState().revision).toBe(0);
  });
  it("saves even an empty first submission and confirms a deleted publication without recreating it", async () => {
    const { controller: c, save, publish } = setup();
    publish.mockResolvedValueOnce(
      actionResult.success({ blogId: 42, publishedRevision: 1, publicationState: "deleted" })
    );
    await c.submit();
    expect(save).toHaveBeenCalledTimes(1);
    expect(c.getState().result?.publicationState).toBe("deleted");
    await c.submit();
    expect(publish).toHaveBeenCalledTimes(1);
    c.dispose();
  });
  it("does not save an untouched page, debounces raw input at 1000ms and pauses for IME", async () => {
    vi.useFakeTimers();
    const { controller: c, save } = setup();
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).not.toHaveBeenCalled();
    c.update({ content: "\n  raw  \n" });
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    c.setComposing(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).not.toHaveBeenCalled();
    c.setComposing(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save.mock.calls[0][0].content).toBe("\n  raw  \n");
    expect(c.getState().phase).toBe("saved");
    c.dispose();
  });
  it("serializes slow saves and never marks newer input saved from an older response", async () => {
    vi.useFakeTimers();
    let resolve!: (value: ReturnType<typeof actionResult.success<SavedDraft>>) => void;
    const save = vi.fn(async (_input: SaveDraftInput) => {
      void _input;
      return new Promise<ReturnType<typeof actionResult.success<SavedDraft>>>((r) => {
        resolve = r;
      });
    });
    const { controller: c } = setup(save);
    c.update({ title: "first" });
    await vi.advanceTimersByTimeAsync(1000);
    c.update({ title: "latest", content: "last" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    resolve(
      actionResult.success({ draftId: "id", revision: 1, publishedRevision: 0, savedAt: "now" })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(c.getState().snapshot.title).toBe("latest");
    expect(c.getState().phase).not.toBe("saved");
    expect(save.mock.calls[1][0]).toMatchObject({
      title: "latest",
      content: "last",
      expectedRevision: 1,
    });
    c.dispose();
  });
  it("retries the original uncertain snapshot before saving newer edits", async () => {
    const { controller: c, save } = setup();
    save.mockRejectedValueOnce(new Error("lost response"));
    c.update({ content: "original" });
    expect(await c.flush()).toBe(false);
    const first = save.mock.calls[0][0];
    c.update({ content: "newer" });
    expect(await c.retry()).toBe(true);
    expect(save.mock.calls[1][0]).toEqual(first);
    expect(save.mock.calls[2][0]).toMatchObject({ content: "newer", expectedRevision: 1 });
    expect(c.getState().phase).toBe("saved");
    c.dispose();
  });
  it("keeps one frozen publication and confirms with its original identifier after response loss", async () => {
    const { controller: c, publish } = setup();
    publish.mockRejectedValueOnce(new Error("lost response"));
    c.update({ title: "publish" });
    await Promise.all([c.submit(), c.submit()]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(c.getState().publication).toBe("unknown");
    c.update({ title: "must stay frozen" });
    expect(c.getState().snapshot.title).toBe("publish");
    await c.confirmPublication();
    expect(publish.mock.calls[1]).toEqual(publish.mock.calls[0]);
    expect(c.getState().result?.blogId).toBe(42);
    c.dispose();
  });
});
