import { getSdkIntegration } from "@/lib/auth/sdk/server";
import { assertProfileAllowed, readInstallation, SdkHostError } from "@/lib/auth/sdk/business";
import { actionResponse } from "@/lib/response/ApiResponse";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const principal = await getSdkIntegration().getPrincipal(request.headers);
    if (principal.status === "anonymous") return actionResponse.error("请使用用户中心登录", 401);
    const installation = await readInstallation();
    assertProfileAllowed(installation, principal.identity);
    if (principal.status === "mapping-required") {
      const response = actionResponse.error("请完成博客资料", 403);
      response.headers.set("X-Auth-Next", "/auth/setup");
      return response;
    }
    const response = actionResponse.success({
      user: principal.user,
      installation: { phase: installation.phase },
      authenticationEmail: principal.identity.profile.email,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof SdkHostError && error.code === "INITIALIZATION_PENDING")
      return actionResponse.error("初始化尚未完成，请稍后再试", 403);
    return actionResponse.error("暂时无法验证登录状态，请稍后重试", 503);
  }
}
