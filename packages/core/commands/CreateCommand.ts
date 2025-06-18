// packages/core/commands/CreateCommand.ts

import bcrypt from "bcryptjs";
import { ICommand } from "./ICommand";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";
export class CreateCommand implements ICommand {
  constructor(
    private dbStrategy: any,
    private collection: string,
    private data: Record<string, any>
  ) {}

  async execute() {
    try {
      const payload = { ...this.data };

      if (this.collection === "users" && payload.password) {
        const salt = await bcrypt.genSalt(10);
        payload.password = await bcrypt.hash(payload.password, salt);
        logger.debug("🔐 Password hashed before insertion");
      }

      const result = await this.dbStrategy.create(this.collection, payload);
      return result;
    } catch (err) {
      throw AppError.internal("Create operation failed", err);
    }
  }
}
