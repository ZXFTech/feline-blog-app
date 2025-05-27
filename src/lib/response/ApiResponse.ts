export class ApiResponse<T> {
  constructor(
    public error: boolean,
    public data: T | null,
    public message?: string
  ) {}
  static success<T>(data: T, message?: string) {
    return new ApiResponse(false, data, message);
  }

  static error(message: string) {
    return new ApiResponse(true, null, message);
  }
}

export type ActionResponse<T = unknown> = {
  error: boolean;
  message: string;
  data: T | null;
};

export const actionResponse = {
  error: (message: string): ActionResponse<null> => {
    return {
      error: true,
      message,
      data: null,
    };
  },

  success: <T = unknown>(data?: T): ActionResponse<T> => {
    return {
      error: false,
      message: "",
      data: data ?? null,
    };
  },
};
