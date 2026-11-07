import { getSdkConfiguration } from "@/lib/auth/sdk/config";
import { getSdkIntegration } from "@/lib/auth/sdk/server";
import { SdkHostError } from "@/lib/auth/sdk/business";
import { parseProfileInput } from "@/lib/auth/sdk/profile-input";
import { consumeProfileRate, saveProfile, trustedProfileIp } from "@/lib/auth/sdk/profile";
import { actionResponse } from "@/lib/response/ApiResponse";
export const runtime = "nodejs";
function fail(message: string, status: number, code: string) {
  const response = actionResponse.error(message, status);
  response.headers.set("X-Auth-Code", code);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
async function readInput(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) {
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
export async function POST(request: Request) {
  try {
    const config = getSdkConfiguration();
    if (
      request.headers.get("origin") !== config.manifest.platformOrigin ||
      (request.headers.has("sec-fetch-site") &&
        request.headers.get("sec-fetch-site") !== "same-origin")
    )
      return fail("请求来源无效", 403, "ORIGIN_REJECTED");
    if (
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return fail("请使用 JSON 提交", 415, "INVALID_PROFILE");
    const input = parseProfileInput(await readInput(request));
    if (!input) return fail("资料格式无效，请确认邮箱并填写昵称", 400, "INVALID_PROFILE");
    if (!(await consumeProfileRate(trustedProfileIp(request.headers), "profile-ip", 20))) {
      const response = fail("请求过于频繁", 429, "RATE_LIMITED");
      response.headers.set("Retry-After", "60");
      return response;
    }
    const identity = await getSdkIntegration().getIdentity(request.headers);
    if (!identity) return fail("请使用用户中心登录", 401, "ANONYMOUS");
    if (!(await consumeProfileRate(identity.authUserId, "profile-user", 5))) {
      const response = fail("请求过于频繁", 429, "RATE_LIMITED");
      response.headers.set("Retry-After", "60");
      return response;
    }
    const result = await saveProfile(identity, input);
    const response = actionResponse.success(result);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof SdkHostError) {
      if (error.code === "PROFILE_CONFLICT")
        return fail("邮箱或资料已变化，请刷新后重新确认", 409, error.code);
      if (error.code === "INITIALIZATION_PENDING" || error.code === "PROFILE_REQUIRED")
        return fail(
          error.code === "PROFILE_REQUIRED" ? "请先完成博客资料" : "初始化尚未完成，请稍后再试",
          403,
          error.code
        );
    }
    return fail("暂时无法保存资料，请稍后重试", 503, "AUTH_UNAVAILABLE");
  }
}
