// packages/core/middleware/authMiddleware.ts

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";

const SECRET_KEY = process.env.SECRET_KEY || "changeme";

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return next(AppError.unauthorized("Missing token"));
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      logger.warn({ err }, "JWT verification failed");
      return next(AppError.unauthorized("Invalid token"));
    }
    req.user = user;
    next();
  });
};
