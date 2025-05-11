import type { Logger } from "pino";
import type { IDatabaseStrategy } from "./IDatabaseStrategy";
import type { MockDatabaseStrategy } from "./strategies/mock/MockDatabaseStrategy";
import type { PostgresStrategy } from "./strategies/postgres/PostgresStrategy";
import type { MongoStrategy } from "./strategies/mongo/MongoStrategy";

/** Built-in engine names */
export type BuiltinEngine = "mock" | "postgres" | "mongo"; // ✅ Added mongo

/** Custom engine name pattern */
export type CustomEngine = `custom:${string}`;

/** All supported database engines */
export type DatabaseEngine = BuiltinEngine | CustomEngine;

/** Base configuration for all strategies */
export interface BaseDatabaseConfig {
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Maximum connection retries */
  maxRetries?: number;
}

/** Mock database configuration */
export interface MockConfig extends BaseDatabaseConfig {
  [key: string]: any;
}

/** PostgreSQL configuration */
export interface PostgresConfig extends BaseDatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  /** Maximum number of connections in pool */
  poolSize?: number;
  /** Connection idle timeout in milliseconds */
  idleTimeout?: number;
  /** Query timeout in milliseconds */
  queryTimeout?: number;
}

/** MongoDB configuration */
export interface MongoConfig extends BaseDatabaseConfig {
  /** MongoDB connection string */
  connectionString: string;
  /** Default database name */
  dbName?: string;
  /** Connection timeout in milliseconds */
  connectTimeoutMS?: number;
}

/** Generic factory function type */
export type StrategyFactoryFn<C, S extends IDatabaseStrategy> = (
  config: C,
  logger?: Logger
) => S;

/** Built-in strategy factory map */
export type StrategyFactoryMap = {
  mock: StrategyFactoryFn<MockConfig, MockDatabaseStrategy>;
  postgres: StrategyFactoryFn<PostgresConfig, PostgresStrategy>;
  mongo: StrategyFactoryFn<MongoConfig, MongoStrategy>; // ✅ Added mongo
};

/** Configuration for custom strategies */
export interface CustomStrategyConfig<T = unknown> {
  /** The strategy class constructor */
  strategyClass: new (config: T, logger?: Logger) => IDatabaseStrategy;
  /** Optional configuration validator */
  configValidator?: (config: T) => void;
  /** JSON schema for configuration validation */
  configSchema?: Record<string, unknown>;
}

/** Union type of all built-in configuration types */
export type BuiltinConfig = MockConfig | PostgresConfig | MongoConfig;

/** Type guard for built-in engine names */
export function isBuiltinEngine(engine: string): engine is BuiltinEngine {
  return ["mock", "postgres", "mongo"].includes(engine);
}

/** Type guard for custom engine names */
export function isCustomEngine(engine: string): engine is CustomEngine {
  return engine.startsWith("custom:");
}
