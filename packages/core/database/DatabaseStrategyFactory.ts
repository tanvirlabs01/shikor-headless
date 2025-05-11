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
} from "./types";
import { MockDatabaseStrategy } from "./strategies/mock/MockDatabaseStrategy";
import { PostgresStrategy } from "./strategies/postgres/PostgresStrategy";

export class DatabaseStrategyFactory {
  private static customStrategies = new Map<
    CustomEngine,
    CustomStrategyConfig
  >();
  private static dbLogger?: Logger;

  private static builtinStrategies: StrategyFactoryMap = {
    mock: (config, logger) => new MockDatabaseStrategy(config, logger),
    postgres: (config, logger) => new PostgresStrategy(config, logger),
  };

  static async create(
    engine: "mock",
    config: MockConfig
  ): Promise<MockDatabaseStrategy>;
  static async create(
    engine: "postgres",
    config: PostgresConfig
  ): Promise<PostgresStrategy>;
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
    const customConfig = this.customStrategies.get(engine);
    if (!customConfig) throw new Error(`Unregistered custom engine: ${engine}`);
    customConfig.configValidator?.(config as unknown);
    const instance = new customConfig.strategyClass(config, this.dbLogger);
    await instance.ready;
    this.dbLogger?.info(`Initialized custom engine: ${engine}`);
    return instance;
  }

  private static async createBuiltinStrategy<
    T extends keyof StrategyFactoryMap,
  >(
    engine: T,
    config: Parameters<StrategyFactoryMap[T]>[0]
  ): Promise<IDatabaseStrategy> {
    let instance: IDatabaseStrategy;

    if (engine === "mock") {
      const factory = this.builtinStrategies["mock"];
      instance = factory(config as MockConfig, this.dbLogger);
    } else if (engine === "postgres") {
      const factory = this.builtinStrategies["postgres"];
      instance = factory(config as PostgresConfig, this.dbLogger);
    } else {
      throw new Error(`Unsupported built-in engine: ${engine}`);
    }

    await instance.ready;
    this.dbLogger?.info(`Initialized built-in engine: ${engine}`);
    return instance;
  }

  static registerCustomEngine<T>(
    engine: CustomEngine,
    config: CustomStrategyConfig<T>
  ): void {
    if (!engine.startsWith("custom:"))
      throw new Error(
        `Custom engine must start with 'custom:', got '${engine}'`
      );
    this.customStrategies.set(engine, config);
    this.dbLogger?.info(`Registered custom engine: ${engine}`);
  }

  static hasEngine(engine: DatabaseEngine): boolean {
    return engine.startsWith("custom:")
      ? this.customStrategies.has(engine as CustomEngine)
      : engine in this.builtinStrategies;
  }

  static listEngines(): DatabaseEngine[] {
    const builtins = Object.keys(this.builtinStrategies) as BuiltinEngine[];
    const customs = Array.from(this.customStrategies.keys());
    return [...builtins, ...customs];
  }

  static setLogger(dbLogger: Logger): void {
    this.dbLogger = dbLogger;
  }
}
