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
