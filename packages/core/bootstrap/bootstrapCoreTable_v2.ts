import { StrategyFactory } from "../strategies/StrategyFactory";
import bcrypt from "bcrypt";
import { Knex } from "knex";
import { logger } from "./utils/Logger";

const dbStrategy = StrategyFactory.getDatabaseStrategy();
const dbType = (process.env.DB_STRATEGY || "postgres").toLowerCase();

export class BootstrapService {
  static async initialize() {
    logger.info("🔧 Bootstrap: Starting system setup...");
    try {
      if (dbType === "postgres") {
        await BootstrapService.createPostgresTables();
      } else if (dbType === "mysql") {
        await BootstrapService.createMySQLTables();
      }

      await BootstrapService.ensureUsers();
      await BootstrapService.ensureSystemSchemas();
      await BootstrapService.ensureSystemPermissions();

      logger.info("✅ Bootstrap: System ready.");
    } catch (error: any) {
      logger.error("❌ Bootstrap failed:", error.message);
    }
  }

  private static async createPostgresTables() {
    const knex = (dbStrategy as any).getDb();

    logger.debug("🔧 Checking system tables in Postgres...");

    const hasCollectionSchemas =
      await knex.schema.hasTable("collection_schemas");
    if (!hasCollectionSchemas) {
      logger.debug("⚡ Creating table: collection_schemas");
      await knex.schema.createTable(
        "collection_schemas",
        (table: Knex.CreateTableBuilder) => {
          table.increments("id").primary();
          table.string("collection_name").unique().notNullable();
          table.jsonb("fields").notNullable();
        }
      );
      logger.debug("✅ Table collection_schemas created.");
    }

    const hasUsers = await knex.schema.hasTable("users");
    if (!hasUsers) {
      logger.debug("⚡ Creating table: users");
      await knex.schema.createTable(
        "users",
        (table: Knex.CreateTableBuilder) => {
          table.increments("id").primary();
          table.string("username").unique().notNullable();
          table.string("password").notNullable();
          table.string("role").notNullable();
        }
      );
      logger.debug("✅ Table users created.");
    }

    const hasCollectionPermissions = await knex.schema.hasTable(
      "collection_permissions"
    );
    if (!hasCollectionPermissions) {
      logger.debug("⚡ Creating table: collection_permissions");
      await knex.schema.createTable(
        "collection_permissions",
        (table: Knex.CreateTableBuilder) => {
          table.increments("id").primary();
          table.string("collection_name").notNullable();
          table.string("operation").notNullable();
          table.jsonb("allowed_roles").notNullable();
        }
      );
      logger.debug("✅ Table collection_permissions created.");
    }
  }

  private static async createMySQLTables() {
    const knex = (dbStrategy as any).getDb();

    logger.debug("🔧 Checking system tables in MySQL...");

    const hasCollectionSchemas =
      await knex.schema.hasTable("collection_schemas");
    if (!hasCollectionSchemas) {
      logger.debug("⚡ Creating table: collection_schemas");
      await knex.schema.createTable(
        "collection_schemas",
        (table: Knex.CreateTableBuilder) => {
          table.increments("id").primary();
          table.string("collection_name").unique().notNullable();
          table.json("fields").notNullable();
        }
      );
      logger.debug("✅ Table collection_schemas created.");
    }

    const hasUsers = await knex.schema.hasTable("users");
    if (!hasUsers) {
      logger.debug("⚡ Creating table: users");
      await knex.schema.createTable(
        "users",
        (table: Knex.CreateTableBuilder) => {
          table.increments("id").primary();
          table.string("username").unique().notNullable();
          table.string("password").notNullable();
          table.string("role").notNullable();
        }
      );
      logger.debug("✅ Table users created.");
    }

    const hasCollectionPermissions = await knex.schema.hasTable(
      "collection_permissions"
    );
    if (!hasCollectionPermissions) {
      logger.debug("⚡ Creating table: collection_permissions");
      await knex.schema.createTable(
        "collection_permissions",
        (table: Knex.CreateTableBuilder) => {
          table.increments("id").primary();
          table.string("collection_name").notNullable();
          table.string("operation").notNullable();
          table.json("allowed_roles").notNullable();
        }
      );
      logger.debug("✅ Table collection_permissions created.");
    }
  }

  private static async ensureUsers() {
    logger.debug("🔧 Ensuring admin user...");

    const users = await dbStrategy.read("users", {});

    if (users.length === 0) {
      const hashedPassword = await bcrypt.hash("password", 10);
      await dbStrategy.create("users", {
        username: "admin",
        password: hashedPassword,
        role: "admin",
      });

      logger.debug(
        "✅ Default admin user created: username=admin, password=password"
      );
    } else {
      logger.error("✅ Admin user already exists.");
    }
  }

  private static async ensureSystemSchemas() {
    logger.debug("🔧 Ensuring core collection schemas...");

    const requiredSchemas = [
      {
        collection_name: "users",
        fields: [
          { name: "username", type: "string", required: true },
          { name: "password", type: "string", required: true },
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
    for (const schema of requiredSchemas) {
      const exists = await dbStrategy.read("collection_schemas", {
        collection_name: schema.collection_name,
      });

      if (exists.length === 0) {
        await dbStrategy.create("collection_schemas", schema);
        logger.debug(`✅ Core schema for ${schema.collection_name} inserted.`);
      } else {
        logger.debug(`✅ Schema for ${schema.collection_name} already exists.`);
      }
    }
  }

  private static async ensureSystemPermissions() {
    logger.debug("🔧 Ensuring core collection permissions...");

    const defaultPermissions = [
      {
        collection_name: "users",
        operation: "create",
        allowed_roles: ["admin"],
      },
      { collection_name: "users", operation: "read", allowed_roles: ["admin"] },
      {
        collection_name: "users",
        operation: "update",
        allowed_roles: ["admin"],
      },
      {
        collection_name: "users",
        operation: "delete",
        allowed_roles: ["admin"],
      },
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
    ];

    for (const perm of defaultPermissions) {
      const exists = await dbStrategy.read("collection_permissions", {
        collection_name: perm.collection_name,
        operation: perm.operation,
      });

      if (exists.length === 0) {
        await dbStrategy.create("collection_permissions", {
          ...perm,
          allowed_roles:
            dbType === "mongo"
              ? perm.allowed_roles
              : JSON.stringify(perm.allowed_roles),
        });
        logger.debug(
          `✅ Permission inserted: ${perm.collection_name} - ${perm.operation}`
        );
      } else {
        logger.debug(
          `✅ Permission already exists: ${perm.collection_name} - ${perm.operation}`
        );
      }
    }
  }
}
