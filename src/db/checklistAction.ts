"use server";

import { createHash } from "node:crypto";
import { Prisma } from "../../generated/prisma-postgres/client";
import db from "@/db/client";
import { requireAuth } from "@/lib/auth/userAuth";
import { actionResult } from "@/lib/server/actionResult";
import logger from "@/lib/logger/Logger";
import { safeErrorContext } from "@/lib/server/error";
import { readChecklistCursor, signChecklistCursor } from "@/lib/checklists/cursor";
import {
  isUuid,
  normalizeText,
  parseChecklistListInput,
  parseChecklistWriteInput,
} from "@/lib/checklists/validation";
import type {
  ChecklistConfirmationFilter,
  ChecklistDetail,
  ChecklistItemTrashItem,
  ChecklistListInput,
  ChecklistListItem,
  ChecklistTrashItem,
  CreateChecklistInput,
  UpdateChecklistInput,
} from "@/types/checklist";

const PAGE_SIZE = 24;
const RESTORE_MS = 30 * 24 * 60 * 60 * 1000;
const UNDO_MS = 10_000;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

type ChecklistProjection = Prisma.ChecklistGetPayload<{
  include: { items: { where: { deletedAt: null }; orderBy: { createdOrder: "asc" } } };
}>;

function confirmationState(confirmedCount: number, itemCount: number) {
  if (itemCount > 0 && confirmedCount === itemCount) return "confirmed" as const;
  if (confirmedCount === 0) return "unconfirmed" as const;
  return "partial" as const;
}

function toListItem(row: ChecklistProjection, asOf: Date): ChecklistListItem {
  const confirmedCount = row.items.filter((item) => item.confirmedAt !== null).length;
  return {
    id: row.id,
    name: row.name,
    themeColor: row.themeColor,
    expiresAt: row.expiresAt.toISOString(),
    expiryState: row.expiresAt <= asOf ? "expired" : "active",
    confirmationState: confirmationState(confirmedCount, row.items.length),
    itemCount: row.items.length,
    confirmedCount,
    revision: row.revision,
  };
}

function toDetail(row: ChecklistProjection, asOf: Date, serverNow = asOf): ChecklistDetail {
  return {
    ...toListItem(row, asOf),
    items: [...row.items]
      .sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.createdOrder - b.createdOrder
      )
      .map((item) => ({
        id: item.id,
        detail: item.detail,
        confirmedAt: item.confirmedAt?.toISOString() ?? null,
        createdOrder: item.createdOrder,
        revision: item.revision,
      })),
    serverNow: serverNow.toISOString(),
  };
}

async function databaseNow(client: Pick<Prisma.TransactionClient, "$queryRaw"> = db) {
  const rows = await client.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return rows[0]?.now ?? new Date();
}

function createPayloadHash(value: {
  name: string;
  themeColor: string;
  localDateTime: string;
  timeZone: string;
  expiresAt: Date;
  items: Array<{ detail: string }>;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        name: value.name,
        themeColor: value.themeColor,
        localDateTime: value.localDateTime,
        timeZone: value.timeZone,
        expiresAt: value.expiresAt.toISOString(),
        items: value.items.map((item) => ({ detail: item.detail })),
      })
    )
    .digest("hex");
}

function confirmationWhere(value: ChecklistConfirmationFilter): Prisma.ChecklistWhereInput {
  const activeConfirmed = { deletedAt: null, confirmedAt: { not: null } };
  const activeUnconfirmed = { deletedAt: null, confirmedAt: null };
  if (value === "confirmed") {
    return { items: { some: activeConfirmed, none: activeUnconfirmed } };
  }
  if (value === "partial") {
    return { AND: [{ items: { some: activeConfirmed } }, { items: { some: activeUnconfirmed } }] };
  }
  if (value === "unconfirmed") {
    return { items: { some: activeUnconfirmed, none: activeConfirmed } };
  }
  return {};
}

async function lockOwnedChecklist(tx: Prisma.TransactionClient, id: string, userId: string) {
  const rows = await tx.$queryRaw<
    Array<{ id: string; revision: number; expiresAt: Date; name: string; themeColor: string }>
  >(
    Prisma.sql`SELECT "id", "revision", "expiresAt", "name", "themeColor" FROM "Checklist"
      WHERE "id" = ${id}::uuid AND "userId" = ${userId} AND "deletedAt" IS NULL
      FOR UPDATE`
  );
  return rows[0] ?? null;
}

async function lockOwnedDeletedChecklist(tx: Prisma.TransactionClient, id: string, userId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; revision: number; deletedAt: Date | null }>>(
    Prisma.sql`SELECT "id", "revision", "deletedAt" FROM "Checklist"
      WHERE "id" = ${id}::uuid AND "userId" = ${userId} AND "deletedAt" IS NOT NULL
      FOR UPDATE`
  );
  return rows[0] ?? null;
}

async function findDetail(id: string, userId: string, includeDeleted = false) {
  return db.checklist.findFirst({
    where: { id, userId, ...(includeDeleted ? {} : { deletedAt: null }) },
    include: { items: { where: { deletedAt: null }, orderBy: { createdOrder: "asc" } } },
  });
}

