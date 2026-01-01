import { actionResponse } from "@/lib/response/ApiResponse";

export async function POST() {
  const response = actionResponse.success(null, "登出成功");
  response.cookies.delete("token");

  return response;
}
