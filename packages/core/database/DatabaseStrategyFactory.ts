import type { Logger } from "pino";
import type {
  DatabaseEngine,
  BuiltinEngine,
  CustomEngine,
  CustomStrategyConfig,
  StrategyFactoryMap,
  MockConfig,
  PostgresConfig,
  MongoConfig,
  SqliteConfig,
} from "./types";

import { MockDatabaseStrategy } from "./strategies/mock/MockDatabaseStrategy";
import { PostgresStrategy } from "./strategies/postgres/PostgresStrategy";
import { MongoStrategy } from "./strategies/mongo/MongoStrategy";
import { SqliteStrategy } from "./strategies/sqlite/SqliteStrategy";
import { Config } from "../config/config";
import { IDatabaseStrategy } from "./IDatabaseStrategy";
import { loadEnvConfigValue } from "../utils/envLoader";
import { PostgresConfigSchema } from "../database/strategies/postgres/PostgresConfig";

export class DatabaseStrategyFactory {
  private static customStrategies = new Map<
    CustomEngine,
    CustomStrategyConfig<any>
  >();
  private static baseLogger?: Logger;
  private static dbLogger?: Logger;

  private static builtinStrategies: StrategyFactoryMap = {
    mock: (config, logger) => new MockDatabaseStrategy(config, logger),
    postgres: (config, logger) => new PostgresStrategy(config, logger),
    mongo: (config, logger) => new MongoStrategy(config, logger),
    sqlite: (config, logger) => new SqliteStrategy(config, logger),
  };

  static setLogger(logger: Logger): void {
    this.baseLogger = logger;
    this.dbLogger = logger.child({ module: "database" });
  }

  static async create(
    engine: "mock",
    config: MockConfig
  ): Promise<MockDatabaseStrategy>;
  static async create(
    engine: "postgres",
    config: PostgresConfig
  ): Promise<PostgresStrategy>;
  static async create(
    engine: "mongo",
    config: MongoConfig
  ): Promise<MongoStrategy>;
  static async create(
    engine: "sqlite",
    config: SqliteConfig
  ): Promise<SqliteStrategy>;
  static async create(
    engine: CustomEngine,
    config: any
  ): Promise<IDatabaseStrategy>;
  static async create<T extends DatabaseEngine>(
    engine: T,
    config: T extends "mock"
      ? MockConfig
      : T extends "postgres"
        ? PostgresConfig
        : T extends "mongo"
          ? MongoConfig
          : T extends "sqlite"
            ? SqliteConfig
            : any
  ): Promise<IDatabaseStrategy>;

  static async create(
    engine: DatabaseEngine,
    config: any
  ): Promise<IDatabaseStrategy> {
    if (engine.startsWith("custom:")) {
      return this.createCustomStrategy(engine as CustomEngine, config);
    }
    return this.createBuiltinStrategy(engine as BuiltinEngine, config);
  }

  private static async createCustomStrategy<T>(
    engine: CustomEngine,
    config: T
  ): Promise<IDatabaseStrategy> {
    const customConfig = this.customStrategies.get(engine) as
      | CustomStrategyConfig<T>
      | undefined;
    if (!customConfig) {
      throw new Error(`Unregistered custom engine: ${engine}`);
    }

    try {
      customConfig.configValidator?.(config);
      const instance = new customConfig.strategyClass(config, this.dbLogger);
      await instance.ready;
      this.dbLogger?.info({ engine }, `Initialized custom database engine`);
      return instance;
    } catch (error) {
      this.dbLogger?.error(
        { engine, err: error },
        "Custom engine initialization failed"
      );
      throw error;
    }
  }

  private static async createBuiltinStrategy(
    engine: BuiltinEngine,
    config: any
  ): Promise<IDatabaseStrategy> {
    const schema = Config.getModuleSchema(engine);
    if (!schema) {
      throw new Error(`Missing config schema for engine "${engine}"`);
    }

    const result = Config.validate({ [engine]: config });
    if (!result.success) {
      this.dbLogger?.error(
        { engine, errors: result.errors },
        `Config validation failed`
      );
      throw new Error(
        `Invalid config for "${engine}":\n${result.errors?.join("\n")}`
      );
    }

    const factory = this.builtinStrategies[engine];
    const instance = factory(config, this.dbLogger);
    await instance.ready;
    this.dbLogger?.info({ engine }, `Initialized ${engine} database`);
    return instance;
  }

  static registerCustomEngine<T>(
    engine: CustomEngine,
    config: CustomStrategyConfig<T>
  ): void {
    if (!engine.startsWith("custom:")) {
      throw new Error(
        `Custom engine must start with 'custom:', got '${engine}'`
      );
    }

    if (this.hasEngine(engine)) {
      throw new Error(`Engine '${engine}' is already registered`);
    }

    this.customStrategies.set(engine, config);
    this.dbLogger?.info({ engine }, "Registered custom database engine");
  }

  static hasEngine(engine: DatabaseEngine): boolean {
    return engine.startsWith("custom:")
      ? this.customStrategies.has(engine as CustomEngine)
      : engine in this.builtinStrategies;
  }

  static getEngineConfigSchema(engine: DatabaseEngine): object | undefined {
    if (engine.startsWith("custom:")) {
      return this.customStrategies.get(engine as CustomEngine)?.configSchema;
    }

    const schema = Config.getModuleSchema(engine);
    return schema ?? undefined;
  }

  static listEngines(): DatabaseEngine[] {
    return [
      ...(Object.keys(this.builtinStrategies) as BuiltinEngine[]),
      ...Array.from(this.customStrategies.keys()),
    ];
  }
}