export async function getChecklists(input: ChecklistListInput = {}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  const parsed = parseChecklistListInput(input);
  if (!parsed) return actionResult.failure("invalid_input", "清单筛选条件无效");

  let serverNow: Date;
  try {
    serverNow = await databaseNow();
  } catch (error) {
    logger.error(safeErrorContext("getChecklistsClock", error, { userId: auth.data.id }));
    return actionResult.failure("temporary_failure", "暂时无法读取清单");
  }
  let asOf = serverNow;
  let cursor: ReturnType<typeof readChecklistCursor> = null;
  if (parsed.cursor) {
    cursor = readChecklistCursor(parsed.cursor);
    if (
      !cursor ||
      cursor.kind !== "list" ||
      cursor.ownerId !== auth.data.id ||
      cursor.expiry !== parsed.expiry ||
      cursor.confirmation !== parsed.confirmation ||
      cursor.q !== parsed.q
    ) {
      return actionResult.failure("invalid_input", "分页位置已失效，请重新加载");
    }
    asOf = new Date(cursor.asOf);
  }

  const isExpired = parsed.expiry === "expired";
  const searchText = escapeLike(parsed.q);
  const searchWhere: Prisma.ChecklistWhereInput = parsed.q
    ? {
        OR: [
          { name: { contains: searchText, mode: "insensitive" } },
          {
            items: {
              some: {
                deletedAt: null,
                detail: { contains: searchText, mode: "insensitive" },
              },
            },
          },
        ],
      }
    : {};
  const cursorWhere: Prisma.ChecklistWhereInput = cursor
    ? {
        OR: [
          {
            expiresAt: isExpired
              ? { lt: new Date(cursor.orderAt) }
              : { gt: new Date(cursor.orderAt) },
          },
          { expiresAt: new Date(cursor.orderAt), id: { gt: cursor.id } },
        ],
      }
    : {};
  const where: Prisma.ChecklistWhereInput = {
    userId: auth.data.id,
    deletedAt: null,
    expiresAt: isExpired ? { lte: asOf } : { gt: asOf },
    AND: [confirmationWhere(parsed.confirmation), searchWhere, cursorWhere],
  };
  try {
    const rows = await db.checklist.findMany({
      where,
      include: { items: { where: { deletedAt: null }, orderBy: { createdOrder: "asc" } } },
      orderBy: [{ expiresAt: isExpired ? "desc" : "asc" }, { id: "asc" }],
      take: PAGE_SIZE + 1,
    });
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return actionResult.success({
      items: page.map((row) => toListItem(row, asOf)),
      nextCursor:
        hasMore && last
          ? signChecklistCursor({
              ownerId: auth.data.id,
              kind: "list",
              asOf: asOf.toISOString(),
              expiry: parsed.expiry,
              confirmation: parsed.confirmation,
              q: parsed.q,
              orderAt: last.expiresAt.toISOString(),
              id: last.id,
            })
          : null,
      asOf: asOf.toISOString(),
      serverNow: serverNow.toISOString(),
    });
  } catch (error) {
    logger.error(safeErrorContext("getChecklists", error, { userId: auth.data.id }));
    return actionResult.failure("temporary_failure", "暂时无法读取清单");
  }
}

export async function getChecklistDetail(id: string) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  if (!isUuid(id)) return actionResult.failure("not_found", "清单不存在");
  try {
    const [row, serverNow] = await Promise.all([findDetail(id, auth.data.id), databaseNow()]);
    return row
      ? actionResult.success(toDetail(row, serverNow, serverNow))
      : actionResult.failure("not_found", "清单不存在");
  } catch (error) {
    logger.error(
      safeErrorContext("getChecklistDetail", error, { userId: auth.data.id, resourceId: id })
    );
    return actionResult.failure("temporary_failure", "暂时无法读取清单");
  }
}

export async function getChecklistForEdit(id: string) {
  return getChecklistDetail(id);
}

export async function createChecklist(input: CreateChecklistInput) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  if (!isUuid(input?.createRequestId)) {
    return actionResult.failure("invalid_input", "创建请求标识无效", {
      createRequestId: "请刷新页面后重试",
    });
  }
  let serverNow: Date;
  try {
    serverNow = await databaseNow();
  } catch (error) {
    logger.error(safeErrorContext("createChecklistClock", error, { userId: auth.data.id }));
    return actionResult.failure("temporary_failure", "暂时无法创建清单");
  }
  const parsed = parseChecklistWriteInput(input, serverNow);
  if (!parsed.ok) return actionResult.failure("invalid_input", "请检查清单内容", parsed.fields);
  const payloadHash = createPayloadHash(parsed.value);
  try {
    const existing = await db.checklist.findUnique({
      where: {
        userId_createRequestId: { userId: auth.data.id, createRequestId: input.createRequestId },
      },
      include: { items: { where: { deletedAt: null }, orderBy: { createdOrder: "asc" } } },
    });
    if (existing) {
      return existing.createPayloadHash === payloadHash
        ? actionResult.success(toDetail(existing, serverNow, serverNow))
        : actionResult.failure("conflict", "相同创建请求已用于不同内容，请重新开始创建");
    }
    const created = await db.$transaction(async (tx) =>
      tx.checklist.create({
        data: {
          userId: auth.data.id,
          createRequestId: input.createRequestId,
          createPayloadHash: payloadHash,
          name: parsed.value.name,
          themeColor: parsed.value.themeColor,
          expiresAt: parsed.value.expiresAt,
          items: {
            create: parsed.value.items.map((item, index) => ({
              detail: item.detail,
              createdOrder: index + 1,
            })),
          },
        },
        include: { items: { where: { deletedAt: null }, orderBy: { createdOrder: "asc" } } },
      })
    );
    return actionResult.success(toDetail(created, serverNow, serverNow));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.checklist.findUnique({
        where: {
          userId_createRequestId: { userId: auth.data.id, createRequestId: input.createRequestId },
        },
        include: { items: { where: { deletedAt: null }, orderBy: { createdOrder: "asc" } } },
      });
      if (existing) {
        return existing.createPayloadHash === payloadHash
          ? actionResult.success(toDetail(existing, serverNow, serverNow))
          : actionResult.failure("conflict", "相同创建请求已用于不同内容，请重新开始创建");
      }
      return actionResult.failure("conflict", "创建请求已被其他操作处理，请刷新后重试");
    }
    logger.error(safeErrorContext("createChecklist", error, { userId: auth.data.id }));
    return actionResult.failure("temporary_failure", "暂时无法创建清单");
  }
}

