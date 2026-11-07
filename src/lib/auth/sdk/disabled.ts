import { actionResponse } from "@/lib/response/ApiResponse";
export function disabledAuthRoute() {
  const response = actionResponse.error("此认证入口已停用，请使用用户中心登录", 404);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
