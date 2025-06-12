// packages/core/database/knex/createKnexInstance.ts
import knex, { Knex } from "knex";
import { z } from "zod";

// Infer client from connection string (if passed as string)
/*
function inferClientFromUrl(url: string): KnexConfig["client"] {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://"))
    return "pg";
  if (url.startsWith("mysql://") || url.startsWith("mysql2://"))
    return "mysql2";
  if (url.startsWith("sqlite://")) return "sqlite3";
  return "pg"; // fallback
}
  */
export function inferClientFromUrl(url: string): KnexConfig["client"] {
  if (url.startsWith("postgres://")) return "pg";
  if (url.startsWith("mysql://") || url.startsWith("mysql2://"))
    return "mysql2";
  if (url.startsWith("sqlite://") || url.startsWith("file:"))
    return "better-sqlite3";
  throw new Error("Cannot infer DB client from URL");
}

// 1. Define strict config schema using Zod
/*
const KnexConfigSchema = z.object({
  client: z.enum(["pg", "mysql2", "sqlite3", "better-sqlite3"]),
  connection: z.union([
    z.string().url(), // For connection strings
    z
      .object({
        host: z.string().optional(),
        user: z.string().optional(),
        password: z.string().optional(),
        database: z.string().optional(),
        filename: z.string().optional(), // For SQLite
      })
      .refine(
        (conn) => {
          // SQLite should have filename, others should not
          if (conn.filename) return !conn.database;
          return true;
        },
        {
          message:
            "Use either 'filename' for SQLite or 'database' for other DBs",
        }
      ),
  ]),
  pool: z
    .object({
      min: z.number().int().min(1).default(2),
      max: z.number().int().min(1).default(10),
      idleTimeoutMillis: z.number().min(1000).default(30000),
    })
    .optional(),
  debug: z.boolean().default(false),
});
*/
export const KnexConfigSchema = z.object({
  client: z.enum(["pg", "mysql2", "sqlite3", "better-sqlite3"]),
  connection: z.union([
    z.string().url(), // ✅ connection string only now
    z.object({
      filename: z.string(), // ✅ for SQLite only
    }),
  ]),
  pool: z
    .object({
      min: z.number().int().min(1).default(2),
      max: z.number().int().min(1).default(10),
      idleTimeoutMillis: z.number().min(1000).default(30000),
    })
    .optional(),
  debug: z.boolean().default(false),
});

/*
export type KnexConfig = z.infer<typeof KnexConfigSchema>;

// 2. Factory function with validation and defaults
export function createKnexInstance(
  rawConfig: KnexConfig | string // Allow connection string
): Knex {
  // Normalize config
  const config =
    typeof rawConfig === "string"
      ? {
          client: inferClientFromUrl(rawConfig),
          connection: rawConfig,
        }
      : rawConfig;

  // Validate
  const parsed = KnexConfigSchema.parse(config);

  // SQLite-specific
  if (parsed.client === "sqlite3" || parsed.client === "better-sqlite3") {
    const conn = typeof parsed.connection === "object" ? parsed.connection : {};
    return knex({
      ...parsed,
      useNullAsDefault: true,
      connection: {
        filename: conn.filename || "./shikor.sqlite",
      },
    });
  }

  // All other clients
  const instance = knex({
    ...parsed,
    pool: {
      ...parsed.pool,
      ...(parsed.client === "pg" ? { idleTimeoutMillis: 30000 } : {}),
    },
  });

  // Optional debug output
  if (parsed.debug) {
    console.log(`[Shikor] Knex initialized with client: ${parsed.client}`);
    console.dir(parsed.connection, { depth: null });
  }

  return instance;
}
  */
export type KnexConfig = z.infer<typeof KnexConfigSchema>;

export function createKnexInstance(rawConfig: KnexConfig | string): Knex {
  const config: KnexConfig =
    typeof rawConfig === "string"
      ? {
          client: inferClientFromUrl(rawConfig),
          connection: rawConfig,
          debug: false, // ✅ required to satisfy KnexConfig type
        }
      : rawConfig;

  const parsed = KnexConfigSchema.parse(config);
  if (parsed.client === "sqlite3" || parsed.client === "better-sqlite3") {
    const conn =
      typeof parsed.connection === "object" && "filename" in parsed.connection
        ? parsed.connection
        : { filename: "./shikor.sqlite" };

    return knex({
      ...parsed,
      useNullAsDefault: true,
      connection: {
        filename: conn.filename,
      },
    });
  }

  return knex(parsed);
}
