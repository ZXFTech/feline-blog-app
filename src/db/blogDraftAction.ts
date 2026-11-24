"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type BlogDraft } from "../../generated/prisma-postgres/client";
import db from "@/db/client";
import { applicationObject } from "@/db/postgres/schema";
import { hasBlogRoles } from "@/lib/auth/userAuth";
import { actionResult, type ActionResult } from "@/lib/server/actionResult";
import { classifyDataError, safeErrorContext } from "@/lib/server/error";
import { parsePositiveInt } from "@/lib/server/validation";
import {
  isDraftId,
  parseDraftSave,
  parseDraftTags,
  parsePublishInput,
} from "@/lib/blog/draft-validation";
import logger from "@/lib/logger/Logger";
import type { BlogEditorSeed, DraftListPage, PublishedDraft, SavedDraft } from "@/types/blog-draft";

const missing = () => actionResult.failure("not_found", "草稿不存在或已删除");
const conflict = () => actionResult.failure("conflict", "草稿已在其他位置更新，已停止自动保存");
function editorSeed(row: BlogDraft): BlogEditorSeed {
  return {
    draftId: row.id,
    blogId: row.blogId,
    title: row.title,
    content: row.content,
    tags: parseDraftTags(row.tags) ?? [],
    revision: row.revision,
    publishedRevision: row.publishedRevision,
    savedAt: row.updatedAt.toISOString(),
  };
}
function saved(row: BlogDraft): SavedDraft {
  return {
    draftId: row.id,
    revision: row.revision,
    publishedRevision: row.publishedRevision,
    savedAt: row.updatedAt.toISOString(),
  };
}
function readable(authorId: string): Prisma.BlogDraftWhereInput {
  return {
    authorId,
    deletedAt: null,
    OR: [{ blogId: null }, { blog: { is: { authorId, delete: false } } }],
  };
}
async function lockDraft(tx: Prisma.TransactionClient, draftId: string) {
  // Also serializes the very first save, before a row exists.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`blog-draft:${draftId}`}, 0))`;
}
async function ownedBlog(tx: Prisma.TransactionClient, blogId: number, authorId: string) {
  const rows = await tx.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM ${applicationObject("Blog")}
    WHERE id = ${blogId} AND "authorId" = ${authorId} AND "delete" = false FOR UPDATE
  `;
  return rows.length > 0;
}
async function available(
  tx: Prisma.TransactionClient,
  blogId: number,
  authorId: string,
  revision: number
): Promise<PublishedDraft> {
  const blog = await tx.blog.findFirst({
    where: { id: blogId, authorId, delete: false },
    select: { id: true },
  });
  return { blogId, publishedRevision: revision, publicationState: blog ? "available" : "deleted" };
}
function failed(operation: string, error: unknown, authorId: string) {
  logger.error(safeErrorContext(operation, error, { userId: authorId }));
  return (
    classifyDataError(error) ??
    actionResult.failure("temporary_failure", "暂时无法完成草稿操作，请重试")
  );
}

export async function getBlogDraft(input: unknown): Promise<ActionResult<BlogEditorSeed>> {
  const auth = await hasBlogRoles();
  if (auth.status !== "success") return auth;
  if (!isDraftId(input)) return actionResult.failure("invalid_input", "草稿标识无效");
  try {
    const row = await db.blogDraft.findFirst({ where: { ...readable(auth.data.id), id: input } });
    return row ? actionResult.success(editorSeed(row)) : missing();
  } catch (error) {
    return failed("getBlogDraft", error, auth.data.id);
  }
}

export async function getBlogEditorData(input: unknown): Promise<ActionResult<BlogEditorSeed>> {
  const auth = await hasBlogRoles();
  if (auth.status !== "success") return auth;
  const blogId = parsePositiveInt(input);
  if (!blogId) return actionResult.failure("invalid_input", "文章标识无效");
  try {
    return await db.$transaction(async (tx) => {
      const blog = await tx.blog.findFirst({
        where: { id: blogId, authorId: auth.data.id, delete: false },
        include: { tags: { include: { tag: true } } },
      });
      if (!blog) return missing();
      const draft = await tx.blogDraft.findFirst({ where: { blogId, ...readable(auth.data.id) } });
      return actionResult.success(
        draft
          ? editorSeed(draft)
          : {
              draftId: null,
              blogId,
              title: blog.title,
              content: blog.content,
              tags: blog.tags.map(({ tag }) => ({ content: tag.content, color: tag.color })),
              revision: 0,
              publishedRevision: 0,
              savedAt: null,
            }
      );
    });
  } catch (error) {
    return failed("getBlogEditorData", error, auth.data.id);
  }
}

export async function getMyBlogDrafts(input: unknown = 1): Promise<ActionResult<DraftListPage>> {
  const auth = await hasBlogRoles();
  if (auth.status !== "success") return auth;
  const requested = parsePositiveInt(input);
  if (!requested) return actionResult.failure("invalid_input", "页码无效");
  try {
    return await db.$transaction(
      async (tx) => {
        const where: Prisma.BlogDraftWhereInput = {
          ...readable(auth.data.id),
          revision: { gt: tx.blogDraft.fields.publishedRevision },
        };
        const total = await tx.blogDraft.count({ where });
        const page = Math.min(requested, Math.max(1, Math.ceil(total / 20)));
        const rows = await tx.blogDraft.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * 20,
          take: 20,
          select: { id: true, blogId: true, title: true, revision: true, updatedAt: true },
        });
        return actionResult.success({
          rows: rows.map(({ updatedAt, ...row }) => ({ ...row, savedAt: updatedAt.toISOString() })),
          total,
          page,
          pageSize: 20,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  } catch (error) {
    return failed("getMyBlogDrafts", error, auth.data.id);
  }
}

export async function saveBlogDraft(input: unknown): Promise<ActionResult<SavedDraft>> {
  const auth = await hasBlogRoles();
  if (auth.status !== "success") return auth;
  const parsed = parseDraftSave(input);
  if (!parsed) return actionResult.failure("invalid_input", "标题或标签无效，请检查长度及标签颜色");
  const { draftId, blogId, expectedRevision, saveRequestId, title, content, tags } = parsed;
  const hash = createHash("sha256")
    .update(JSON.stringify({ blogId, title, content, tags }))
    .digest("hex");
  try {
    return await db.$transaction(async (tx) => {
      await lockDraft(tx, draftId);
      const row = await tx.blogDraft.findFirst({ where: { id: draftId, authorId: auth.data.id } });
      if (row?.deletedAt) return missing();
      if (row?.blogId && !(await ownedBlog(tx, row.blogId, auth.data.id))) return missing();
      if (row?.lastSaveRequestId === saveRequestId) {
        return row.lastSavePayloadHash === hash ? actionResult.success(saved(row)) : conflict();
      }
      if (row && (row.revision !== expectedRevision || row.blogId !== blogId)) return conflict();
      if (!row) {
        if (expectedRevision !== 0) return missing();
        // A receipt also fences a draft removed by an article's cascading hard deletion.
        const published = await tx.blogPublishReceipt.findFirst({
          where: { draftId, authorId: auth.data.id },
          select: { draftId: true },
        });
        if (published) return missing();
        if (blogId !== null) {
          if (!(await ownedBlog(tx, blogId, auth.data.id))) return missing();
          if (await tx.blogDraft.findFirst({ where: { blogId, authorId: auth.data.id } }))
            return conflict();
        }
        const created = await tx.blogDraft.createMany({
          data: {
            id: draftId,
            authorId: auth.data.id,
            blogId,
            title,
            content,
            tags: tags.map((tag) => ({ ...tag })),
            lastSaveRequestId: saveRequestId,
            lastSavePayloadHash: hash,
          },
          skipDuplicates: true,
        });
        if (!created.count) return missing();
        const confirmed = await tx.blogDraft.findFirst({
          where: { id: draftId, authorId: auth.data.id },
        });
        return confirmed ? actionResult.success(saved(confirmed)) : missing();
      }
      // Database clock, not the client's request timestamp, is the save time.
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const updated = await tx.blogDraft.update({
        where: { id: draftId, authorId: auth.data.id, revision: expectedRevision, deletedAt: null },
        data: {
          title,
          content,
          tags: tags.map((tag) => ({ ...tag })),
          revision: { increment: 1 },
          updatedAt: clock.now,
          lastSaveRequestId: saveRequestId,
          lastSavePayloadHash: hash,
        },
      });
      return actionResult.success(saved(updated));
    });
  } catch (error) {
    return failed("saveBlogDraft", error, auth.data.id);
  }
}

export async function publishBlogDraft(input: unknown): Promise<ActionResult<PublishedDraft>> {
  const auth = await hasBlogRoles();
  if (auth.status !== "success") return auth;
  const parsed = parsePublishInput(input);
  if (!parsed) return actionResult.failure("invalid_input", "发布请求无效");
  const { draftId, expectedRevision, publishRequestId } = parsed;
  let result: ActionResult<PublishedDraft>;
  try {
    result = await db.$transaction(
      async (tx) => {
        await lockDraft(tx, draftId);
        const receipt = await tx.blogPublishReceipt.findFirst({
          where: { draftId, publishRequestId, authorId: auth.data.id },
        });
        if (receipt)
          return receipt.revision === expectedRevision
            ? actionResult.success(
                await available(tx, receipt.blogId, auth.data.id, receipt.revision)
              )
            : conflict();
        const row = await tx.blogDraft.findFirst({
          where: { id: draftId, authorId: auth.data.id, deletedAt: null },
        });
        if (!row) return missing();
        if (row.revision !== expectedRevision) return conflict();
        if (row.blogId !== null && !(await ownedBlog(tx, row.blogId, auth.data.id)))
          return missing();
        let blogId = row.blogId;
        if (row.publishedRevision !== expectedRevision) {
          const tags = parseDraftTags(row.tags);
          if (!tags) return actionResult.failure("invalid_input", "草稿标签无效");
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`blog-tags:${auth.data.id}`}, 0))`;
          const ids = new Set<number>();
          for (const tag of tags) {
            // PostgreSQL citext decides equality. Deduplicate by returned ID, not JS casing.
            const resolved = await tx.tag.upsert({
              where: { userId_content: { userId: auth.data.id, content: tag.content } },
              create: { userId: auth.data.id, ...tag },
              update: { color: tag.color },
            });
            ids.add(resolved.id);
          }
          const data = { title: row.title.trim() || "无标题", content: row.content };
          if (blogId === null) {
            const blog = await tx.blog.create({ data: { ...data, authorId: auth.data.id } });
            blogId = blog.id;
          } else {
            await tx.blog.update({
              where: { id: blogId, authorId: auth.data.id, delete: false },
              data,
            });
            await tx.tagsOnBlogs.deleteMany({ where: { blogId } });
          }
          if (ids.size)
            await tx.tagsOnBlogs.createMany({
              data: [...ids].map((tagId) => ({ blogId: blogId!, tagId, assignedBy: auth.data.id })),
            });
          await tx.blogDraft.update({
            where: {
              id: draftId,
              authorId: auth.data.id,
              revision: expectedRevision,
              deletedAt: null,
            },
            data: { blogId, publishedRevision: expectedRevision },
          });
        }
        if (blogId === null) return missing();
        await tx.blogPublishReceipt.create({
          data: {
            draftId,
            publishRequestId,
            authorId: auth.data.id,
            revision: expectedRevision,
            blogId,
          },
        });
        return actionResult.success(await available(tx, blogId, auth.data.id, expectedRevision));
      },
      { timeout: 10000 }
    );
  } catch (error) {
    return failed("publishBlogDraft", error, auth.data.id);
  }
  // Cache failure cannot change a committed publication into a failed mutation.
  if (result.status === "success") {
    try {
      revalidatePath("/blog");
      revalidatePath(`/blog/${result.data.blogId}`);
      revalidatePath("/blog/drafts");
    } catch (error) {
      logger.error(
        safeErrorContext("publishBlogDraft.revalidate", error, { resourceId: result.data.blogId })
      );
    }
  }
  return result;
}

