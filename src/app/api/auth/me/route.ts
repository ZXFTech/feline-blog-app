import { resolveCurrentUser } from '@/lib/auth/userAuth';
import logger from '@/lib/logger/Logger';
import { actionResponse } from '@/lib/response/ApiResponse';
import { safeErrorContext } from '@/lib/server/error';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    void request;
    const result = await resolveCurrentUser();
    if (result.status === 'unauthenticated') return actionResponse.success(null, '');
    if (result.status !== 'success') return actionResponse.fromFailure(result);
    const { id, email, username, role, avatar, createdAt } = result.data;
    return actionResponse.success({ user: { id, email, username, role, avatar, createdAt } });
  } catch (error) {
    logger.error(safeErrorContext('authMe', error));
    return actionResponse.error();
  }
}
