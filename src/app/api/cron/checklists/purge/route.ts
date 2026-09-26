import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { purgeExpiredChecklistTrash } from "@/db/checklistAction";
import { actionResponse } from "@/lib/response/ApiResponse";
import logger from "@/lib/logger/Logger";
import { safeErrorContext } from "@/lib/server/error";

export const maxDuration = 60;
const START_NEW_BATCH_DEADLINE_MS = 55_000;
const RETRY_DELAYS_MS = [50, 100] as const;

function authorized(request: NextRequest) {
  const configured = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;
  const left = Buffer.from(configured);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function retryableDatabaseError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  return [
    "P1001",
    "P1002",
    "P1008",
    "P1017",
    "P2034",
    "40001",
    "40P01",
    "ECONNRESET",
    "ETIMEDOUT",
    "EPIPE",
  ].includes(code);
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function GET(request: NextRequest) {
  if (!authorized(request)) return actionResponse.error("未授权", 401);
  const startedAt = Date.now();
  let deleted = 0;
  let batches = 0;
  try {
    while (Date.now() - startedAt < START_NEW_BATCH_DEADLINE_MS) {
      let result: Awaited<ReturnType<typeof purgeExpiredChecklistTrash>> | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          result = await purgeExpiredChecklistTrash(500);
          break;
        } catch (error) {
          if (attempt === 2 || !retryableDatabaseError(error)) throw error;
          await wait(RETRY_DELAYS_MS[attempt]);
        }
      }
      if (!result) break;
      deleted += result.deleted;
      batches += 1;
      if (!result.hasMore) break;
    }
    return actionResponse.success({ deleted, batches, durationMs: Date.now() - startedAt });
  } catch (error) {
    logger.error(safeErrorContext("checklistPurgeRoute", error));
    return actionResponse.error("清理暂时失败", 503);
  }
}
