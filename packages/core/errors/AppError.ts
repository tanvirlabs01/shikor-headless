export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,

  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  PAYMENT_REQUIRED = 402,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  NOT_ACCEPTABLE = 406,
  CONFLICT = 409,
  GONE = 410,
  UNSUPPORTED_MEDIA_TYPE = 415,
  UNPROCESSABLE_ENTITY = 422,

  TOO_MANY_REQUESTS = 429,

  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

export enum ErrorType {
  // Client-side
  VALIDATION_FAILED = "VALIDATION_FAILED",
  BAD_REQUEST = "BAD_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  UNSUPPORTED_MEDIA = "UNSUPPORTED_MEDIA_TYPE",
  TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",

  // Server-side
  SERVER_ERROR = "SERVER_ERROR",
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  GATEWAY_TIMEOUT = "GATEWAY_TIMEOUT",
  DATABASE = "DATABASE_ERROR",
  UNKNOWN = "UNKNOWN",

  // Specific domains
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  VALIDATION = "VALIDATION",
  RATE_LIMIT = "RATE_LIMIT",
  INTEGRATION = "INTEGRATION_ERROR",
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
  static badRequest(
    message = "Bad Request",
    details?: Record<string, unknown>
  ) {
    return new AppError(
      message,
      HttpStatus.BAD_REQUEST,
      ErrorType.BAD_REQUEST,
      { details }
    );
  }

  static validationError(
    message = "Validation Failed",
    details?: Record<string, unknown>
  ) {
    return new AppError(
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
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

  static unsupportedMedia(message = "Unsupported media type") {
    return new AppError(
      message,
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      ErrorType.UNSUPPORTED_MEDIA
    );
  }

  static tooManyRequests(message = "Too many requests") {
    return new AppError(
      message,
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorType.TOO_MANY_REQUESTS
    );
  }

  static notImplemented(message = "Not implemented") {
    return new AppError(
      message,
      HttpStatus.NOT_IMPLEMENTED,
      ErrorType.NOT_IMPLEMENTED
    );
  }

  static serviceUnavailable(message = "Service temporarily unavailable") {
    return new AppError(
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorType.SERVICE_UNAVAILABLE
    );
  }

  static gatewayTimeout(message = "Gateway Timeout") {
    return new AppError(
      message,
      HttpStatus.GATEWAY_TIMEOUT,
      ErrorType.GATEWAY_TIMEOUT
    );
  }

  static databaseError(
    message = "Database Error",
    details?: Record<string, unknown>
  ) {
    return new AppError(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorType.DATABASE,
      { details }
    );
  }

  static integrationError(
    message = "Third-party integration failed",
    details?: Record<string, unknown>
  ) {
    return new AppError(
      message,
      HttpStatus.BAD_GATEWAY,
      ErrorType.INTEGRATION,
      { details }
    );
  }

  static internal(message = "Internal Server Error", cause?: unknown) {
    return new AppError(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorType.SERVER_ERROR,
      { cause }
    );
  }

  static unknown(message = "Unknown Error", cause?: unknown) {
    return new AppError(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorType.UNKNOWN,
      { cause }
    );
  }
}
