// packages/core/errors/AppError.ts

export enum HttpStatus {
  OK = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
}

export enum ErrorType {
  VALIDATION_FAILED = "VALIDATION_FAILED",
  UNAUTHORIZED = "UNAUTHORIZED",
  UNKNOWN = "UNKNOWN",
  FORBIDDEN = "FORBIDDEN",
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  VALIDATION = "VALIDATION",
  DATABASE = "DATABASE_ERROR",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  BAD_REQUEST = "BAD_REQUEST",
  SERVER_ERROR = "SERVER_ERROR",
}

export class AppError extends Error {
  public readonly statusCode: HttpStatus;
  public readonly code: ErrorType;
  public readonly details?: Record<string, unknown>;
  public readonly cause?: unknown;

  constructor(
    message: string,
    statusCode: HttpStatus,
    code: ErrorType,
    options?: {
      details?: Record<string, unknown>;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
    this.cause = options?.cause;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  // 🧱 Factory helpers
  static validationError(message: string, details?: Record<string, unknown>) {
    return new AppError(
      message,
      HttpStatus.BAD_REQUEST,
      ErrorType.VALIDATION_FAILED,
      { details }
    );
  }

  static unauthorized(message = "Unauthorized") {
    return new AppError(
      message,
      HttpStatus.UNAUTHORIZED,
      ErrorType.UNAUTHORIZED
    );
  }
  static forbidden(message = "Forbidden") {
    return new AppError(message, HttpStatus.FORBIDDEN, ErrorType.FORBIDDEN);
  }

  static notFound(
    message = "Resource not found",
    details?: Record<string, unknown>
  ) {
    return new AppError(message, HttpStatus.NOT_FOUND, ErrorType.NOT_FOUND, {
      details,
    });
  }

  static conflict(message = "Conflict", details?: Record<string, unknown>) {
    return new AppError(message, HttpStatus.CONFLICT, ErrorType.CONFLICT, {
      details,
    });
  }

  static databaseError(
    message = "Database error",
    details?: Record<string, unknown>
  ) {
    return new AppError(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorType.DATABASE,
      {
        details,
      }
    );
  }

  static internal(message = "Internal server error", cause?: unknown) {
    return new AppError(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorType.UNKNOWN,
      { cause }
    );
  }
}
