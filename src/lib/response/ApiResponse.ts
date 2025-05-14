import { error } from "console";
import { message } from "../message";

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

export const actionResponse = {
  error: (message: string) => {
    return {
      error: true,
      message,
      data: null,
    };
  },

  success: (data?: any) => {
    return {
      error: false,
      message: "",
      data,
    };
  },
};
