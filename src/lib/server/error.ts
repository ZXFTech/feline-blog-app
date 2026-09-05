import { Prisma } from '../../../generated/prisma/client';
import type { ActionFailure, ActionFailureStatus } from './actionResult';

export type SafeErrorContext = {
  operation: string;
  category: ActionFailureStatus | 'unexpected';
  userId?: string;
  resourceId?: string | number;
  errorClass?: string;
  errorCode?: string;
};

export function isKnownPrismaError(
  error: unknown,
  code?: string
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (code === undefined || error.code === code)
  );
}

export function safeErrorContext(
  operation: string,
  error: unknown,
  context: { userId?: string; resourceId?: string | number } = {}
): SafeErrorContext {
  const errorClass = error instanceof Error ? error.constructor.name : typeof error;
  const errorCode = isKnownPrismaError(error) ? error.code : undefined;
  const category: SafeErrorContext['category'] =
    errorCode === 'P2025'
      ? 'not_found'
      : errorCode === 'P2002'
        ? 'conflict'
        : errorCode === 'P2034'
          ? 'temporary_failure'
          : 'unexpected';
  return { operation, category, ...context, errorClass, ...(errorCode ? { errorCode } : {}) };
}

export function classifyDataError(error: unknown): ActionFailure | null {
  if (isKnownPrismaError(error, 'P2025')) {
    return { status: 'not_found', message: '记录不存在' };
  }
  if (isKnownPrismaError(error, 'P2002')) {
    return { status: 'conflict', message: '记录已存在' };
  }
  if (isKnownPrismaError(error, 'P2034')) {
    return { status: 'temporary_failure', message: '操作冲突，请稍后重试' };
  }
  return null;
}
