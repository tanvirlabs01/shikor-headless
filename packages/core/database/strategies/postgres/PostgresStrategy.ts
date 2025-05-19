import { Pool, QueryResult } from "pg";
import { EventEmitter } from "events";
import type { Logger } from "pino";
import { z, ZodObject, ZodRawShape } from "zod";
import { BaseDatabaseStrategy } from "../BaseDatabaseStrategy";
import type { QueryOptions } from "../../types/QueryOptions";
import type { ConnectionStatus } from "../../IDatabaseStrategy";
import { Config } from "../../../config/config";
import { PostgresConfigSchema } from "./config";

Config.registerModuleSchema("postgres", PostgresConfigSchema);

// Your PostgresStrategy implementation below...

export class PostgresStrategy extends BaseDatabaseStrategy {
  private pool: Pool;
  private emitter = new EventEmitter();
  private schemas: Map<string, ZodObject<ZodRawShape>> = new Map();
  private retryCount = 0;

  public status: ConnectionStatus = "connecting";
  public ready: Promise<void> = Promise.resolve();

  constructor(
    private config: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      ssl?: boolean;
      poolSize?: number;
      idleTimeout?: number;
      connectionTimeout?: number;
      maxRetries?: number;
    },
    private logger?: Logger
  ) {
    super();
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl,
      max: config.poolSize || 10,
      idleTimeoutMillis: config.idleTimeout || 30000,
      connectionTimeoutMillis: config.connectionTimeout || 5000,
    });

    this.pool.on("error", (err) => {
      this.logger?.error({ err, module: "database" }, "PostgreSQL pool error");
      this.status = "error";
      this.emitter.emit("disconnect");
    });
  }

  public registerSchema<T>(table: string, schema: ZodObject<ZodRawShape>) {
    this.schemas.set(table, schema);
  }

  public async connect(): Promise<void> {
    this.ready = this.connectWithRetry();
    return this.ready;
  }

  private async connectWithRetry(): Promise<void> {
    try {
      this.status = "connecting";
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();
      this.status = "ready";
      this.retryCount = 0;
      this.emitter.emit("connect");
      this.logger?.info({ module: "database" }, "PostgreSQL connected");
    } catch (error) {
      if (this.retryCount < (this.config.maxRetries ?? 3)) {
        this.retryCount++;
        const delay = Math.pow(2, this.retryCount) * 100;
        await new Promise((res) => setTimeout(res, delay));
        return this.connectWithRetry();
      }
      this.status = "error";
      this.logger?.error(
        { err: error, module: "database" },
        "PostgreSQL connection failed after retries"
      );
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    await this.pool.end();
    this.status = "error";
    this.emitter.emit("disconnect");
    this.logger?.info({ module: "database" }, "PostgreSQL disconnected");
  }

  public async create<T>(table: string, data: Partial<T>): Promise<T> {
    this.validateSchema(table, data);

    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `
      INSERT INTO ${this.safeId(table)} (${keys.map(this.safeId).join(", ")})
      VALUES (${placeholders})
      RETURNING *`;
    const result = await this.query<T>(sql, values);
    return result.rows[0];
  }

  public async read<T>(
    table: string,
    queryObj: Record<string, any> = {},
    options: QueryOptions = {}
  ): Promise<T[]> {
    this.validateQueryOptions(options);

    const keys = Object.keys(queryObj);
    const values = Object.values(queryObj);

    let sql = `SELECT * FROM ${this.safeId(table)}`;
    if (keys.length) {
      sql += ` WHERE ${keys
        .map((k, i) => `${this.safeId(k)} = $${i + 1}`)
        .join(" AND ")}`;
    }

    if (options.sort) {
      sql += ` ORDER BY ${this.safeId(options.sort.field)} ${
        options.sort.order.toUpperCase() === "DESC" ? "DESC" : "ASC"
      }`;
    }

    if (typeof options.limit === "number") {
      values.push(options.limit);
      sql += ` LIMIT $${values.length}`;
    }

    if (typeof options.offset === "number") {
      values.push(options.offset);
      sql += ` OFFSET $${values.length}`;
    }

    const result = await this.query<T>(sql, values);
    return result.rows;
  }

  public async update<T>(
    table: string,
    queryObj: Record<string, any>,
    data: Partial<T>
  ): Promise<T> {
    this.validateSchema(table, data, true);

    const dataKeys = Object.keys(data);
    const queryKeys = Object.keys(queryObj);
    const values = [...Object.values(data), ...Object.values(queryObj)];

    const setClause = dataKeys
      .map((k, i) => `${this.safeId(k)} = $${i + 1}`)
      .join(", ");
    const whereClause = queryKeys
      .map((k, i) => `${this.safeId(k)} = $${i + dataKeys.length + 1}`)
      .join(" AND ");

    const sql = `UPDATE ${this.safeId(table)} SET ${setClause} WHERE ${whereClause} RETURNING *`;
    const result = await this.query<T>(sql, values);
    return result.rows[0];
  }

  public async delete<T = any>(
    table: string,
    queryObj: Record<string, any>
  ): Promise<T> {
    const keys = Object.keys(queryObj);
    const values = Object.values(queryObj);
    const whereClause = keys
      .map((k, i) => `${this.safeId(k)} = $${i + 1}`)
      .join(" AND ");

    const sql = `DELETE FROM ${this.safeId(table)} WHERE ${whereClause} RETURNING *`;
    const result = await this.query<T>(sql, values);
    return result.rows[0];
  }

  public async healthCheck(): Promise<{ ok: boolean; latency: number }> {
    const start = Date.now();
    try {
      const result = await this.pool.query("SELECT 1");
      if (result.rowCount !== 1) throw new Error("Bad ping result");
      return { ok: true, latency: Date.now() - start };
    } catch {
      this.status = "error";
      return { ok: false, latency: Date.now() - start };
    }
  }

  public on(event: "connect" | "disconnect", listener: () => void): void {
    this.emitter.on(event, listener);
  }

  private async query<T = any>(
    sql: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query(sql, params);
      this.logger?.debug(
        { sql, params, duration: Date.now() - start, module: "database" },
        "Query executed"
      );
      return result;
    } catch (error) {
      this.logger?.error(
        { sql, params, err: error, module: "database" },
        "Query failed"
      );
      throw error;
    }
  }

  private safeId(id: string): string {
    return `"${id.replace(/"/g, '""')}"`;
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
