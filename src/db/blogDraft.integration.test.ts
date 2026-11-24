// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { revalidatePath } from "next/cache";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma-postgres/client";
import type { ActionResult } from "@/lib/server/actionResult";
import type { SaveDraftInput } from "@/types/blog-draft";

const auth = vi.hoisted(() => ({ authorId: "", failTags: false, rejectedTagWrites: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sdk/config", () => ({ getSdkDatabaseSchema: () => "public" }));
vi.mock("@/lib/auth/userAuth", () => ({
  hasBlogRoles: async () => ({ status: "success", data: { id: auth.authorId } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger/Logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/db/client", () => ({
  default: {
    blogDraft: {
      findFirst: (...args: Parameters<typeof db.blogDraft.findFirst>) =>
        db.blogDraft.findFirst(...args),
    },
    $transaction: (...[callback, options]: Parameters<typeof db.$transaction>) =>
      db.$transaction(async (tx) => {
        if (auth.failTags) {
          vi.spyOn(tx.tagsOnBlogs, "createMany").mockImplementation(() => {
            auth.rejectedTagWrites++;
            throw new Error("Injected local tag step failure");
          });
        }
        return callback(tx);
      }, options),
  },
}));
import {
  discardBlogDraft,
  getBlogDraft,
  getBlogEditorData,
  getMyBlogDrafts,
  publishBlogDraft,
  saveBlogDraft,
} from "@/db/blogDraftAction";

const connectionString = process.env.BLOG_DRAFT_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/feline_ci_verify" ||
    url.username !== "postgres" ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("Draft integration tests require the disposable local replay database.");
}
let db: PrismaClient;
function data<T>(result: ActionResult<T>): T {
  expect(result.status).toBe("success");
  if (result.status !== "success") throw new Error(result.status);
  return result.data;
}
function input(extra: Partial<SaveDraftInput> = {}): SaveDraftInput {
  return {
    draftId: randomUUID(),
    blogId: null,
    expectedRevision: 0,
    saveRequestId: randomUUID(),
    title: "",
    content: "\n  code  \n\n",
    tags: [],
    ...extra,
  };
}
describe.skipIf(!connectionString)("Blog drafts, isolated local PostgreSQL transactions", () => {
  const authors: string[] = [];
  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    for (let i = 0; i < 2; i++) {
      const user = await db.user.create({
        data: {
          email: `draft-integration-${randomUUID()}@example.test`,
          username: "Disposable draft author",
          authMode: "sdk",
          role: "ROOT",
        },
      });
      authors.push(user.id);
    }
    auth.authorId = authors[0];
  });
  afterAll(async () => {
    auth.failTags = false;
    if (!db) return;
    const blogs = await db.blog.findMany({
      where: { authorId: { in: authors } },
      select: { id: true },
    });
    await db.tagsOnBlogs.deleteMany({ where: { blogId: { in: blogs.map((blog) => blog.id) } } });
    await db.user.deleteMany({ where: { id: { in: authors } } });
    await db.$disconnect();
  });
  it("keeps saves private, honors exact retry payloads, publishes once and preserves receipts after deletion", async () => {
    const request = input({
      title: "private-new",
      tags: [
        { content: "TypeScript", color: "blue" },
        { content: "typescript", color: "green" },
      ],
    });
    const saved = data(await saveBlogDraft(request));
    expect(saved.revision).toBe(1);
    expect(data(await saveBlogDraft(request)).revision).toBe(1);
    expect((await saveBlogDraft({ ...request, content: "changed with reused ID" })).status).toBe(
      "conflict"
    );
    expect(await db.blog.count({ where: { authorId: authors[0], title: request.title } })).toBe(0);
    expect(await db.tag.count({ where: { userId: authors[0] } })).toBe(0);
    const publish = {
      draftId: request.draftId,
      expectedRevision: 1,
      publishRequestId: randomUUID(),
    };
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error("Injected post-commit cache failure");
    });
    const results = await Promise.all([publishBlogDraft(publish), publishBlogDraft(publish)]);
    const published = data(results[0]);
    expect(data(results[1]).blogId).toBe(published.blogId);
    expect(await db.blog.count({ where: { authorId: authors[0], title: request.title } })).toBe(1);
    const blog = await db.blog.findUniqueOrThrow({
      where: { id: published.blogId },
      include: { tags: { include: { tag: true } } },
    });
    expect(blog.content).toBe(request.content);
    expect(blog.tags).toHaveLength(1);
    expect(blog.tags[0].tag.color).toBe("green");
    expect(data(await getMyBlogDrafts()).rows.some((row) => row.id === request.draftId)).toBe(
      false
    );
    expect(data(await getBlogDraft(request.draftId)).savedAt).toBe(saved.savedAt);
    data(await discardBlogDraft({ draftId: request.draftId, expectedRevision: 1 }));
    expect((await saveBlogDraft(request)).status).toBe("not_found");
    expect((await publishBlogDraft({ ...publish, publishRequestId: randomUUID() })).status).toBe(
      "not_found"
    );
    expect(data(await publishBlogDraft(publish)).blogId).toBe(blog.id);
    expect((await publishBlogDraft({ ...publish, expectedRevision: 2 })).status).toBe("conflict");
    const tombstone = await db.blogDraft.findUniqueOrThrow({ where: { id: request.draftId } });
    expect({
      title: tombstone.title,
      content: tombstone.content,
      tags: tombstone.tags,
      blogId: tombstone.blogId,
    }).toEqual({ title: "", content: "", tags: [], blogId: null });
    await db.blog.update({ where: { id: blog.id }, data: { delete: true } });
    expect(data(await publishBlogDraft(publish)).publicationState).toBe("deleted");
    auth.authorId = authors[1];
    expect((await publishBlogDraft(publish)).status).toBe("not_found");
    auth.authorId = authors[0];
  });
  it("never recreates a published draft from a delayed first-save retry after article hard deletion", async () => {
    const request = input({ title: "hard deleted new article" });
    data(await saveBlogDraft(request));
    const publication = {
      draftId: request.draftId,
      expectedRevision: 1,
      publishRequestId: randomUUID(),
    };
    const published = data(await publishBlogDraft(publication));
    await db.blog.delete({ where: { id: published.blogId } });
    expect(await db.blogDraft.findUnique({ where: { id: request.draftId } })).toBeNull();
    expect(data(await publishBlogDraft(publication)).publicationState).toBe("deleted");
    expect((await saveBlogDraft(request)).status).toBe("not_found");
    expect(await db.blogDraft.findUnique({ where: { id: request.draftId } })).toBeNull();
  });
  // spec 0016 covers: AC-2, AC-7, AC-9, AC-13. Use real rows to protect every owner write.
  it("refuses another author's read, save, publication confirmation and deletion without changing the draft", async () => {
    const request = input({ title: "private owner boundary" });
    data(await saveBlogDraft(request));
    const publication = {
      draftId: request.draftId,
      expectedRevision: 1,
      publishRequestId: randomUUID(),
    };
    const published = data(await publishBlogDraft(publication));
    const next = {
      ...request,
      expectedRevision: 1,
      saveRequestId: randomUUID(),
      blogId: published.blogId,
      content: "owner pending changes",
    };
    data(await saveBlogDraft(next));
    const before = await db.blogDraft.findUniqueOrThrow({ where: { id: request.draftId } });
    try {
      auth.authorId = authors[1];
      const attempts = await Promise.all([
        getBlogDraft(request.draftId),
        getBlogEditorData(published.blogId),
        saveBlogDraft({
          ...next,
          expectedRevision: 2,
          saveRequestId: randomUUID(),
          content: "foreign changes",
        }),
        publishBlogDraft(publication),
        publishBlogDraft({ ...publication, expectedRevision: 2, publishRequestId: randomUUID() }),
        discardBlogDraft({ draftId: request.draftId, expectedRevision: 2 }),
      ]);
      expect(attempts.map((result) => result.status)).toEqual(Array(6).fill("not_found"));
      expect(data(await getMyBlogDrafts()).rows.some((row) => row.id === request.draftId)).toBe(
        false
      );
      expect(await db.blogDraft.findUniqueOrThrow({ where: { id: request.draftId } })).toEqual(
        before
      );
      expect((await db.blog.findUniqueOrThrow({ where: { id: published.blogId } })).content).toBe(
        request.content
      );
      expect(await db.blogPublishReceipt.count({ where: { draftId: request.draftId } })).toBe(1);
    } finally {
      auth.authorId = authors[0];
    }
  });
  it("isolates existing published content, rejects stale writers and preserves identity and interactions", async () => {
    const sharedTag = await db.tag.create({
      data: { userId: authors[0], content: "shared-color", color: "blue" },
    });
    const blog = await db.blog.create({
      data: {
        authorId: authors[0],
        title: "old",
        content: "published original",
        likes: { create: { userId: authors[1] } },
        favorites: { create: { userId: authors[1] } },
        tags: { create: { tagId: sharedTag.id, assignedBy: authors[0] } },
      },
    });
    const request = input({
      blogId: blog.id,
      title: "updated",
      content: "raw\nsoft line\n",
      tags: [{ content: "SHARED-color", color: "red" }],
    });
    data(await saveBlogDraft(request));
    expect((await db.tag.findUniqueOrThrow({ where: { id: sharedTag.id } })).color).toBe("blue");
    expect((await db.blog.findUniqueOrThrow({ where: { id: blog.id } })).content).toBe(
      "published original"
    );
    expect(data(await getBlogEditorData(blog.id)).content).toBe(request.content);
    expect((await saveBlogDraft(input({ blogId: blog.id }))).status).toBe("conflict");
    const writes = await Promise.all([
      saveBlogDraft({
        ...request,
        expectedRevision: 1,
        saveRequestId: randomUUID(),
        content: "winner A",
      }),
      saveBlogDraft({
        ...request,
        expectedRevision: 1,
        saveRequestId: randomUUID(),
        content: "winner B",
      }),
    ]);
    expect(writes.map((result) => result.status).sort()).toEqual(["conflict", "success"]);
    expect((await discardBlogDraft({ draftId: request.draftId, expectedRevision: 1 })).status).toBe(
      "conflict"
    );
    const draft = data(await getBlogDraft(request.draftId));
    data(
      await publishBlogDraft({
        draftId: request.draftId,
        expectedRevision: 2,
        publishRequestId: randomUUID(),
      })
    );
    const updated = await db.blog.findUniqueOrThrow({
      where: { id: blog.id },
      include: { likes: true, favorites: true },
    });
    expect(updated.content).toBe(draft.content);
    expect(updated.authorId).toBe(blog.authorId);
    expect(updated.createdAt).toEqual(blog.createdAt);
    expect(updated.likes).toHaveLength(1);
    expect(updated.favorites).toHaveLength(1);
    expect((await db.tag.findUniqueOrThrow({ where: { id: sharedTag.id } })).color).toBe("red");
    auth.authorId = authors[1];
    expect((await getBlogDraft(request.draftId)).status).toBe("not_found");
    expect(
      (
        await saveBlogDraft({
          ...request,
          expectedRevision: 0,
          saveRequestId: randomUUID(),
          blogId: null,
        })
      ).status
    ).toBe("not_found");
    expect(
      (await saveBlogDraft({ ...request, expectedRevision: 2, saveRequestId: randomUUID() })).status
    ).toBe("not_found");
    expect((await getBlogEditorData(blog.id)).status).toBe("not_found");
    auth.authorId = authors[0];
    // Hard deletion cascades the draft but deliberately keeps the publication receipt.
    const confirmation = {
      draftId: request.draftId,
      expectedRevision: 2,
      publishRequestId: randomUUID(),
    };
    data(await publishBlogDraft(confirmation));
    await db.tagsOnBlogs.deleteMany({ where: { blogId: blog.id } });
    await db.blog.delete({ where: { id: blog.id } });
    expect(await db.blogDraft.findUnique({ where: { id: request.draftId } })).toBeNull();
    expect(data(await publishBlogDraft(confirmation)).publicationState).toBe("deleted");
  });
  it("rolls the whole publication back when its tag step fails", async () => {
    const request = input({
      title: "must roll back",
      tags: [{ content: "rollback-tag", color: "blue" }],
    });
    data(await saveBlogDraft(request));
    auth.failTags = true;
    auth.rejectedTagWrites = 0;
    const result = await publishBlogDraft({
      draftId: request.draftId,
      expectedRevision: 1,
      publishRequestId: randomUUID(),
    });
    auth.failTags = false;
    expect(auth.rejectedTagWrites).toBe(1);
    expect(result.status).toBe("temporary_failure");
    expect(await db.blog.count({ where: { authorId: authors[0], title: request.title } })).toBe(0);
    expect(await db.tag.count({ where: { userId: authors[0], content: "rollback-tag" } })).toBe(0);
    expect(data(await getBlogDraft(request.draftId)).publishedRevision).toBe(0);
    expect(await db.blogPublishReceipt.count({ where: { draftId: request.draftId } })).toBe(0);
  });
  it("paginates and clamps after deletion, with live RLS and revision constraints", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const request = input({ title: `page-${i}` });
      ids.push(request.draftId);
      data(await saveBlogDraft(request));
    }
    const last = data(await getMyBlogDrafts(999));
    expect(last.page).toBe(Math.ceil(last.total / 20));
    expect(last.pageSize).toBe(20);
    for (const row of last.rows)
      data(await discardBlogDraft({ draftId: row.id, expectedRevision: row.revision }));
    expect(data(await getMyBlogDrafts(last.page)).page).toBeLessThan(last.page);
    const tables = await db.$queryRaw<
      Array<{ relname: string; relrowsecurity: boolean }>
    >`SELECT relname, relrowsecurity FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname IN ('BlogDraft', 'BlogPublishReceipt')`;
    expect(tables).toHaveLength(2);
    expect(tables.every((table) => table.relrowsecurity)).toBe(true);
    const apiGrants = await db.$queryRaw<
      Array<{ grantee: string }>
    >`SELECT grantee FROM information_schema.table_privileges
        WHERE table_schema = 'public' AND table_name IN ('BlogDraft', 'BlogPublishReceipt')
          AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')`;
    expect(apiGrants).toEqual([]);
    await expect(
      db.blogDraft.update({ where: { id: ids[0] }, data: { publishedRevision: 999 } })
    ).rejects.toBeDefined();
  });
});
