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
const router = express.Router();

const commandSchema = z.object({
  operation: z.enum(["create", "update", "delete"]),
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
    return next(
      AppError.validationError("Invalid command payload", {
        issues: result.error.flatten(),
      })
    );
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
    res.status(200).json({ success: true, data: executionResult });
  } catch (error) {
    logger.error(
      { error, operation, collection },
      `❌ '${operation}' on '${collection}' failed`
    );
    next(AppError.internal("Command execution failed", error));
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
