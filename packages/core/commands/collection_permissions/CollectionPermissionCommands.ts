// packages/core/commands/collection_permissions/CollectionPermissionCommands.ts

import { ICommand } from "../ICommand";
import { AppError } from "../../errors/AppError";
import { DatabaseStrategyFactory } from "../../database/DatabaseStrategyFactory";
import { z } from "zod";

// ===================
// CREATE PERMISSION
// ===================
const createSchema = z.object({
  collection_name: z.string().min(1),
  operation: z.enum(["create", "read", "update", "delete"]),
  allowed_roles: z.array(z.string().min(1)).min(1),
});

export class CollectionPermissionCreateCommand implements ICommand {
  constructor(
    private collection: string,
    private data: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    const parsed = createSchema.safeParse(this.data);
    if (!parsed.success) {
      throw AppError.validationError(
        "Invalid permission schema input",
        parsed.error.flatten()
      );
    }

    const { collection_name, operation, allowed_roles } = parsed.data;
    const db = await DatabaseStrategyFactory.getRequiredStrategy();

    const existing = await db.read("collection_permissions", {
      collection_name,
      operation,
    });

    if (existing.length > 0) {
      const current = existing[0];
      const currentRoles = new Set(current.allowed_roles);
      const newRoles = new Set(allowed_roles);
      const mergedRoles = Array.from(
        new Set([...currentRoles, ...newRoles])
      ) as string[];

      const isChanged = mergedRoles.length !== current.allowed_roles.length;

      if (isChanged) {
        await db.update(
          "collection_permissions",
          { collection_name, operation },
          { allowed_roles: JSON.stringify(mergedRoles) }
        );
        return { updated: true, merged_roles: mergedRoles };
      } else {
        return { updated: false, message: "No role changes detected" };
      }
    }

    const result = await db.create("collection_permissions", {
      collection_name,
      operation,
      allowed_roles: JSON.stringify(allowed_roles),
    });

    return { inserted: result };
  }
}

// ===================
// UPDATE PERMISSION
// ===================
const updateSchema = z.object({
  collection_name: z.string().min(1),
  operation: z.enum(["create", "read", "update", "delete"]),
  allowed_roles: z.array(z.string().min(1)).min(1),
});

export class CollectionPermissionUpdateCommand implements ICommand {
  constructor(
    private collection: string,
    private data: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    const parsed = updateSchema.safeParse(this.data);
    if (!parsed.success) {
      throw AppError.validationError(
        "Invalid permission update input",
        parsed.error.flatten()
      );
    }

    const { collection_name, operation, allowed_roles } = parsed.data;
    const db = await DatabaseStrategyFactory.getRequiredStrategy();

    const existing = await db.read("collection_permissions", {
      collection_name,
      operation,
    });

    if (!existing.length) {
      throw AppError.notFound(
        `No permission found for '${operation}' on '${collection_name}'`
      );
    }

    const current = existing[0];
    const currentRoles = new Set(current.allowed_roles);
    const newRoles = new Set(allowed_roles);

    const mergedRoles = Array.from(new Set([...newRoles])) as string[];

    const isChanged =
      mergedRoles.length !== current.allowed_roles.length ||
      !mergedRoles.every((r) => currentRoles.has(r));

    if (!isChanged) {
      return { updated: false, message: "No role changes detected" };
    }

    await db.update(
      "collection_permissions",
      { collection_name, operation },
      { allowed_roles: JSON.stringify(mergedRoles) }
    );

    return {
      updated: true,
      collection_name,
      operation,
      allowed_roles: mergedRoles,
    };
  }
}

// ===================
// DELETE PERMISSION
// ===================
const deleteSchema = z.object({
  collection_name: z.string().min(1),
  operation: z.enum(["create", "read", "update", "delete"]),
});

export class CollectionPermissionDeleteCommand implements ICommand {
  constructor(
    private collection: string,
    private data: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    const parsed = deleteSchema.safeParse(this.data);
    if (!parsed.success) {
      throw AppError.validationError(
        "Invalid permission delete input",
        parsed.error.flatten()
      );
    }

    const { collection_name, operation } = parsed.data;
    const db = await DatabaseStrategyFactory.getRequiredStrategy();

    const existing = await db.read("collection_permissions", {
      collection_name,
      operation,
    });

    if (!existing.length) {
      throw AppError.notFound(
        `No permission found for '${operation}' on '${collection_name}'`
      );
    }

    await db.delete("collection_permissions", { collection_name, operation });

    return { deleted: true, collection_name, operation };
  }
}

// ===================
// RESET PERMISSION (instead of delete)
// ===================

const resetSchema = z.object({
  collection_name: z.string().min(1),
  operation: z.enum(["create", "read", "update", "reset"]),
});

export class CollectionPermissionResetCommand implements ICommand {
  constructor(
    private collection: string,
    private data: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    const parsed = resetSchema.safeParse(this.data);
    if (!parsed.success) {
      throw AppError.validationError(
        "Invalid permission reset input",
        parsed.error.flatten()
      );
    }

    const { collection_name, operation } = parsed.data;
    const db = await DatabaseStrategyFactory.getRequiredStrategy();

    const existing = await db.read("collection_permissions", {
      collection_name,
      operation,
    });

    if (!existing.length) {
      throw AppError.notFound(
        `No permission found for '${operation}' on '${collection_name}'`
      );
    }

    const record = existing[0];

    const newRoles = ["admin"]; // 🔒 Always keep admin

    await db.update(
      "collection_permissions",
      { id: record.id },
      { allowed_roles: JSON.stringify(newRoles) }
    );

    return {
      reset: true,
      collection_name,
      operation,
      allowed_roles: newRoles,
      message: `Permissions reset for '${operation}' on '${collection_name}', admin retained.`,
    };
  }
}
