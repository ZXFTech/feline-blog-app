import { resolveCurrentUser } from "@/lib/auth/userAuth";
import logger from "@/lib/logger/Logger";
import { actionResponse } from "@/lib/response/ApiResponse";
import { safeErrorContext } from "@/lib/server/error";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    void request;
    const result = await resolveCurrentUser();
    if (result.status === "unauthenticated") return actionResponse.error("请重新登录", 401);
    if (result.status !== "success") return actionResponse.fromFailure(result);
    const { id, email, username, role, avatar, createdAt } = result.data;
    const center = "centerEmail" in result.data ? { centerEmail: result.data.centerEmail, centerEmailVerifiedAt: result.data.centerEmailVerifiedAt } : {};
    const response = actionResponse.success({ user: { id, email, username, role, avatar, createdAt, authMode: result.data.authMode, ...center } });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    logger.error(safeErrorContext("authMe", error));
    return actionResponse.error("暂时无法验证登录状态，请稍后重试", 503);
  }
}
