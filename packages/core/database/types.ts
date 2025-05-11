import type { Logger } from "pino";
import { IDatabaseStrategy } from "./IDatabaseStrategy";
import { MockDatabaseStrategy } from "./strategies/mock/MockDatabaseStrategy";
import { PostgresStrategy } from "./strategies/postgres/PostgresStrategy";
import { MongoStrategy } from "./strategies/mongo/MongoStrategy"; // ✅ Mongo added

/** Built-in engine names */
export type BuiltinEngine = "mock" | "postgres";

/** Custom engine name pattern */
export type CustomEngine = `custom:${string}`;

/** All engines */
export type DatabaseEngine = BuiltinEngine | CustomEngine;

/** Mock config */
export type MockConfig = Record<string, any>;

/** Postgres config */
export type PostgresConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  poolSize?: number;
  idleTimeout?: number;
};

/** Generic factory function type */
export type StrategyFactoryFn<C, S extends IDatabaseStrategy> = (
  config: C,
  logger?: Logger
) => S;

/** Factory map type */
export type StrategyFactoryMap = {
  mock: StrategyFactoryFn<MockConfig, MockDatabaseStrategy>;
  postgres: StrategyFactoryFn<PostgresConfig, PostgresStrategy>;
};

/** Generic custom strategy config */
export type CustomStrategyConfig<T = any> = {
  strategyClass: new (config: T, logger?: Logger) => IDatabaseStrategy;
  configValidator?: (config: T) => void;
};
