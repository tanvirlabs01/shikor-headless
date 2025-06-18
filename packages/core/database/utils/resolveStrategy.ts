// packages/core/database/utils/resolveStrategy.ts
import {
  DatabaseStrategyFactory,
  type IDatabaseStrategy,
} from "@shikor/core/database";
import { Config } from "@shikor/core/config/config";
import { loadResolvedConfigForModule } from "@shikor/core/config/helpers/env";
import type {
  MockConfig,
  PostgresConfig,
  MongoConfig,
  SqliteConfig,
} from "@shikor/core/database/types";
import { dbLogger } from "@shikor/core/src/telemetry/logger";

export async function resolveDatabaseStrategy(
  engine: "mock" | "postgres" | "mongo" | "sqlite"
): Promise<IDatabaseStrategy> {
  const config = loadResolvedConfigForModule(engine);
  const validation = Config.validate({ [engine]: config });
  if (!validation.success) {
    dbLogger.error(validation.errors, `Invalid config for engine '${engine}'`);
    process.exit(1);
  }

  dbLogger.info({ engine }, "Initializing database connection");

  switch (engine) {
    case "mock":
      return await DatabaseStrategyFactory.create("mock", config as MockConfig);
    case "postgres":
      return await DatabaseStrategyFactory.create(
        "postgres",
        config as PostgresConfig
      );
    case "mongo":
      return await DatabaseStrategyFactory.create(
        "mongo",
        config as MongoConfig
      );
    case "sqlite":
      return await DatabaseStrategyFactory.create(
        "sqlite",
        config as SqliteConfig
      );
    default:
      throw new Error(`Unsupported database engine: ${engine}`);
  }
}
