import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";
import { DatabaseStrategyFactory } from "../database";
import { AuthenticatedRequest } from "./authMiddleware";

export const authorizeCollectionActionMiddleware = (
  operation: "create" | "read" | "update" | "delete" | "reset"
) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    const user = req.user;

    if (!user?.role) {
      return next(AppError.unauthorized("User role missing in token"));
    }

    const collection = req.body?.collection || req.params?.collection;
    if (!collection) {
      return next(AppError.badRequest("Missing target collection"));
    }

    // ✅ Admin always has permission
    if (user.role === "admin") {
      logger.debug(
        `[AUTH] Admin override for '${operation}' on '${collection}'`
      );
      return next();
    }

    try {
      const db = await DatabaseStrategyFactory.getRequiredStrategy();

      const records = await db.read("collection_permissions", {
        filters: {
          collection_name: collection,
          operation,
        },
        limit: 1,
      });

      const record = records?.[0];
      const allowedRoles: string[] = record?.allowed_roles || [];

      const isAllowed = allowedRoles.includes(user.role);

      if (!isAllowed) {
        return next(
          AppError.forbidden(
            `Role '${user.role}' is not allowed to perform '${operation}' on '${collection}'`
          )
        );
      }

      return next();
    } catch (err) {
      logger.error("[AUTH] Failed to authorize operation", { err });
      return next(AppError.internal("Authorization check failed"));
    }
  };
};
