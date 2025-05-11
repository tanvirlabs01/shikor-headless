import type { Logger } from "pino";
import type { IDatabaseStrategy } from "./IDatabaseStrategy";
import type {
  DatabaseEngine,
  BuiltinEngine,
  CustomEngine,
  CustomStrategyConfig,
  StrategyFactoryMap,
  MockConfig,
  PostgresConfig,
  MongoConfig,
} from "./types";
import { MockDatabaseStrategy } from "./strategies/mock/MockDatabaseStrategy";
import { PostgresStrategy } from "./strategies/postgres/PostgresStrategy";
import { MongoStrategy } from "./strategies/mongo/MongoStrategy";

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
    engine: CustomEngine,
    config: any
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
    config: MockConfig | PostgresConfig | MongoConfig
  ): Promise<IDatabaseStrategy> {
    switch (engine) {
      case "mock": {
        const factory = this.builtinStrategies["mock"];
        const typedConfig = config as MockConfig;
        const instance = factory(typedConfig, this.dbLogger);
        await instance.ready;
        this.dbLogger?.info({ engine }, "Initialized mock database");
        return instance;
      }

      case "postgres": {
        const factory = this.builtinStrategies["postgres"];
        const typedConfig = config as PostgresConfig;
        const instance = factory(typedConfig, this.dbLogger);
        await instance.ready;
        this.dbLogger?.info({ engine }, "Initialized postgres database");
        return instance;
      }

      case "mongo": {
        const factory = this.builtinStrategies["mongo"];
        const typedConfig = config as MongoConfig;
        const instance = factory(typedConfig, this.dbLogger);
        await instance.ready;
        this.dbLogger?.info({ engine }, "Initialized mongo database");
        return instance;
      }

      default:
        throw new Error(`Unsupported built-in engine: ${engine}`);
    }
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

  static listEngines(): DatabaseEngine[] {
    return [
      ...(Object.keys(this.builtinStrategies) as BuiltinEngine[]),
      ...Array.from(this.customStrategies.keys()),
    ];
  }

  static getEngineConfigSchema(engine: DatabaseEngine): object | undefined {
    if (engine.startsWith("custom:")) {
      return this.customStrategies.get(engine as CustomEngine)?.configSchema;
    }

    const schemas: Record<BuiltinEngine, object> = {
      mock: {
        // schema for mock config
      },
      postgres: {
        // schema for postgres config
      },
      mongo: {
        // schema for mongo config
      },
    };

    return schemas[engine as BuiltinEngine];
  }
}
