export class ApiResponse<T = unknown> {
  constructor(
    public success: boolean,
    public message: string,
    public data?: T,
    public meta?: Record<string, any>
  ) {}

  static ok<T>(data: T, message = "Success", meta?: Record<string, any>) {
    return new ApiResponse<T>(true, message, data, meta);
  }

  static created<T>(data: T, message = "Created") {
    return new ApiResponse<T>(true, message, data);
  }

  static error(message = "Something went wrong", meta?: Record<string, any>) {
    return new ApiResponse(false, message, undefined, meta);
  }

  static validationError(details: Record<string, string[]>) {
    return new ApiResponse(false, "Validation failed", undefined, {
      type: "VALIDATION_FAILED",
      fieldErrors: details,
    });
  }

  static unauthorized(message = "Unauthorized") {
    return new ApiResponse(false, message, undefined, {
      type: "UNAUTHORIZED",
    });
  }

  static notFound(message = "Resource not found") {
    return new ApiResponse(false, message, undefined, {
      type: "NOT_FOUND",
    });
  }

  static fromError(error: any) {
    if (error?.code === "VALIDATION_FAILED") {
      return ApiResponse.validationError(error.details?.fieldErrors || {});
    }

    return ApiResponse.error(error.message || "Unexpected error", {
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      type: error.code || "SERVER_ERROR",
    });
  }
}
