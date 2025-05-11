import type { Logger } from "pino";
import { IDatabaseStrategy } from "../../IDatabaseStrategy";

export class MockDatabaseStrategy implements IDatabaseStrategy {
  private db: Record<string, any[]> = {};
  public status: "ready" = "ready";
  public ready = Promise.resolve();

  constructor(
    private config: Record<string, any>,
    private logger?: Logger
  ) {
    this.logger?.info(
      { module: "mock-db" },
      "MockDatabaseStrategy initialized"
    );
  }

  async connect(): Promise<void> {
    this.logger?.info({ module: "mock-db" }, "Mock database connect() called");
  }

  async create(table: string, data: any) {
    if (!this.db[table]) this.db[table] = [];
    const item = { ...data, id: this.db[table].length + 1 };
    this.db[table].push(item);
    this.logger?.info({ table, data: item, module: "mock-db" }, "Mock create");
    return item;
  }

  async read(table: string, query: any) {
    const result = (this.db[table] || []).filter((item) =>
      Object.keys(query).every((key) => item[key] === query[key])
    );
    this.logger?.info({ table, query, result, module: "mock-db" }, "Mock read");
    return result;
  }

  async update(table: string, query: any, data: any) {
    const items = await this.read(table, query);
    const updated = items.map((item) => Object.assign(item, data));
    this.logger?.info({ table, updated, module: "mock-db" }, "Mock update");
    return updated;
  }

  async delete(table: string, query: any) {
    const items = await this.read(table, query);
    this.db[table] = (this.db[table] || []).filter(
      (item) => !items.includes(item)
    );
    this.logger?.info(
      { table, deleted: items, module: "mock-db" },
      "Mock delete"
    );
    return items;
  }

  async healthCheck() {
    this.logger?.info({ module: "mock-db" }, "Mock health check OK");
    return { ok: true, latency: 0 };
  }

  async disconnect() {
    this.logger?.info({ module: "mock-db" }, "Mock database disconnected");
  }

  on(event: "connect" | "disconnect", listener: () => void) {
    listener();
  }
}
