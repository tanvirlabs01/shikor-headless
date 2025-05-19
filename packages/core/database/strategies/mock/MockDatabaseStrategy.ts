// packages/core/database/strategies/mock/MockDatabaseStrategy.ts

import type { Logger } from "pino";
import { BaseDatabaseStrategy } from "../BaseDatabaseStrategy";
import type { QueryOptions } from "../../types/QueryOptions";
import type { ConnectionStatus } from "../../IDatabaseStrategy";
import { Config } from "../../../config/config";
import { MockConfigSchema } from "./config";

Config.registerModuleSchema("mock", MockConfigSchema);

// Your MockDatabaseStrategy implementation below...

export class MockDatabaseStrategy extends BaseDatabaseStrategy {
  private db: Record<string, any[]> = {};
  public status: ConnectionStatus = "ready";
  public ready: Promise<void> = Promise.resolve();

  constructor(
    private config: Record<string, any> = {},
    private logger?: Logger
  ) {
    super();
    this.logger?.info(
      { module: "mock-db" },
      "MockDatabaseStrategy initialized"
    );
  }

  async connect(): Promise<void> {
    this.logger?.info({ module: "mock-db" }, "Mock database connect() called");
  }

  async disconnect(): Promise<void> {
    this.logger?.info({ module: "mock-db" }, "Mock database disconnected");
  }

  async create(collection: string, data: any): Promise<any> {
    if (!this.db[collection]) this.db[collection] = [];

    const item = { ...data, id: this.db[collection].length + 1 };
    this.db[collection].push(item);

    this.logger?.info(
      { collection, data: item, module: "mock-db" },
      "Mock create"
    );
    return item;
  }

  async read(
    collection: string,
    query: any = {},
    options: QueryOptions = {}
  ): Promise<any> {
    this.validateQueryOptions(options);

    let results = [...(this.db[collection] || [])].filter((item) =>
      Object.keys(query).every((key) => item[key] === query[key])
    );

    if (options.sort) {
      const { field, order } = options.sort;
      results.sort((a, b) =>
        a[field] < b[field]
          ? order === "asc"
            ? -1
            : 1
          : a[field] > b[field]
            ? order === "asc"
              ? 1
              : -1
            : 0
      );
    }

    if (typeof options.offset === "number") {
      results = results.slice(options.offset);
    }

    if (typeof options.limit === "number") {
      results = results.slice(0, options.limit);
    }

    this.logger?.info(
      { collection, query, options, result: results, module: "mock-db" },
      "Mock read"
    );
    return results;
  }

  async update(collection: string, query: any, data: any): Promise<any> {
    const items = await this.read(collection, query);
    const updated = items.map((item) => Object.assign(item, data));

    this.logger?.info(
      { collection, updated, module: "mock-db" },
      "Mock update"
    );
    return updated;
  }

  async delete(collection: string, query: any): Promise<any> {
    const items = await this.read(collection, query);
    this.db[collection] = (this.db[collection] || []).filter(
      (item) => !items.includes(item)
    );

    this.logger?.info(
      { collection, deleted: items, module: "mock-db" },
      "Mock delete"
    );
    return items;
  }

  async healthCheck(): Promise<{ ok: boolean; latency: number }> {
    this.logger?.info({ module: "mock-db" }, "Mock health check OK");
    return { ok: true, latency: 0 };
  }

  on(event: "connect" | "disconnect", listener: () => void): void {
    // This is a no-op in mock, but you can simulate if needed
    listener();
  }
}
