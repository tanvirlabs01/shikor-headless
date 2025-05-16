import {
  MockConfig,
  PostgresConfig,
  MongoConfig,
  SqliteConfig,
} from "../types";

type Engine = "mock" | "postgres" | "mongo" | "sqlite";

// ✅ Add union signature overload
export function getDatabaseConfig<T extends Engine>(
  engine: T
): T extends "mock"
  ? MockConfig
  : T extends "postgres"
    ? PostgresConfig
    : T extends "mongo"
      ? MongoConfig
      : SqliteConfig;
// ✅ Implementation
export function getDatabaseConfig(
  engine: Engine
): MockConfig | PostgresConfig | MongoConfig {
  switch (engine) {
    case "postgres":
      return {
        host: process.env.POSTGRES_HOST!,
        port: Number(process.env.POSTGRES_PORT!),
        user: process.env.POSTGRES_USER!,
        password: process.env.POSTGRES_PASSWORD!,
        database: process.env.POSTGRES_DB!,
        ssl: process.env.POSTGRES_SSL === "true",
        poolSize: Number(process.env.POSTGRES_POOL_SIZE || 10),
        idleTimeout: Number(process.env.POSTGRES_IDLE_TIMEOUT || 30000),
      } as PostgresConfig;

    case "mongo":
      return {
        connectionString: process.env.MONGO_URL!,
        dbName: process.env.MONGO_DB_NAME!,
      } as MongoConfig;
    case "sqlite":
      return {
        filepath: process.env.SQLITE_DB_PATH!,
      } as SqliteConfig;

    case "mock":
    default:
      return {} as MockConfig;
  }
}
