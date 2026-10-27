import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { Role } from "../../../generated/prisma-postgres/enums";
import { actionResult, type ActionResult } from "@/lib/server/actionResult";
import { resolveIdentity } from "./center/session";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof resolveIdentity>>>;
export async function resolveCurrentUser(): Promise<ActionResult<CurrentUser>> {
  try {
    const store = await cookies();
    const user = await resolveIdentity(name => store.get(name)?.value);
    return user ? actionResult.success(user) : actionResult.failure("unauthenticated", "请重新登录");
  } catch (error) {
    unstable_rethrow(error);
    return actionResult.failure("temporary_failure", "暂时无法验证登录状态，请稍后重试");
  }
}
export async function getCurrentUser() {
  const result = await resolveCurrentUser();
  return result.status === "success" ? result.data : null;
}
export const requireAuth = resolveCurrentUser;
export async function hasTodoRoles() {
  const result = await requireAuth();
  if (result.status !== "success") return result;
  return result.data.role === Role.ROOT ? result : actionResult.failure("forbidden", "无 Todo 权限");
}
export async function hasBlogRoles() {
  const result = await requireAuth();
  if (result.status !== "success") return result;
  return result.data.role === Role.ROOT ? result : actionResult.failure("forbidden", "无 Blog 权限");
}
export async function hasRootRole() {
  const result = await requireAuth();
  if (result.status !== "success") return result;
  return result.data.role === Role.ROOT ? result : actionResult.failure("forbidden", "没有权限");
}
