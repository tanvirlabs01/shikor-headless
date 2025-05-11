import { DatabaseStrategyFactory } from "@shikor/core/database";
import { MockDatabaseStrategy } from "@shikor/core/database/strategies/mock/MockDatabaseStrategy";

export default function registerCustomEngines() {
  console.log("✅ Custom engines registration started");

  DatabaseStrategyFactory.registerCustomEngine("custom:mockTest", {
    strategyClass: MockDatabaseStrategy,
    configValidator: (config) => {
      if (!config.testMode) {
        throw new Error("Missing testMode flag in config");
      }
    },
  });

  console.log("✅ Custom engines registered successfully");
}
