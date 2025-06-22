// packages/core/commands/collection_schemas/CollectionSchemaCommandRegistry.ts
import {
  CollectionSchemaCreateCommand,
  CollectionSchemaUpdateCommand,
  CollectionSchemaDeleteCommand,
} from "./CollectionSchemaCommands";
import { ICommand } from "../ICommand";

type CommandFactoryFn = (collection: string, data: any) => ICommand;

export const collectionSchemaRegistry: Record<
  "create" | "update" | "delete",
  CommandFactoryFn
> = {
  create: (collection, data) =>
    new CollectionSchemaCreateCommand(collection, data),
  update: (collection, data) =>
    new CollectionSchemaUpdateCommand(collection, data),
  delete: (collection, data) =>
    new CollectionSchemaDeleteCommand(collection, data),
};
