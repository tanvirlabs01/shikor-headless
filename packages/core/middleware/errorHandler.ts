import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn(
      {
        error: err.message,
        code: err.code,
        requestId: req.headers["x-request-id"] || undefined,
        details: err.details,
      },
      `[AppError] ${err.message}`
    );

    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      requestId: req.headers["x-request-id"] || undefined,
      timestamp: new Date().toISOString(),
      details: err.details ?? undefined,
    });
    return;
  }

  // Unexpected error
  logger.error(
    {
      err,
      requestId: req.headers["x-request-id"] || undefined,
    },
    "[UnhandledError]"
  );

  res.status(500).json({
    error: "Unexpected server error",
    code: "INTERNAL_SERVER_ERROR",
    requestId: req.headers["x-request-id"] || undefined,
    timestamp: new Date().toISOString(),
  });
}
