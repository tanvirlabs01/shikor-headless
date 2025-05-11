import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseStrategyFactory } from "./DatabaseStrategyFactory";
import { MockDatabaseStrategy } from "./strategies/mock/MockDatabaseStrategy";

describe("DatabaseStrategyFactory", () => {
  const logger = vi.fn();

  beforeEach(() => {
    DatabaseStrategyFactory.setLogger(logger);
    (DatabaseStrategyFactory as any).customStrategies.clear();
  });

  it("should create built-in mock strategy", async () => {
    const strategy = await DatabaseStrategyFactory.create("mock", {});
    expect(strategy).toBeInstanceOf(MockDatabaseStrategy);
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("Initialized built-in engine")
    );
  });

  it("should register and create a custom engine", async () => {
    DatabaseStrategyFactory.registerCustomEngine("custom:test", {
      strategyClass: MockDatabaseStrategy,
    });
    const strategy = await DatabaseStrategyFactory.create("custom:test", {});
    expect(strategy).toBeInstanceOf(MockDatabaseStrategy);
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("Registered custom engine")
    );
  });

  it("should throw for unknown engine", async () => {
    await expect(
      DatabaseStrategyFactory.create("nonexistent" as any, {})
    ).rejects.toThrow();
  });
});
