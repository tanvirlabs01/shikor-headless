// packages/core/commands/custom/CollectionPermissionCommandRegistry.ts

import {
  CollectionPermissionCreateCommand,
  CollectionPermissionUpdateCommand,
  CollectionPermissionDeleteCommand,
  CollectionPermissionResetCommand,
} from "./CollectionPermissionCommands";

import type { ICommand } from "../ICommand";

type CommandFactoryFn = (collection: string, data: any) => ICommand;

// Main registry with all operations
export const collectionPermissionRegistry: Record<
  "create" | "update" | "delete" | "reset",
  CommandFactoryFn
> = {
  create: (collection, data) =>
    new CollectionPermissionCreateCommand(collection, data),
  update: (collection, data) =>
    new CollectionPermissionUpdateCommand(collection, data),
  delete: (collection, data) =>
    new CollectionPermissionDeleteCommand(collection, data),
  reset: (collection, data) =>
    new CollectionPermissionResetCommand(collection, data),
};
