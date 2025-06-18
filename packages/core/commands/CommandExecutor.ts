// packages/core/commands/CommandExecutor.ts

import type { ICommand } from "./ICommand";

export class CommandExecutor {
  static async execute<T>(command: ICommand<T>): Promise<T> {
    return await command.execute();
  }
}
