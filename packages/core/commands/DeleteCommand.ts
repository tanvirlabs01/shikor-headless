// packages/core/commands/DeleteCommand.ts
import { ICommand } from "./ICommand";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";

export class DeleteCommand implements ICommand<any> {
  constructor(
    private dbStrategy: {
      delete: (collection: string, filter: Record<string, any>) => Promise<any>;
    },
    private collection: string,
    private filter: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    logger.debug(
      { collection: this.collection, filter: this.filter },
      `🗑️ Deleting from '${this.collection}'`
    );

    try {
      const result = await this.dbStrategy.delete(this.collection, this.filter);

      logger.debug(
        { collection: this.collection, result },
        `✅ Delete completed from '${this.collection}'`
      );

      return result;
    } catch (err) {
      logger.error(
        { err, collection: this.collection },
        `❌ Delete failed from '${this.collection}'`
      );
      throw AppError.internal("Delete operation failed", err);
    }
  }
}
