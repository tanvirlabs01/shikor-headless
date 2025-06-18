// packages/core/middleware/authorizeCollectionActionMiddleware.ts

import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";
import { DatabaseStrategyFactory } from "../database";

export const authorizeCollectionActionMiddleware = (operation: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !user.role) {
      return next(AppError.unauthorized("Missing user role"));
    }

    const { collection } = req.body;
    if (!collection) {
      return next(AppError.validationError("Missing collection name"));
    }

    // Allow system-level operations to proceed without check
    if (collection === "collection_permissions") {
      return next();
    }

    try {
      const db =
        req.app.locals.db ||
        (await DatabaseStrategyFactory.create(
          (process.env.DB_ENGINE || "mock") as
            | "postgres"
            | "sqlite"
            | "mongo"
            | "mock",
          {} // assumes config loaded elsewhere
        ));

      const result = await db.read("collection_permissions", {
        collection_name: collection,
        operation,
      });

      const allowedRoles = result?.[0]?.allowed_roles || [];

      if (!allowedRoles.includes(user.role)) {
        logger.warn(
          {
            user: user.username,
            role: user.role,
            collection,
            operation,
          },
          "🚫 Permission denied"
        );
        return next(
          AppError.forbidden(
            `Role '${user.role}' cannot perform '${operation}' on '${collection}'`
          )
        );
      }

      return next();
    } catch (err) {
      return next(AppError.internal("Failed to authorize request", err));
    }
  };
};
