import db from "@/db/client";
import { hasTodoRoles } from "@/lib/auth/userAuth";
import logger from "@/lib/logger/Logger";
import { actionResponse } from "@/lib/response/ApiResponse";
import { safeErrorContext } from "@/lib/server/error";
import type { NextRequest } from "next/server";

const PREFIX_PATTERN = /^e2e-staging-[1-9][0-9]*-[1-9][0-9]*-[0-9a-f]{7}$/;
const MAX_CLEANUP = 100;

async function authorizeSmokeAccount() {
  if (process.env.STAGING_SMOKE_API_ENABLED !== "true") {
    return actionResponse.error("Not found", 404);
  }
  const auth = await hasTodoRoles();
  if (auth.status !== "success") return actionResponse.fromFailure(auth);
  if (!process.env.E2E_USER_ID || auth.data.id !== process.env.E2E_USER_ID) {
    return actionResponse.error("Forbidden", 403);
  }
  return auth;
}

function parsePrefix(value: unknown): string | null {
  return typeof value === "string" && PREFIX_PATTERN.test(value) ? value : null;
}

function parseCleanupPrefix(value: unknown, mode: unknown): string | null {
  if (mode === "orphan" && value === "e2e-staging-") return value;
  return parsePrefix(value);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeSmokeAccount();
    if (auth instanceof Response) return auth;
    const prefix = parsePrefix(request.nextUrl.searchParams.get("prefix"));
    if (!prefix) return actionResponse.error("Invalid smoke prefix", 400);
    const records = await db.todo.findMany({
      where: { userId: auth.data.id, content: { startsWith: prefix } },
      orderBy: { createAt: "asc" },
      take: MAX_CLEANUP,
      select: { id: true, content: true, createAt: true, finished: true, delete: true },
    });
    return actionResponse.success({ records });
  } catch (error) {
    logger.error(safeErrorContext("stagingSmokeTodoList", error));
    return actionResponse.error();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorizeSmokeAccount();
    if (auth instanceof Response) return auth;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return actionResponse.error("Invalid cleanup", 400);
    const input = body as Record<string, unknown>;
    const mode = input.mode;
    const prefix = parseCleanupPrefix(input.prefix, mode);
    const ids = Array.isArray(input.ids)
      ? [...new Set(input.ids.filter((id): id is number => Number.isSafeInteger(id) && id > 0))]
      : [];
    if (!prefix || (mode !== "current" && mode !== "orphan") || ids.length > MAX_CLEANUP) {
      return actionResponse.error("Invalid cleanup", 400);
    }
    if (mode === "current" && ids.length === 0) {
      return actionResponse.success({ deletedIds: [] });
    }
    const retentionHours = Number(process.env.SMOKE_DATA_RETENTION_HOURS ?? "24");
    if (!Number.isFinite(retentionHours) || retentionHours < 24) {
      return actionResponse.error("Invalid retention policy", 503);
    }
    const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    const candidates = await db.todo.findMany({
      where: {
        userId: auth.data.id,
        content: { startsWith: prefix },
        ...(mode === "current" ? { id: { in: ids } } : { createAt: { lt: cutoff } }),
      },
      orderBy: { createAt: "asc" },
      take: MAX_CLEANUP,
      select: { id: true },
    });
    const candidateIds = candidates.map(({ id }) => id);
    if (mode === "current" && candidateIds.length !== ids.length) {
      return actionResponse.error("Cleanup target mismatch", 409);
    }
    if (candidateIds.length > 0) {
      await db.todo.updateMany({
        where: { id: { in: candidateIds }, userId: auth.data.id },
        data: { delete: true },
      });
    }
    return actionResponse.success({ deletedIds: candidateIds });
  } catch (error) {
    if (error instanceof SyntaxError) return actionResponse.error("Invalid cleanup", 400);
    logger.error(safeErrorContext("stagingSmokeTodoCleanup", error));
    return actionResponse.error();
  }
}