export async function discardBlogDraft(input: unknown): Promise<ActionResult<{ draftId: string }>> {
  const auth = await hasBlogRoles();
  if (auth.status !== "success") return auth;
  const r = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const revision =
    typeof r.expectedRevision === "number" &&
    Number.isSafeInteger(r.expectedRevision) &&
    r.expectedRevision > 0
      ? r.expectedRevision
      : null;
  if (!isDraftId(r.draftId) || revision === null)
    return actionResult.failure("invalid_input", "删除请求无效");
  const draftId = r.draftId.toLowerCase();
  try {
    const result = await db.$transaction(async (tx) => {
      await lockDraft(tx, draftId);
      const row = await tx.blogDraft.findFirst({ where: { id: draftId, authorId: auth.data.id } });
      if (!row) return missing();
      if (row.deletedAt) return actionResult.success({ draftId });
      if (row.revision !== revision) return conflict();
      if (row.blogId !== null && !(await ownedBlog(tx, row.blogId, auth.data.id))) return missing();
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      await tx.blogDraft.update({
        where: { id: draftId, authorId: auth.data.id, revision, deletedAt: null },
        data: {
          deletedAt: clock.now,
          revision: { increment: 1 },
          blogId: null,
          title: "",
          content: "",
          tags: [],
        },
      });
      return actionResult.success({ draftId });
    });
    return result;
  } catch (error) {
    return failed("discardBlogDraft", error, auth.data.id);
  }
}
