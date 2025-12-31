import { NextResponse } from "next/server";

export type ActionResponse<T = unknown> = {
  error: boolean;
  message: string;
  data: T | null;
};

export const actionResponse = {
  error: (
    message: string,
    status = 500
  ): NextResponse<ActionResponse<null>> => {
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
    status = 200
  ): NextResponse<ActionResponse<T>> => {
    return NextResponse.json(
      {
        error: false,
        message: "",
        data: data ?? null,
      },
      { status }
    );
  },
};
