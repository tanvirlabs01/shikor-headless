// packages/core/commands/UpdateCommand.ts

import { ICommand } from "./ICommand";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";

export class UpdateCommand implements ICommand<any> {
  constructor(
    private dbStrategy: {
      update: (
        collection: string,
        filter: Record<string, any>,
        data: Record<string, any>
      ) => Promise<any>;
    },
    private collection: string,
    private filter: Record<string, any>,
    private data: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    logger.debug(
      { collection: this.collection, filter: this.filter, data: this.data },
      `🛠️ Updating record(s) in '${this.collection}'`
    );

    try {
      const result = await this.dbStrategy.update(
        this.collection,
        this.filter,
        this.data
      );

      logger.debug(
        { collection: this.collection, result },
        `✅ Update completed in '${this.collection}'`
      );

      return result;
    } catch (err) {
      logger.error(
        { err, collection: this.collection },
        `❌ Update failed in '${this.collection}'`
      );
      throw AppError.internal("Update operation failed", err);
    }
  }
}
