// packages/core/commands/ICommand.ts
export interface ICommand<T = any> {
  execute(): Promise<T>;
}
