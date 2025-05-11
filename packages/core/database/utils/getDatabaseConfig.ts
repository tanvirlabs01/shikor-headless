import { MockConfig, PostgresConfig, MongoConfig } from "../types";

type Engine = "mock" | "postgres" | "mongo";

// ✅ Add union signature overload
export function getDatabaseConfig(engine: "mock"): MockConfig;
export function getDatabaseConfig(engine: "postgres"): PostgresConfig;
export function getDatabaseConfig(engine: "mongo"): MongoConfig;
export function getDatabaseConfig(
  engine: Engine
): MockConfig | PostgresConfig | MongoConfig;

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
      };

    case "mongo":
      return {
        connectionString: process.env.MONGO_URL!,
        dbName: process.env.MONGO_DB_NAME!,
      };

    case "mock":
    default:
      return {};
  }
}
