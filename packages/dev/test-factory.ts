import { DatabaseStrategyFactory } from "@shikor/core/database";
import { MockDatabaseStrategy } from "@shikor/core/database/strategies/mock/MockDatabaseStrategy";

async function main() {
  DatabaseStrategyFactory.setLogger((msg) =>
    console.log(`[DB Factory]: ${msg}`)
  );

  console.log(
    "Before registering custom engines:",
    DatabaseStrategyFactory.listEngines()
  );

  DatabaseStrategyFactory.registerCustomEngine("custom:mockTest", {
    strategyClass: MockDatabaseStrategy,
    configValidator: (config) => {
      if (!config.testMode) throw new Error("Missing testMode flag in config");
    },
  });

  console.log(
    "After registering custom engines:",
    DatabaseStrategyFactory.listEngines()
  );

  const builtinMock = await DatabaseStrategyFactory.create("mock", {});
  await builtinMock.create("users", { name: "Alice" });
  const users = await builtinMock.read("users", {});
  console.log("Built-in mock users:", users);

  const customMock = await DatabaseStrategyFactory.create("custom:mockTest", {
    testMode: true,
  });
  await customMock.create("users", { name: "Bob" });
  const customUsers = await customMock.read("users", {});
  console.log("Custom mock users:", customUsers);

  await builtinMock.disconnect();
  await customMock.disconnect();
  console.log("✅ All strategies disconnected cleanly");
}

main().catch((err) => {
  console.error("❌ Error in test script:", err);
  process.exit(1);
});
