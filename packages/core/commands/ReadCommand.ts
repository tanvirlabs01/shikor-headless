// packages/core/commands/ReadCommand.ts

import { ICommand } from "./ICommand";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";

export class ReadCommand implements ICommand<any> {
  constructor(
    private dbStrategy: {
      read: (collection: string, filter?: Record<string, any>) => Promise<any>;
    },
    private collection: string,
    private filter?: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    logger.debug(
      { collection: this.collection, filter: this.filter },
      `🔍 Reading from '${this.collection}'`
    );

    try {
      const result = await this.dbStrategy.read(this.collection, this.filter);

      logger.debug(
        { collection: this.collection, result },
        `✅ Read completed from '${this.collection}'`
      );

      return result;
    } catch (err) {
      logger.error(
        { err, collection: this.collection },
        `❌ Read failed from '${this.collection}'`
      );
      throw AppError.internal("Read operation failed", err);
    }
  }
}
