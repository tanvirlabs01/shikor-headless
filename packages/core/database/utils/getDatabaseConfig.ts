import { MockConfig, PostgresConfig } from "../types";

type Engine = "mock" | "postgres";

// ✅ Properly typed function overload
export function getDatabaseConfig<T extends Engine>(
  engine: T
): T extends "mock" ? MockConfig : PostgresConfig;

export function getDatabaseConfig(engine: Engine): any {
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
    case "mock":
    default:
      return {} as MockConfig;
  }
}
