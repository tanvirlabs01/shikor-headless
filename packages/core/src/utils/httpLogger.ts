import crypto from "crypto";
import { createRequestLogger } from "../telemetry/logger";
import type { RequestHandler } from "express";

declare module "express-serve-static-core" {
  interface Request {
    log: ReturnType<typeof createRequestLogger>;
    id: string;
  }
}

export const httpLogger: RequestHandler = (req, res, next) => {
  req.id = req.headers["x-request-id"]?.toString() || crypto.randomUUID();
  const requestLogger = createRequestLogger(req.id);
  req.log = requestLogger;

  req.log.info(
    {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
    "Request started"
  );

  const start = Date.now();

  res.once("finish", () => {
    req.log.info(
      {
        durationMs: Date.now() - start,
        status: res.statusCode,
      },
      "Request completed"
    );
  });

  res.once("close", () => {
    if (!res.writableEnded) {
      req.log.warn(
        {
          durationMs: Date.now() - start,
        },
        "Request closed before completion"
      );
    }
  });

  next();
};
