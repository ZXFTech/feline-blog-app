import { NextRequest } from "next/server";
import { getChecklists } from "@/db/checklistAction";
import { actionResponse } from "@/lib/response/ApiResponse";
import logger from "@/lib/logger/Logger";
import { safeErrorContext } from "@/lib/server/error";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const result = await getChecklists({
      expiry: params.get("expiry") as "active" | "expired" | undefined,
      confirmation: params.get("confirmation") as
        | "all"
        | "confirmed"
        | "partial"
        | "unconfirmed"
        | undefined,
      q: params.get("q") ?? undefined,
      cursor: params.get("cursor") ?? undefined,
    });
    return result.status === "success"
      ? actionResponse.success(result.data)
      : actionResponse.fromFailure(result);
  } catch (error) {
    logger.error(safeErrorContext("checklistsRoute", error));
    return actionResponse.error("暂时无法读取清单");
  }
}
