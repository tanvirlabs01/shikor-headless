import Database from "better-sqlite3";
import type { Logger } from "pino";
import type { IDatabaseStrategy } from "../../IDatabaseStrategy";
import fs from "node:fs";
import path from "node:path";

export class SqliteStrategy implements IDatabaseStrategy {
  private db!: Database.Database;
  public status: "connecting" | "ready" | "error" = "connecting";
  public ready: Promise<void>;

  constructor(
    private config: { filepath: string },
    private logger?: Logger
  ) {
    this.ready = this.connect();
    this.logger?.info({ module: "sqlite-db" }, "SqliteStrategy initialized");
  }
  public async connect(): Promise<void> {
    try {
      const dir = path.dirname(this.config.filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.config.filepath);
      this.status = "ready";
      this.logger?.info(
        { module: "sqlite-db" },
        `SQLite connected at ${this.config.filepath}`
      );
    } catch (error) {
      this.status = "error";
      this.logger?.error(
        { err: error, module: "sqlite-db" },
        "SQLite connection failed"
      );
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      this.db.close();
      this.status = "error";
      this.logger?.info("SQLite connection closed");
    } catch (error) {
      this.logger?.error({ err: error }, "SQLite disconnect failed");
      throw error;
    }
  }

  public async create(table: string, data: any): Promise<any> {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...Object.values(data));
    this.logger?.info({ table, data }, "SQLite insert");
    return data;
  }

  public async read(table: string, query: any): Promise<any[]> {
    const keys = Object.keys(query);
    const where = keys.length
      ? `WHERE ${keys.map((k) => `${k} = ?`).join(" AND ")}`
      : "";
    const sql = `SELECT * FROM ${table} ${where}`;
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...Object.values(query));
    return rows;
  }

  public async update(table: string, query: any, data: any): Promise<any> {
    const set = Object.keys(data)
      .map((k) => `${k} = ?`)
      .join(", ");
    const where = Object.keys(query)
      .map((k) => `${k} = ?`)
      .join(" AND ");
    const sql = `UPDATE ${table} SET ${set} WHERE ${where}`;
    this.db.prepare(sql).run(...Object.values(data), ...Object.values(query));
    this.logger?.info({ table, query, data }, "SQLite update");
    return data;
  }

  public async delete(table: string, query: any): Promise<any> {
    const where = Object.keys(query)
      .map((k) => `${k} = ?`)
      .join(" AND ");
    const sql = `DELETE FROM ${table} WHERE ${where}`;
    this.db.prepare(sql).run(...Object.values(query));
    this.logger?.info({ table, query }, "SQLite delete");
    return query;
  }

  public async healthCheck(): Promise<{ ok: boolean; latency: number }> {
    const start = Date.now();
    try {
      this.db.prepare("SELECT 1").get();
      return { ok: true, latency: Date.now() - start };
    } catch (error) {
      return { ok: false, latency: Date.now() - start };
    }
  }

  public on(event: "connect" | "disconnect", listener: () => void): void {
    if (event === "connect" && this.status === "ready") listener();
    if (event === "disconnect" && this.status === "error") listener();
  }

  public async executeRaw(sql: string, params?: any[]): Promise<any> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params || []));
  }
}
