import { verifyToken } from '../jwt';
import { checkUser } from '@/db/userAction';
import logger from '../logger/Logger';
import { getCookieData } from '../cookieStore';
import { Role } from '../../../generated/prisma/enums';
import { unstable_rethrow } from 'next/navigation';
import { actionResult, type ActionResult } from '@/lib/server/actionResult';
import { safeErrorContext } from '@/lib/server/error';

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof checkUser>>>;

export async function resolveCurrentUser(): Promise<ActionResult<CurrentUser>> {
  try {
    const cookieToken = await getCookieData('token');
    const token = cookieToken?.value;
    if (!token) {
      return actionResult.failure('unauthenticated', '请重新登录');
    }
    const decoded = verifyToken(token);
    if (!decoded) return actionResult.failure('unauthenticated', '请重新登录');
    const user = await checkUser('id', decoded.userId);
    return user
      ? actionResult.success(user)
      : actionResult.failure('unauthenticated', '请重新登录');
  } catch (error) {
    logger.error(safeErrorContext('resolveCurrentUser', error));
    return actionResult.failure('temporary_failure', '暂时无法验证登录状态，请稍后重试');
  }
}

export async function getCurrentUser() {
  try {
    const cookieToken = await getCookieData('token');
    const token = cookieToken?.value;

    if (!token) {
      return null;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return null;
    }

    const user = await checkUser('id', decoded.userId);

    return user;
  } catch (error) {
    unstable_rethrow(error);
    logger.error(safeErrorContext('getCurrentUser', error));
    return null;
  }
}

export async function requireAuth() {
  return resolveCurrentUser();
}

export async function hasTodoRoles() {
  const todoRoles: Role[] = [Role.ROOT];
  const result = await requireAuth();
  if (result.status !== 'success') return result;
  return todoRoles.includes(result.data.role)
    ? result
    : actionResult.failure('forbidden', '无 Todo 权限');
}

export async function hasBlogRoles() {
  const blogRoles: Role[] = [Role.ROOT];
  const result = await requireAuth();
  if (result.status !== 'success') return result;
  return blogRoles.includes(result.data.role)
    ? result
    : actionResult.failure('forbidden', '无 Blog 权限');
}

export async function hasRootRole() {
  const result = await requireAuth();
  if (result.status !== 'success') return result;
  return result.data.role === Role.ROOT ? result : actionResult.failure('forbidden', '没有权限');
}
