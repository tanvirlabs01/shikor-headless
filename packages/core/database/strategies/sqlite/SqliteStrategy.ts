import Database from "better-sqlite3";
import type { Logger } from "pino";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "events";
import { z, ZodObject, ZodRawShape } from "zod";

import { BaseDatabaseStrategy } from "../BaseDatabaseStrategy";
import type { ConnectionStatus } from "../../IDatabaseStrategy";
import type { QueryOptions } from "../../types/QueryOptions";
import { Config } from "../../../config/config";
import { SqliteConfigSchema } from "./config";

Config.registerModuleSchema("sqlite", SqliteConfigSchema);

// Your SqliteStrategy implementation below...

export class SqliteStrategy extends BaseDatabaseStrategy {
  private db!: Database.Database;
  private emitter = new EventEmitter();
  private schemas: Map<string, ZodObject<ZodRawShape>> = new Map();

  public status: ConnectionStatus = "connecting";
  public ready: Promise<void>;

  constructor(
    private config: { filepath: string },
    private logger?: Logger
  ) {
    super();
    this.ready = this.connect();
    this.logger?.info({ module: "sqlite-db" }, "SqliteStrategy initialized");
  }

  public registerSchema<T>(table: string, schema: ZodObject<ZodRawShape>) {
    this.schemas.set(table, schema);
  }

  public async connect(): Promise<void> {
    try {
      const dir = path.dirname(this.config.filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.config.filepath);
      this.status = "ready";
      this.emitter.emit("connect");
      this.logger?.info(
        { module: "sqlite-db" },
        `SQLite connected at ${this.config.filepath}`
      );
    } catch (error) {
      this.status = "error";
      this.emitter.emit("disconnect");
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
      this.emitter.emit("disconnect");
      this.logger?.info("SQLite connection closed");
    } catch (error) {
      this.logger?.error({ err: error }, "SQLite disconnect failed");
      throw error;
    }
  }

  public async create<T extends Record<string, any>>(
    table: string,
    data: T
  ): Promise<T> {
    this.validateSchema(table, data);

    const keys = Object.keys(data);
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...Object.values(data));
    this.logger?.info({ table, data }, "SQLite insert");
    return data;
  }

  public async read<T = any>(
    table: string,
    query: any = {},
    options: QueryOptions = {}
  ): Promise<T[]> {
    this.validateQueryOptions(options);

    const keys = Object.keys(query);
    const where = keys.length
      ? `WHERE ${keys.map((k) => `${k} = ?`).join(" AND ")}`
      : "";

    let sql = `SELECT * FROM ${table} ${where}`;

    if (options.sort) {
      sql += ` ORDER BY ${options.sort.field} ${options.sort.order.toUpperCase()}`;
    }

    if (typeof options.limit === "number") {
      sql += ` LIMIT ${options.limit}`;
    }

    if (typeof options.offset === "number") {
      sql += ` OFFSET ${options.offset}`;
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...Object.values(query));
    return rows;
  }

  public async update<T>(
    table: string,
    query: any,
    data: Partial<T>
  ): Promise<T> {
    this.validateSchema(table, data, true);

    const set = Object.keys(data)
      .map((k) => `${k} = ?`)
      .join(", ");
    const where = Object.keys(query)
      .map((k) => `${k} = ?`)
      .join(" AND ");
    const sql = `UPDATE ${table} SET ${set} WHERE ${where}`;
    this.db.prepare(sql).run(...Object.values(data), ...Object.values(query));
    this.logger?.info({ table, query, data }, "SQLite update");
    return data as T;
  }

  public async delete<T = any>(table: string, query: any): Promise<T> {
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
    this.emitter.on(event, listener);
  }

  public async executeRaw(sql: string, params?: any[]): Promise<any[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params || []));
  }

  private validateSchema(table: string, data: any, partial = false) {
    const schema = this.schemas.get(table);
    if (!schema) return;

    const result = partial
      ? schema.partial().safeParse(data)
      : schema.safeParse(data);

    if (!result.success) {
      throw new Error(`Schema validation failed: ${result.error.message}`);
    }
  }
}
