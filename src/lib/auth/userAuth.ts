import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { Role } from "../../../generated/prisma-postgres/enums";
import { actionResult, type ActionResult } from "@/lib/server/actionResult";
import { getSdkIntegration } from "@/lib/auth/sdk/server";
import {
  assertBusinessReady,
  assertProfileStage,
  type SdkBusinessUser,
} from "@/lib/auth/sdk/business";

export type CurrentUser = SdkBusinessUser;
export async function resolveAccountUser(): Promise<ActionResult<CurrentUser>> {
  try {
    const principal = await getSdkIntegration().getPrincipal(new Headers(await headers()));
    if (principal.status === "anonymous")
      return actionResult.failure("unauthenticated", "请使用用户中心登录");
    if (principal.status === "mapping-required")
      return actionResult.failure("forbidden", "请完成博客资料");
    await assertProfileStage(principal.identity);
    return actionResult.success(principal.user);
  } catch (error) {
    unstable_rethrow(error);
    return actionResult.failure("temporary_failure", "暂时无法验证登录状态，请稍后重试");
  }
}
export async function resolveCurrentUser(): Promise<ActionResult<CurrentUser>> {
  const result = await resolveAccountUser();
  if (result.status !== "success") return result;
  try {
    await assertBusinessReady();
    return result;
  } catch {
    return actionResult.failure("temporary_failure", "业务正在维护，请稍后重试");
  }
}
export async function getCurrentUser() {
  const result = await resolveAccountUser();
  return result.status === "success" ? result.data : null;
}
export const requireAuth = resolveCurrentUser;
export async function hasTodoRoles() {
  const result = await requireAuth();
  if (result.status !== "success") return result;
  return result.data.role === Role.ROOT
    ? result
    : actionResult.failure("forbidden", "无 Todo 权限");
}
export async function hasBlogRoles() {
  const result = await requireAuth();
  if (result.status !== "success") return result;
  return result.data.role === Role.ROOT
    ? result
    : actionResult.failure("forbidden", "无 Blog 权限");
}
export async function hasRootRole() {
  const result = await requireAuth();
  if (result.status !== "success") return result;
  return result.data.role === Role.ROOT ? result : actionResult.failure("forbidden", "没有权限");
}
