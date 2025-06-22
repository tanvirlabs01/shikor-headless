// packages/core/routes/commandRouter.ts

import express, { RequestHandler } from "express";
import { z } from "zod";
import { ICommand } from "../commands/ICommand";
import { CommandExecutor } from "../commands/CommandExecutor";
import { CreateCommand } from "../commands/CreateCommand";
import { ReadCommand } from "../commands/ReadCommand";
import { UpdateCommand } from "../commands/UpdateCommand";
import { DeleteCommand } from "../commands/DeleteCommand";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeCollectionActionMiddleware } from "../middleware/authorizeCollectionActionMiddleware";
import { collectionPermissionRegistry } from "../commands/collection_permissions/CollectionPermissionCommandRegistry";
import { collectionSchemaRegistry } from "../commands/collection_schemas/CollectionSchemaCommandRegistry";
import { ApiResponse } from "../utils/ApiResponse"; // ✅ Added ApiResponse import

const router = express.Router();

const commandSchema = z.object({
  operation: z.enum(["create", "read", "update", "delete", "reset"]),
  collection: z.string().min(1),
  data: z.record(z.any()).optional(),
  filter: z.record(z.any()).optional(),
});

const commandFactory = (
  dbStrategy: any,
  operation: string,
  collection: string,
  data?: Record<string, any>,
  filter?: Record<string, any>
): ICommand => {
  if (collection === "collection_permissions") {
    const factory =
      collectionPermissionRegistry[
        operation as keyof typeof collectionPermissionRegistry
      ];
    if (!factory) {
      throw AppError.validationError(
        `Unsupported operation '${operation}' for collection_permissions`
      );
    }
    return factory(collection, data!);
  }
  if (collection === "collection_schemas") {
    const factory =
      collectionSchemaRegistry[
        operation as keyof typeof collectionSchemaRegistry
      ];
    if (!factory) {
      throw AppError.validationError(
        `Unsupported operation '${operation}' for collection_schemas`
      );
    }
    return factory(collection, data!);
  }
  switch (operation) {
    case "create":
      return new CreateCommand(dbStrategy, collection, data!);
    case "read":
      return new ReadCommand(dbStrategy, collection, filter);
    case "update":
      return new UpdateCommand(dbStrategy, collection, filter!, data!);
    case "delete":
      return new DeleteCommand(dbStrategy, collection, filter!);
    default:
      throw AppError.validationError(`Unsupported operation: ${operation}`, {
        operation,
      });
  }
};

const handler: RequestHandler = async (req, res, next) => {
  const result = commandSchema.safeParse(req.body);

  if (!result.success) {
    logger.warn({ payload: req.body }, "❌ Invalid command payload");
    res
      .status(422)
      .json(ApiResponse.validationError(result.error.flatten().fieldErrors));
    return;
  }

  const { operation, collection, data, filter } = result.data;

  logger.info(
    { operation, collection, data, filter },
    `➡️ Running '${operation}' on '${collection}'`
  );

  try {
    const dbStrategy = req.app.locals.db;
    const command = commandFactory(
      dbStrategy,
      operation,
      collection,
      data,
      filter
    );
    const executionResult = await CommandExecutor.execute(command);

    logger.info(
      { result: executionResult },
      `✅ '${operation}' on '${collection}' succeeded`
    );
    res.status(200).json(ApiResponse.ok(executionResult));
  } catch (error: any) {
    logger.error(
      { error, operation, collection },
      `❌ '${operation}' on '${collection}' failed`
    );

    if (error.code === "VALIDATION_FAILED") {
      const fieldErrors: Record<string, string[]> =
        error.details?.fieldErrors &&
        typeof error.details.fieldErrors === "object"
          ? error.details.fieldErrors
          : {};

      res.status(422).json(ApiResponse.validationError(fieldErrors));
    }

    res
      .status(500)
      .json(
        ApiResponse.error("Command execution failed", { code: error.code })
      );
  }
};

router.post(
  "/command",
  authenticateToken,
  (req, res, next) =>
    authorizeCollectionActionMiddleware(req.body.operation)(req, res, next),
  handler
);

export default router;
