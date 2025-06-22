// packages/core/commands/custom/CollectionSchemaCommand.ts

import { ICommand } from "../ICommand";
import { AppError } from "../../errors/AppError";
import { DatabaseStrategyFactory } from "../../database/DatabaseStrategyFactory";
import { z } from "zod";

// ===================
// CREATE SCHEMA
// ===================
const createSchema = z.object({
  collection_name: z.string().min(1),
  fields: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        required: z.boolean().optional(),
      })
    )
    .min(1),
});

export class CollectionSchemaCreateCommand implements ICommand {
  constructor(
    private collection: string,
    private data: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    const parsed = createSchema.safeParse(this.data);
    if (!parsed.success) {
      throw AppError.validationError(
        "Invalid schema input",
        parsed.error.flatten()
      );
    }

    const { collection_name, fields } = parsed.data;
    const db = await DatabaseStrategyFactory.getRequiredStrategy();

    const existing = await db.read("collection_schemas", {
      collection_name,
    });
    if (existing.length > 0) {
      throw AppError.conflict(
        `Collection schema '${collection_name}' already exists`
      );
    }

    const created = await db.create("collection_schemas", {
      collection_name,
      fields: JSON.stringify(fields),
    });

    await db.createTableFromSchema(collection_name, fields);

    return { inserted: created };
  }
}

// ===================
// UPDATE SCHEMA
// ===================
const updateSchema = z.object({
  collection_name: z.string().min(1),
  fields: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        required: z.boolean().optional(),
      })
    )
    .min(1),
});

export class CollectionSchemaUpdateCommand implements ICommand {
  constructor(
    private collection: string,
    private data: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    const parsed = updateSchema.safeParse(this.data);
    if (!parsed.success) {
      throw AppError.validationError(
        "Invalid update schema input",
        parsed.error.flatten()
      );
    }

    const { collection_name, fields } = parsed.data;
    const db = await DatabaseStrategyFactory.getRequiredStrategy();

    const existing = await db.read("collection_schemas", {
      collection_name,
    });

    if (!existing.length) {
      throw AppError.notFound(`No schema found for '${collection_name}'`);
    }

    await db.update(
      "collection_schemas",
      { collection_name },
      { fields: JSON.stringify(fields) }
    );

    await db.alterTableFromSchema(collection_name, fields);

    return { updated: true, collection_name };
  }
}

// ===================
// DELETE SCHEMA
// ===================
const deleteSchema = z.object({
  collection_name: z.string().min(1),
});

export class CollectionSchemaDeleteCommand implements ICommand {
  constructor(
    private collection: string,
    private data: Record<string, any>
  ) {}

  async execute(): Promise<any> {
    const parsed = deleteSchema.safeParse(this.data);
    if (!parsed.success) {
      throw AppError.validationError(
        "Invalid delete schema input",
        parsed.error.flatten()
      );
    }

    const { collection_name } = parsed.data;
    const db = await DatabaseStrategyFactory.getRequiredStrategy();

    const existing = await db.read("collection_schemas", {
      collection_name,
    });

    if (!existing.length) {
      throw AppError.notFound(`No schema found for '${collection_name}'`);
    }

    await db.delete("collection_schemas", { collection_name });
    await db.dropTable(collection_name);

    return { deleted: true, collection_name };
  }
}