export async function updateChecklist(input: UpdateChecklistInput) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  if (!isUuid(input?.id) || !Number.isInteger(input?.revision) || input.revision < 1) {
    return actionResult.failure("invalid_input", "清单版本无效");
  }
  let validationNow: Date;
  try {
    validationNow = await databaseNow();
  } catch (error) {
    logger.error(
      safeErrorContext("updateChecklistClock", error, {
        userId: auth.data.id,
        resourceId: input.id,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法更新清单");
  }
  const parsed = parseChecklistWriteInput(input, validationNow, false);
  if (!parsed.ok) return actionResult.failure("invalid_input", "请检查清单内容", parsed.fields);
  if (
    parsed.value.items.some((item) => (item.id && !isUuid(item.id)) || (item.id && !item.revision))
  ) {
    return actionResult.failure("invalid_input", "清单项目版本无效");
  }
  try {
    const updated = await db.$transaction(async (tx) => {
      const parent = await lockOwnedChecklist(tx, input.id, auth.data.id);
      if (!parent) return { failure: actionResult.failure("not_found", "清单不存在") } as const;
      if (parent.revision !== input.revision) {
        return { failure: actionResult.failure("conflict", "清单已被修改，请刷新后重试") } as const;
      }
      if (
        parent.expiresAt.getTime() !== parsed.value.expiresAt.getTime() &&
        parsed.value.expiresAt <= validationNow
      ) {
        return {
          failure: actionResult.failure("invalid_input", "请检查截止时间", {
            expiresAt: "修改后的截止时间必须晚于当前时间",
          }),
        } as const;
      }
      const existing = await tx.checklistItem.findMany({
        where: { checklistId: input.id, deletedAt: null },
        orderBy: { createdOrder: "asc" },
      });
      const byId = new Map(existing.map((item) => [item.id, item]));
      const submittedIds = new Set(
        parsed.value.items.flatMap((item) => (item.id ? [item.id] : []))
      );
      for (const item of parsed.value.items) {
        if (!item.id) continue;
        const current = byId.get(item.id);
        if (!current)
          return { failure: actionResult.failure("not_found", "清单项目不存在") } as const;
        if (current.revision !== item.revision) {
          return { failure: actionResult.failure("conflict", `项目 ${item.id} 已被修改`) } as const;
        }
      }
      const removed = existing.filter((item) => !submittedIds.has(item.id));
      const changedItems = parsed.value.items.filter(
        (item) => item.id && byId.get(item.id)?.detail !== item.detail
      );
      const newItems = parsed.value.items.filter((item) => !item.id);
      const metadataChanged =
        parent.name !== parsed.value.name ||
        parent.themeColor !== parsed.value.themeColor ||
        parent.expiresAt.getTime() !== parsed.value.expiresAt.getTime();
      const hasChanges =
        metadataChanged || changedItems.length > 0 || newItems.length > 0 || removed.length > 0;
      const stamp = await databaseNow(tx);

      if (!hasChanges) {
        const unchanged = await tx.checklist.findUniqueOrThrow({
          where: { id: input.id },
          include: { items: { where: { deletedAt: null }, orderBy: { createdOrder: "asc" } } },
        });
        return { detail: unchanged, deletedItems: [], serverNow: stamp };
      }
      for (const item of parsed.value.items) {
        if (item.id && byId.get(item.id)?.detail !== item.detail) {
          await tx.checklistItem.update({
            where: { id: item.id },
            data: { detail: item.detail, revision: { increment: 1 } },
          });
        }
      }
      if (removed.length) {
        await tx.checklistItem.updateMany({
          where: { id: { in: removed.map((item) => item.id) } },
          data: { deletedAt: stamp, revision: { increment: 1 } },
        });
      }
      let nextOrder = existing.reduce((max, item) => Math.max(max, item.createdOrder), 0) + 1;
      for (const item of parsed.value.items) {
        if (!item.id) {
          await tx.checklistItem.create({
            data: {
              checklistId: input.id,
              detail: item.detail,
              createdOrder: nextOrder++,
            },
          });
        }
      }
      const checklist = await tx.checklist.update({
        where: { id: input.id },
        data: {
          name: parsed.value.name,
          themeColor: parsed.value.themeColor,
          expiresAt: parsed.value.expiresAt,
          revision: { increment: 1 },
        },
        include: { items: { where: { deletedAt: null }, orderBy: { createdOrder: "asc" } } },
      });
      return {
        detail: checklist,
        deletedItems: removed.map((item) => ({
          id: item.id,
          revision: item.revision + 1,
          deletedAt: stamp.toISOString(),
        })),
        serverNow: stamp,
      };
    });
    if ("failure" in updated) return updated.failure;
    return actionResult.success({
      detail: toDetail(updated.detail, updated.serverNow, updated.serverNow),
      deletedItems: updated.deletedItems,
      serverNow: updated.serverNow.toISOString(),
      ...(updated.deletedItems.length
        ? { undoVisibleUntil: new Date(updated.serverNow.getTime() + UNDO_MS).toISOString() }
        : {}),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return actionResult.failure("conflict", "清单已被其他操作修改，请刷新后重试");
    }
    logger.error(
      safeErrorContext("updateChecklist", error, { userId: auth.data.id, resourceId: input.id })
    );
    return actionResult.failure("temporary_failure", "暂时无法更新清单");
  }
}

export async function addChecklistItem(input: {
  checklistId: string;
  itemId: string;
  detail: string;
  parentRevision: number;
}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  const detail = normalizeText(input?.detail, 2000);
  if (
    !isUuid(input?.checklistId) ||
    !isUuid(input?.itemId) ||
    detail === null ||
    !Number.isInteger(input?.parentRevision) ||
    input.parentRevision < 1
  ) {
    return actionResult.failure("invalid_input", "请填写 1 到 2000 个字符的清单项详情");
  }
  try {
    return await db.$transaction(async (tx) => {
      const parent = await lockOwnedChecklist(tx, input.checklistId, auth.data.id);
      if (!parent) return actionResult.failure("not_found", "清单不存在");
      const existing = await tx.checklistItem.findFirst({
        where: { id: input.itemId, checklistId: parent.id },
      });
      if (existing && (existing.deletedAt || existing.detail !== detail)) {
        return actionResult.failure("conflict", "新增项目已发生变化，请刷新后核对");
      }
      if (!existing) {
        if (parent.revision !== input.parentRevision) {
          return actionResult.failure("conflict", "清单已被修改，请刷新后重试");
        }
        const count = await tx.checklistItem.count({
          where: { checklistId: parent.id, deletedAt: null },
        });
        if (count >= 200)
          return actionResult.failure("invalid_input", "每份清单最多添加 200 个项目");
        const order = await tx.checklistItem.aggregate({
          where: { checklistId: parent.id },
          _max: { createdOrder: true },
        });
        await tx.checklistItem.create({
          data: {
            id: input.itemId,
            checklistId: parent.id,
            detail,
            createdOrder: (order._max.createdOrder ?? 0) + 1,
          },
        });
        await tx.checklist.update({
          where: { id: parent.id },
          data: { revision: { increment: 1 } },
        });
      }
      const row = await tx.checklist.findUniqueOrThrow({
        where: { id: parent.id },
        include: { items: { where: { deletedAt: null }, orderBy: { createdOrder: "asc" } } },
      });
      return actionResult.success(toDetail(row, await databaseNow(tx)));
    });
  } catch (error) {
    logger.error(
      safeErrorContext("addChecklistItem", error, {
        userId: auth.data.id,
        resourceId: input.checklistId,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法添加清单项目，请重试");
  }
}

export async function updateChecklistItemDetail(input: {
  checklistId: string;
  itemId: string;
  detail: string;
  itemRevision: number;
  parentRevision: number;
}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  const detail = normalizeText(input?.detail, 2000);
  if (
    !isUuid(input?.checklistId) ||
    !isUuid(input?.itemId) ||
    !Number.isInteger(input?.itemRevision) ||
    input.itemRevision < 1 ||
    !Number.isInteger(input?.parentRevision) ||
    input.parentRevision < 1 ||
    detail === null
  ) {
    return actionResult.failure("invalid_input", "请检查清单项详情", {
      detail: "项目详情需为 1 到 2000 个字符",
    });
  }
  try {
    const updated = await db.$transaction(async (tx) => {
      const serverNow = await databaseNow(tx);
      const parent = await lockOwnedChecklist(tx, input.checklistId, auth.data.id);
      if (!parent) return { failure: actionResult.failure("not_found", "清单不存在") } as const;
      if (parent.revision !== input.parentRevision) {
        return { failure: actionResult.failure("conflict", "清单已被修改，请刷新后重试") } as const;
      }
      const item = await tx.checklistItem.findFirst({
        where: {
          id: input.itemId,
          checklistId: input.checklistId,
          deletedAt: null,
        },
      });
      if (!item) return { failure: actionResult.failure("not_found", "清单项目不存在") } as const;
      if (item.revision !== input.itemRevision) {
        return {
          failure: actionResult.failure("conflict", "清单项目已被修改，请刷新后重试"),
        } as const;
      }
      const [changedItem, changedParent] = await Promise.all([
        tx.checklistItem.update({
          where: { id: item.id },
          data: { detail, revision: { increment: 1 } },
        }),
        tx.checklist.update({
          where: { id: parent.id },
          data: { revision: { increment: 1 } },
        }),
      ]);
      return {
        detail: changedItem.detail,
        itemRevision: changedItem.revision,
        parentRevision: changedParent.revision,
        serverNow: serverNow.toISOString(),
      };
    });
    if ("failure" in updated) return updated.failure;
    return actionResult.success(updated);
  } catch (error) {
    logger.error(
      safeErrorContext("updateChecklistItemDetail", error, {
        userId: auth.data.id,
        resourceId: input.checklistId,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法更新清单项目");
  }
}

export async function toggleChecklistItem(input: {
  checklistId: string;
  itemId: string;
  confirmed: boolean;
  itemRevision: number;
  parentRevision: number;
}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  if (
    !isUuid(input?.checklistId) ||
    !isUuid(input?.itemId) ||
    typeof input.confirmed !== "boolean" ||
    !Number.isInteger(input.itemRevision) ||
    input.itemRevision < 1 ||
    !Number.isInteger(input.parentRevision) ||
    input.parentRevision < 1
  ) {
    return actionResult.failure("invalid_input", "清单项目无效");
  }
  try {
    const result = await db.$transaction(async (tx) => {
      const serverNow = await databaseNow(tx);
      const parent = await lockOwnedChecklist(tx, input.checklistId, auth.data.id);
      if (!parent) return actionResult.failure("not_found", "清单不存在");
      const item = await tx.checklistItem.findFirst({
        where: { id: input.itemId, checklistId: input.checklistId, deletedAt: null },
      });
      if (!item) return actionResult.failure("not_found", "清单项目不存在");
      const reached = Boolean(item.confirmedAt) === input.confirmed;
      if (reached && item.revision === input.itemRevision) {
        return actionResult.success({
          itemId: item.id,
          confirmedAt: item.confirmedAt?.toISOString() ?? null,
          itemRevision: item.revision,
          parentRevision: parent.revision,
          serverNow: serverNow.toISOString(),
        });
      }
      if (parent.revision !== input.parentRevision || item.revision !== input.itemRevision) {
        return actionResult.failure("conflict", "清单已被修改，请刷新后重试");
      }
      const changed = await tx.checklistItem.update({
        where: { id: item.id },
        data: { confirmedAt: input.confirmed ? serverNow : null, revision: { increment: 1 } },
      });
      const changedParent = await tx.checklist.update({
        where: { id: parent.id },
        data: { revision: { increment: 1 } },
      });
      return actionResult.success({
        itemId: changed.id,
        confirmedAt: changed.confirmedAt?.toISOString() ?? null,
        itemRevision: changed.revision,
        parentRevision: changedParent.revision,
        serverNow: serverNow.toISOString(),
      });
    });
    return result;
  } catch (error) {
    logger.error(
      safeErrorContext("toggleChecklistItem", error, {
        userId: auth.data.id,
        resourceId: input.itemId,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法更新确认状态");
  }
}

export async function softDeleteChecklist(id: string, revision: number) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  if (!isUuid(id) || !Number.isInteger(revision) || revision < 1)
    return actionResult.failure("invalid_input", "清单版本无效");
  try {
    return await db.$transaction(async (tx) => {
      const serverNow = await databaseNow(tx);
      const parent = await lockOwnedChecklist(tx, id, auth.data.id);
      if (!parent) return actionResult.failure("not_found", "清单不存在");
      if (parent.revision !== revision) return actionResult.failure("conflict", "清单已被修改");
      const changed = await tx.checklist.update({
        where: { id },
        data: { deletedAt: serverNow, revision: { increment: 1 } },
      });
      return actionResult.success({
        id,
        deletedAt: changed.deletedAt!.toISOString(),
        revision: changed.revision,
        serverNow: serverNow.toISOString(),
        undoVisibleUntil: new Date(serverNow.getTime() + UNDO_MS).toISOString(),
      });
    });
  } catch (error) {
    logger.error(
      safeErrorContext("softDeleteChecklist", error, { userId: auth.data.id, resourceId: id })
    );
    return actionResult.failure("temporary_failure", "暂时无法删除清单");
  }
}

export async function softDeleteChecklists(entries: Array<{ id: string; revision: number }>) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  const unique = [...new Map(entries?.map((entry) => [entry.id, entry])).values()];
  if (
    !unique.length ||
    unique.length > 100 ||
    unique.some(
      (entry) => !isUuid(entry.id) || !Number.isInteger(entry.revision) || entry.revision < 1
    )
  ) {
    return actionResult.failure("invalid_input", "批量删除内容无效");
  }
  try {
    return await db.$transaction(async (tx) => {
      const changed: Array<{ id: string; revision: number }> = [];
      const deletedAt = await databaseNow(tx);
      const ordered = unique.sort((a, b) => a.id.localeCompare(b.id));
      for (const entry of ordered) {
        const parent = await lockOwnedChecklist(tx, entry.id, auth.data.id);
        if (!parent) return actionResult.failure("not_found", `清单 ${entry.id} 不存在`);
        if (parent.revision !== entry.revision) {
          return actionResult.failure("conflict", `清单 ${entry.id} 已被修改`);
        }
      }
      for (const entry of ordered) {
        const row = await tx.checklist.update({
          where: { id: entry.id },
          data: { deletedAt, revision: { increment: 1 } },
        });
        changed.push({ id: row.id, revision: row.revision });
      }
      return actionResult.success({
        deletedAt: deletedAt.toISOString(),
        items: changed,
        serverNow: deletedAt.toISOString(),
        undoVisibleUntil: new Date(deletedAt.getTime() + UNDO_MS).toISOString(),
      });
    });
  } catch (error) {
    logger.error(safeErrorContext("softDeleteChecklists", error, { userId: auth.data.id }));
    return actionResult.failure("temporary_failure", "暂时无法批量删除清单");
  }
}

export async function softDeleteChecklistItem(input: {
  checklistId: string;
  itemId: string;
  itemRevision: number;
  parentRevision: number;
}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  if (
    !isUuid(input?.checklistId) ||
    !isUuid(input?.itemId) ||
    !Number.isInteger(input.itemRevision) ||
    input.itemRevision < 1 ||
    !Number.isInteger(input.parentRevision) ||
    input.parentRevision < 1
  )
    return actionResult.failure("invalid_input", "清单项目无效");
  try {
    return await db.$transaction(async (tx) => {
      const serverNow = await databaseNow(tx);
      const parent = await lockOwnedChecklist(tx, input.checklistId, auth.data.id);
      if (!parent) return actionResult.failure("not_found", "清单不存在");
      if (parent.revision !== input.parentRevision)
        return actionResult.failure("conflict", "清单已被修改");
      const items = await tx.checklistItem.findMany({
        where: { checklistId: input.checklistId, deletedAt: null },
      });
      if (items.length <= 1) return actionResult.failure("conflict", "清单必须保留至少一个项目");
      const item = items.find((candidate) => candidate.id === input.itemId);
      if (!item) return actionResult.failure("not_found", "清单项目不存在");
      if (item.revision !== input.itemRevision)
        return actionResult.failure("conflict", "清单项目已被修改");
      const deletedAt = serverNow;
      const changed = await tx.checklistItem.update({
        where: { id: item.id },
        data: { deletedAt, revision: { increment: 1 } },
      });
      const changedParent = await tx.checklist.update({
        where: { id: parent.id },
        data: { revision: { increment: 1 } },
      });
      return actionResult.success({
        id: changed.id,
        deletedAt: deletedAt.toISOString(),
        itemRevision: changed.revision,
        parentRevision: changedParent.revision,
        serverNow: serverNow.toISOString(),
        undoVisibleUntil: new Date(serverNow.getTime() + UNDO_MS).toISOString(),
      });
    });
  } catch (error) {
    logger.error(
      safeErrorContext("softDeleteChecklistItem", error, {
        userId: auth.data.id,
        resourceId: input.itemId,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法删除清单项目");
  }
}

export async function softDeleteChecklistItems(input: {
  checklistId: string;
  items: Array<{ itemId: string; itemRevision: number }>;
  parentRevision: number;
}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  const items = [...new Map(input.items?.map((item) => [item.itemId, item])).values()];
  if (
    !isUuid(input?.checklistId) ||
    !Number.isInteger(input?.parentRevision) ||
    !items.length ||
    items.length > 100 ||
    items.some(
      (item) =>
        !isUuid(item.itemId) || !Number.isInteger(item.itemRevision) || item.itemRevision < 1
    )
  ) {
    return actionResult.failure("invalid_input", "批量删除项目无效");
  }
  try {
    return await db.$transaction(async (tx) => {
      const serverNow = await databaseNow(tx);
      const parent = await lockOwnedChecklist(tx, input.checklistId, auth.data.id);
      if (!parent) return actionResult.failure("not_found", "清单不存在");
      if (parent.revision !== input.parentRevision)
        return actionResult.failure("conflict", "清单已被修改");
      const active = await tx.checklistItem.findMany({
        where: { checklistId: input.checklistId, deletedAt: null },
      });
      if (active.length - items.length < 1) {
        return actionResult.failure("conflict", "清单必须保留至少一个项目");
      }
      const revisions = new Map(items.map((item) => [item.itemId, item.itemRevision]));
      const targets = active.filter((item) => revisions.has(item.id));
      if (targets.length !== items.length)
        return actionResult.failure("not_found", "部分清单项目不存在");
      if (targets.some((item) => item.revision !== revisions.get(item.id))) {
        return actionResult.failure("conflict", "部分清单项目已被修改");
      }
      const deletedAt = serverNow;
      await tx.checklistItem.updateMany({
        where: { id: { in: targets.map((item) => item.id) } },
        data: { deletedAt, revision: { increment: 1 } },
      });
      const changedParent = await tx.checklist.update({
        where: { id: parent.id },
        data: { revision: { increment: 1 } },
      });
      return actionResult.success({
        items: targets.map((item) => ({ itemId: item.id, itemRevision: item.revision + 1 })),
        deletedAt: deletedAt.toISOString(),
        parentRevision: changedParent.revision,
        serverNow: serverNow.toISOString(),
        undoVisibleUntil: new Date(serverNow.getTime() + UNDO_MS).toISOString(),
      });
    });
  } catch (error) {
    logger.error(
      safeErrorContext("softDeleteChecklistItems", error, {
        userId: auth.data.id,
        resourceId: input.checklistId,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法批量删除清单项目");
  }
}

export async function getChecklistTrash(input: { q?: string; cursor?: string } = {}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  const query = normalizeText(input.q ?? "", 100, true);
  if (query === null) return actionResult.failure("invalid_input", "搜索内容无效");
  const cursor = input.cursor ? readChecklistCursor(input.cursor) : null;
  if (
    input.cursor &&
    (!cursor || cursor.kind !== "trash" || cursor.ownerId !== auth.data.id || cursor.q !== query)
  ) {
    return actionResult.failure("invalid_input", "分页位置已失效，请重新加载");
  }
  let serverNow: Date;
  try {
    serverNow = await databaseNow();
  } catch (error) {
    logger.error(safeErrorContext("getChecklistTrashClock", error, { userId: auth.data.id }));
    return actionResult.failure("temporary_failure", "暂时无法读取回收站");
  }
  const asOf = cursor ? new Date(cursor.asOf) : serverNow;
  const searchText = escapeLike(query);
  const cutoff = new Date(asOf.getTime() - RESTORE_MS);
  try {
    const rows = await db.checklist.findMany({
      where: {
        userId: auth.data.id,
        deletedAt: { gt: cutoff },
        ...(cursor
          ? {
              OR: [
                { deletedAt: { lt: new Date(cursor.orderAt) } },
                { deletedAt: new Date(cursor.orderAt), id: { gt: cursor.id } },
              ],
            }
          : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: searchText, mode: "insensitive" } },
                {
                  items: {
                    some: {
                      deletedAt: null,
                      detail: { contains: searchText, mode: "insensitive" },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
      take: PAGE_SIZE + 1,
    });
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return actionResult.success({
      items: page.map<ChecklistTrashItem>((row) => ({
        id: row.id,
        name: row.name,
        deletedAt: row.deletedAt!.toISOString(),
        recoverableUntil: new Date(row.deletedAt!.getTime() + RESTORE_MS).toISOString(),
        revision: row.revision,
      })),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? signChecklistCursor({
              kind: "trash",
              ownerId: auth.data.id,
              asOf: asOf.toISOString(),
              expiry: "expired",
              confirmation: "all",
              q: query,
              orderAt: last.deletedAt!.toISOString(),
              id: last.id,
            })
          : null,
      serverNow: serverNow.toISOString(),
    });
  } catch (error) {
    logger.error(safeErrorContext("getChecklistTrash", error, { userId: auth.data.id }));
    return actionResult.failure("temporary_failure", "暂时无法读取回收站");
  }
}

export async function getChecklistItemTrash(checklistId: string, input: { cursor?: string } = {}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  if (!isUuid(checklistId)) return actionResult.failure("invalid_input", "回收站筛选无效");
  const cursor = input.cursor ? readChecklistCursor(input.cursor) : null;
  if (
    input.cursor &&
    (!cursor ||
      cursor.kind !== "item-trash" ||
      cursor.ownerId !== auth.data.id ||
      cursor.parentId !== checklistId ||
      cursor.q !== "")
  ) {
    return actionResult.failure("invalid_input", "分页位置已失效，请重新加载");
  }
  let serverNow: Date;
  try {
    serverNow = await databaseNow();
  } catch (error) {
    logger.error(
      safeErrorContext("getChecklistItemTrashClock", error, {
        userId: auth.data.id,
        resourceId: checklistId,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法读取已删除项目");
  }
  const asOf = cursor ? new Date(cursor.asOf) : serverNow;
  const cutoff = new Date(asOf.getTime() - RESTORE_MS);
  try {
    const parent = await db.checklist.findFirst({
      where: { id: checklistId, userId: auth.data.id, deletedAt: null },
    });
    if (!parent) return actionResult.failure("not_found", "清单不存在");
    const rows = await db.checklistItem.findMany({
      where: {
        checklistId,
        deletedAt: { gt: cutoff },
        ...(cursor
          ? {
              OR: [
                { deletedAt: { lt: new Date(cursor.orderAt) } },
                { deletedAt: new Date(cursor.orderAt), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
      take: PAGE_SIZE + 1,
    });
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return actionResult.success({
      items: page.map<ChecklistItemTrashItem>((row) => ({
        id: row.id,
        checklistId,
        detail: row.detail,
        deletedAt: row.deletedAt!.toISOString(),
        recoverableUntil: new Date(row.deletedAt!.getTime() + RESTORE_MS).toISOString(),
        revision: row.revision,
        parentRevision: parent.revision,
      })),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? signChecklistCursor({
              kind: "item-trash",
              parentId: checklistId,
              ownerId: auth.data.id,
              asOf: asOf.toISOString(),
              expiry: "expired",
              confirmation: "all",
              q: "",
              orderAt: last.deletedAt!.toISOString(),
              id: last.id,
            })
          : null,
      serverNow: serverNow.toISOString(),
    });
  } catch (error) {
    logger.error(
      safeErrorContext("getChecklistItemTrash", error, {
        userId: auth.data.id,
        resourceId: checklistId,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法读取已删除项目");
  }
}

export async function restoreChecklist(id: string, revision: number) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  if (!isUuid(id) || !Number.isInteger(revision) || revision < 1)
    return actionResult.failure("invalid_input", "清单无效");
  try {
    return await db.$transaction(async (tx) => {
      const serverNow = await databaseNow(tx);
      const parent = await lockOwnedDeletedChecklist(tx, id, auth.data.id);
      if (!parent) return actionResult.failure("not_found", "清单不存在");
      if (
        parent.revision !== revision ||
        !parent.deletedAt ||
        parent.deletedAt <= new Date(serverNow.getTime() - RESTORE_MS)
      ) {
        return actionResult.failure("conflict", "清单已无法恢复或版本已变化");
      }
      const changed = await tx.checklist.update({
        where: { id },
        data: { deletedAt: null, revision: { increment: 1 } },
      });
      return actionResult.success({
        id,
        revision: changed.revision,
        serverNow: serverNow.toISOString(),
      });
    });
  } catch (error) {
    logger.error(
      safeErrorContext("restoreChecklist", error, { userId: auth.data.id, resourceId: id })
    );
    return actionResult.failure("temporary_failure", "暂时无法恢复清单");
  }
}

export async function restoreChecklists(entries: Array<{ id: string; revision: number }>) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  const unique = [...new Map(entries?.map((entry) => [entry.id, entry])).values()];
  if (
    !unique.length ||
    unique.length > 100 ||
    unique.some(
      (entry) => !isUuid(entry.id) || !Number.isInteger(entry.revision) || entry.revision < 1
    )
  ) {
    return actionResult.failure("invalid_input", "批量恢复内容无效");
  }
  try {
    return await db.$transaction(async (tx) => {
      const restored: Array<{ id: string; revision: number }> = [];
      const serverNow = await databaseNow(tx);
      const cutoff = new Date(serverNow.getTime() - RESTORE_MS);
      const ordered = unique.sort((a, b) => a.id.localeCompare(b.id));
      for (const entry of ordered) {
        const parent = await lockOwnedDeletedChecklist(tx, entry.id, auth.data.id);
        if (!parent) return actionResult.failure("not_found", `清单 ${entry.id} 不存在`);
        if (parent.revision !== entry.revision || !parent.deletedAt || parent.deletedAt <= cutoff) {
          return actionResult.failure("conflict", `清单 ${entry.id} 已无法恢复或版本已变化`);
        }
      }
      for (const entry of ordered) {
        const changed = await tx.checklist.update({
          where: { id: entry.id },
          data: { deletedAt: null, revision: { increment: 1 } },
        });
        restored.push({ id: changed.id, revision: changed.revision });
      }
      return actionResult.success({ items: restored, serverNow: serverNow.toISOString() });
    });
  } catch (error) {
    logger.error(safeErrorContext("restoreChecklists", error, { userId: auth.data.id }));
    return actionResult.failure("temporary_failure", "暂时无法批量恢复清单");
  }
}

export async function restoreChecklistItem(input: {
  checklistId: string;
  itemId: string;
  itemRevision: number;
  parentRevision: number;
}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  if (
    !isUuid(input?.checklistId) ||
    !isUuid(input?.itemId) ||
    !Number.isInteger(input.itemRevision) ||
    input.itemRevision < 1 ||
    !Number.isInteger(input.parentRevision) ||
    input.parentRevision < 1
  )
    return actionResult.failure("invalid_input", "恢复项目无效");
  try {
    return await db.$transaction(async (tx) => {
      const serverNow = await databaseNow(tx);
      const parent = await lockOwnedChecklist(tx, input.checklistId, auth.data.id);
      if (!parent) return actionResult.failure("not_found", "清单不存在");
      if (parent.revision !== input.parentRevision)
        return actionResult.failure("conflict", "清单已被修改");
      const activeCount = await tx.checklistItem.count({
        where: { checklistId: input.checklistId, deletedAt: null },
      });
      if (activeCount >= 200) return actionResult.failure("conflict", "清单已达到 200 个项目上限");
      const item = await tx.checklistItem.findFirst({
        where: {
          id: input.itemId,
          checklistId: input.checklistId,
          revision: input.itemRevision,
          deletedAt: { gt: new Date(serverNow.getTime() - RESTORE_MS) },
        },
      });
      if (!item) return actionResult.failure("conflict", "项目已无法恢复或版本已变化");
      const changed = await tx.checklistItem.update({
        where: { id: item.id },
        data: { deletedAt: null, revision: { increment: 1 } },
      });
      const changedParent = await tx.checklist.update({
        where: { id: parent.id },
        data: { revision: { increment: 1 } },
      });
      return actionResult.success({
        itemId: changed.id,
        itemRevision: changed.revision,
        parentRevision: changedParent.revision,
        serverNow: serverNow.toISOString(),
      });
    });
  } catch (error) {
    logger.error(
      safeErrorContext("restoreChecklistItem", error, {
        userId: auth.data.id,
        resourceId: input.itemId,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法恢复清单项目");
  }
}

export async function restoreChecklistItems(input: {
  checklistId: string;
  items: Array<{ itemId: string; itemRevision: number }>;
  parentRevision: number;
}) {
  const auth = await requireAuth();
  if (auth.status !== "success") return auth;
  const items = [...new Map(input.items?.map((item) => [item.itemId, item])).values()];
  if (
    !isUuid(input?.checklistId) ||
    !Number.isInteger(input?.parentRevision) ||
    input.parentRevision < 1 ||
    !items.length ||
    items.length > 100 ||
    items.some(
      (item) =>
        !isUuid(item.itemId) || !Number.isInteger(item.itemRevision) || item.itemRevision < 1
    )
  ) {
    return actionResult.failure("invalid_input", "恢复项目无效");
  }
  try {
    return await db.$transaction(async (tx) => {
      const serverNow = await databaseNow(tx);
      const parent = await lockOwnedChecklist(tx, input.checklistId, auth.data.id);
      if (!parent) return actionResult.failure("not_found", "清单不存在");
      if (parent.revision !== input.parentRevision)
        return actionResult.failure("conflict", "清单已被修改");
      const active = await tx.checklistItem.findMany({
        where: { checklistId: input.checklistId, deletedAt: null },
      });
      if (active.length + items.length > 200)
        return actionResult.failure("conflict", "恢复后会超过 200 个项目");
      const targets = await tx.checklistItem.findMany({
        where: {
          checklistId: input.checklistId,
          id: { in: items.map((item) => item.itemId) },
          deletedAt: { gt: new Date(serverNow.getTime() - RESTORE_MS) },
        },
      });
      if (targets.length !== items.length)
        return actionResult.failure("conflict", "部分项目已无法恢复");
      const revisions = new Map(items.map((item) => [item.itemId, item.itemRevision]));
      if (targets.some((item) => item.revision !== revisions.get(item.id))) {
        return actionResult.failure("conflict", "部分项目版本已变化");
      }
      await tx.checklistItem.updateMany({
        where: { id: { in: targets.map((item) => item.id) } },
        data: { deletedAt: null, revision: { increment: 1 } },
      });
      const changedParent = await tx.checklist.update({
        where: { id: parent.id },
        data: { revision: { increment: 1 } },
      });
      return actionResult.success({
        items: targets.map((item) => ({ itemId: item.id, itemRevision: item.revision + 1 })),
        itemIds: targets.map((item) => item.id),
        parentRevision: changedParent.revision,
        serverNow: serverNow.toISOString(),
      });
    });
  } catch (error) {
    logger.error(
      safeErrorContext("restoreChecklistItems", error, {
        userId: auth.data.id,
        resourceId: input.checklistId,
      })
    );
    return actionResult.failure("temporary_failure", "暂时无法恢复清单项目");
  }
}

export async function purgeExpiredChecklistTrash(limit = 500) {
  const batch = Math.min(500, Math.max(1, limit));
  return db.$transaction(async (tx) => {
    const itemLimit = Math.max(1, batch - 201);
    const itemRows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`WITH locked_items AS (
          SELECT item."id" FROM "ChecklistItem" item
          JOIN "Checklist" parent ON parent."id" = item."checklistId"
          WHERE item."deletedAt" <= clock_timestamp() - interval '30 days'
            AND parent."deletedAt" IS NULL
          ORDER BY item."deletedAt", item."id"
          FOR UPDATE OF item SKIP LOCKED LIMIT ${itemLimit}
        )
        DELETE FROM "ChecklistItem" WHERE "id" IN (SELECT "id" FROM locked_items)
        RETURNING "id"`
    );
    let deleted = itemRows.length;
    if (deleted < batch) {
      const parents = await tx.$queryRaw<Array<{ id: string; childCount: bigint }>>(
        Prisma.sql`SELECT parent."id", count(child."id") AS "childCount"
          FROM "Checklist" parent
          LEFT JOIN "ChecklistItem" child ON child."checklistId" = parent."id"
          WHERE parent."id" = (
            SELECT "id" FROM "Checklist"
            WHERE "deletedAt" <= clock_timestamp() - interval '30 days'
            ORDER BY "deletedAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1
          )
          GROUP BY parent."id"`
      );
      const parent = parents[0];
      if (parent && Number(parent.childCount) + 1 <= batch - deleted) {
        await tx.checklist.delete({ where: { id: parent.id } });
        deleted += Number(parent.childCount) + 1;
      }
    }
    const pending = await tx.$queryRaw<Array<{ pending: boolean }>>(
      Prisma.sql`SELECT EXISTS (
        SELECT 1 FROM "Checklist" WHERE "deletedAt" <= clock_timestamp() - interval '30 days'
        UNION ALL
        SELECT 1 FROM "ChecklistItem" item JOIN "Checklist" parent ON parent."id" = item."checklistId"
        WHERE item."deletedAt" <= clock_timestamp() - interval '30 days' AND parent."deletedAt" IS NULL
      ) AS pending`
    );
    return { deleted, hasMore: pending[0]?.pending ?? false };
  });
}
