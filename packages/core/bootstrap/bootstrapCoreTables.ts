import { resolveDatabaseStrategy } from "../database/utils/resolveStrategy";
import { logger } from "../src/telemetry/logger";
import bcrypt from "bcryptjs";
import { IDatabaseStrategy } from "../database";

interface AdminUserInput {
  username: string;
  password: string;
  email: string;
  role?: string; // optional but default to 'admin'
}
export async function bootstrapCoreTables(adminUser?: AdminUserInput) {
  const engine = (process.env.DB_ENGINE || "mock") as
    | "postgres"
    | "sqlite"
    | "mongo"
    | "mock";

  logger.info("🔧 Bootstrapping core CMS tables...");
  const db: IDatabaseStrategy = await resolveDatabaseStrategy(engine);
  try {
    let knex: any = null;
    try {
      if (typeof (db as any).getDb === "function") {
        knex = (db as any).getDb();
      }
    } catch (_) {}

    if (knex) {
      logger.debug("🛠️ Detected Knex-compatible DB — bootstrapping tables...");

      if (!(await knex.schema.hasTable("collection_schemas"))) {
        await knex.schema.createTable("collection_schemas", (table) => {
          table.increments("id").primary();
          table.string("collection_name").unique().notNullable();
          table.json("fields").notNullable();
        });
        logger.info("✅ Table collection_schemas created.");
      }

      if (!(await knex.schema.hasTable("users"))) {
        await knex.schema.createTable("users", (table) => {
          table.increments("id").primary();
          table.string("username").unique().notNullable();
          table.string("password").notNullable();
          table.string("email").notNullable();
          table.string("role").notNullable();
          table.string("refresh_token").nullable();
          table.timestamp("last_login_at").nullable(); // ✅ Add this
          table.timestamps(true, true);
        });
        logger.info("✅ Table users created.");
      }

      if (!(await knex.schema.hasTable("collection_permissions"))) {
        await knex.schema.createTable("collection_permissions", (table) => {
          table.increments("id").primary();
          table.string("collection_name").notNullable();
          table.string("operation").notNullable();
          table.jsonb("allowed_roles").notNullable();
        });
        logger.info("✅ Table collection_permissions created.");
      }
    } else {
      logger.warn("⚠️ No Knex instance found — skipping SQL table creation.");
    }

    await ensureAdminUser(db, engine, adminUser);
    await ensureSystemSchemas(db);
    await ensureDefaultPermissions(db, engine);
  } catch (err) {
    logger.error({ err }, "❌ Bootstrap failed");
    throw err;
  } finally {
    await db.disconnect?.();
  }
}
/*
async function ensureAdminUser(db: IDatabaseStrategy, engine: string) {
  const users = await db.read("users", {});
  if (users.length === 0) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash("password", salt);
    await db.create("users", {
      username: "admin",
      password: hash,
      email: "admin@shikor.com",
      role: "admin",
    });
    logger.info("✅ Default admin user created");
  } else {
    logger.info("✅ Admin user already exists");
  }
}
  */

async function ensureAdminUser(
  db: IDatabaseStrategy,
  engine: string,
  adminUser?: AdminUserInput
) {
  const users = await db.read("users", {});
  if (users.length === 0) {
    const {
      username,
      password,
      email,
      role = "admin",
    } = adminUser ?? {
      username: "admin",
      password: "password",
      email: "admin@shikor.com",
    };

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    await db.create("users", {
      username,
      password: hash,
      email,
      role,
    });

    logger.info(`✅ Default admin user "${username}" created`);
  } else {
    logger.info("✅ Admin user already exists");
  }
}

async function ensureSystemSchemas(db: IDatabaseStrategy) {
  const schemas = [
    {
      collection_name: "users",
      fields: [
        { name: "username", type: "string", required: true },
        { name: "password", type: "string", required: true },
        { name: "email", type: "string", require: true },
        { name: "role", type: "string", required: true },
      ],
    },
    {
      collection_name: "collection_permissions",
      fields: [
        { name: "collection_name", type: "string", required: true },
        { name: "operation", type: "string", required: true },
        { name: "allowed_roles", type: "json", required: true },
      ],
    },
  ];
  for (const schema of schemas) {
    const exists = await db.read("collection_schemas", {
      collection_name: schema.collection_name,
    });
    if (!exists.length) {
      await db.create("collection_schemas", schema);
      logger.info(`✅ Core schema for ${schema.collection_name} inserted.`);
    } else {
      logger.info(`✅ Schema for ${schema.collection_name} already exists.`);
    }
  }
}

async function ensureDefaultPermissions(db: IDatabaseStrategy, engine: string) {
  const perms = [
    { collection_name: "users", operation: "create", allowed_roles: ["admin"] },
    { collection_name: "users", operation: "read", allowed_roles: ["admin"] },
    { collection_name: "users", operation: "update", allowed_roles: ["admin"] },
    { collection_name: "users", operation: "delete", allowed_roles: ["admin"] },
    {
      collection_name: "collection_permissions",
      operation: "create",
      allowed_roles: ["admin"],
    },
    {
      collection_name: "collection_permissions",
      operation: "read",
      allowed_roles: ["admin"],
    },
    {
      collection_name: "collection_permissions",
      operation: "update",
      allowed_roles: ["admin"],
    },
    {
      collection_name: "collection_permissions",
      operation: "delete",
      allowed_roles: ["admin"],
    },
    {
      collection_name: "collection_permissions",
      operation: "reset",
      allowed_roles: ["admin"],
    },
  ];

  for (const perm of perms) {
    const exists = await db.read("collection_permissions", {
      collection_name: perm.collection_name,
      operation: perm.operation,
    });

    if (!exists.length) {
      await db.create("collection_permissions", {
        ...perm,
        allowed_roles:
          engine === "mongo" || engine === "mock"
            ? perm.allowed_roles
            : JSON.stringify(perm.allowed_roles),
      });
      logger.info(
        `✅ Permission inserted: ${perm.collection_name} - ${perm.operation}`
      );
    } else {
      logger.info(
        `✅ Permission already exists: ${perm.collection_name} - ${perm.operation}`
      );
    }
  }
}
