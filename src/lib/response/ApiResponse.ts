import { NextResponse } from 'next/server';
import type { ActionFailure } from '@/lib/server/actionResult';

export type ActionResponse<T = unknown> = {
  error: boolean;
  message: string;
  data: T | null;
};

export const actionResponse = {
  error: (message = '服务器内部错误', status = 500): NextResponse<ActionResponse<null>> => {
    return NextResponse.json(
      {
        error: true,
        message,
        data: null,
      },
      { status }
    );
  },

  success: <T = unknown>(
    data?: T,
    message = 'success',
    status = 200
  ): NextResponse<ActionResponse<T>> => {
    return NextResponse.json(
      {
        error: false,
        message,
        data: data ?? null,
      },
      { status }
    );
  },
  fromFailure: (failure: ActionFailure) => {
    const status = {
      invalid_input: 400,
      unauthenticated: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
      temporary_failure: 503,
    }[failure.status];
    return NextResponse.json<ActionResponse<null>>(
      { error: true, message: failure.message, data: null },
      { status }
    );
  },
};
