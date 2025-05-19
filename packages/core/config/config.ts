import { z } from "zod";
import { ValidationHooks, ModuleConfigSchema } from "./types";

type SchemaMeta = {
  schema: ModuleConfigSchema;
  module: string;
  afterRegister?: (config: any) => void;
};

export class Config {
  private static schemaRegistry: Map<string, SchemaMeta> = new Map();

  static registerModuleSchema(
    module: string,
    schema: ModuleConfigSchema,
    meta?: Partial<Omit<SchemaMeta, "schema" | "module">>
  ) {
    this.schemaRegistry.set(module, {
      module,
      schema,
      ...meta,
    });
  }

  static getAllSchemas(): Record<string, ModuleConfigSchema> {
    const all: Record<string, ModuleConfigSchema> = {};
    for (const [module, { schema }] of this.schemaRegistry.entries()) {
      all[module] = schema;
    }
    return all;
  }

  static getModuleSchema(module: string): ModuleConfigSchema | undefined {
    return this.schemaRegistry.get(module)?.schema;
  }
  static getVisibleSettings(
    user: { roles: string[] },
    env: string = "development"
  ): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};

    for (const [module, { schema }] of this.schemaRegistry.entries()) {
      const resolvedFields: Record<string, any> = {};

      for (const [key, field] of Object.entries(schema)) {
        // 1. Check environment match
        if (field.environments && !field.environments.includes(env)) {
          continue;
        }

        // 2. Check visibility
        if (typeof field.visibleTo === "function") {
          const isVisible = field.visibleTo({ env, roles: user.roles });
          if (!isVisible) continue;
        } else if (Array.isArray(field.visibleTo)) {
          const roleMatch = field.visibleTo.some((role) =>
            user.roles.includes(role)
          );
          if (!roleMatch) continue;
        }

        // 3. Include field with resolved default
        resolvedFields[key] = {
          ...field,
          value: field.default ?? "",
          prompt: field.description ?? `Enter ${key}`, // for CLI/UI use
        };
      }

      if (Object.keys(resolvedFields).length > 0) {
        result[module] = resolvedFields;
      }
    }

    return result;
  }

  static validate(
    rawConfig: Record<string, any>,
    hooks?: ValidationHooks
  ): { success: boolean; errors?: string[] } {
    const errors: string[] = [];
    const parsedConfig: Record<string, any> = {};

    const allSchemas = this.getAllSchemas();

    if (hooks?.pre) hooks.pre(allSchemas);

    for (const [module, fields] of Object.entries(allSchemas)) {
      parsedConfig[module] = {};

      for (const [key, def] of Object.entries(fields)) {
        const value = rawConfig?.[module]?.[key];

        // Handle requiredIf
        if (
          def.requiredIf &&
          def.requiredIf(rawConfig) &&
          value === undefined
        ) {
          errors.push(`[${module}] "${key}" is required`);
          continue;
        }

        // Zod-type validation
        const base = (() => {
          switch (def.type) {
            case "string":
              return z.string();
            case "number":
              return z.number();
            case "boolean":
              return z.boolean();
            case "secret":
              return z.string(); // handle masking elsewhere
            case "custom":
              return z.any(); // custom types later
            default:
              return z.any();
          }
        })();

        const schema = def.default !== undefined ? base.optional() : base;

        const result = schema.safeParse(value);
        if (!result.success) {
          errors.push(`[${module}] "${key}": ${result.error.message}`);
          continue;
        }

        parsedConfig[module][key] = result.success ? result.data : value;
      }
    }

    if (hooks?.post) hooks.post(parsedConfig);

    return errors.length > 0 ? { success: false, errors } : { success: true };
  }
}
