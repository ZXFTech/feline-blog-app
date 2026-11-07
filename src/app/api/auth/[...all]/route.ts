import { getSdkIntegration } from "@/lib/auth/sdk/server";
import { actionResponse } from "@/lib/response/ApiResponse";
export const runtime = "nodejs";
async function handle(request: Request, method: "GET" | "POST") {
  try {
    return await getSdkIntegration().handlers[method](request);
  } catch (error) {
    const response = actionResponse.error("认证暂时不可用，请稍后重试", 503);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set(
      "X-Auth-Code",
      error && typeof error === "object" && "code" in error && error.code === "ENVIRONMENT_MISMATCH"
        ? "ENVIRONMENT_MISMATCH"
        : "AUTH_UNAVAILABLE"
    );
    return response;
  }
}
export function GET(request: Request) {
  return handle(request, "GET");
}
export function POST(request: Request) {
  return handle(request, "POST");
}
