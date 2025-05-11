import { Pool, PoolClient, QueryResult } from "pg";
import { EventEmitter } from "events";
import type { Logger } from "pino";
import { IDatabaseStrategy } from "../../IDatabaseStrategy";

export class PostgresStrategy implements IDatabaseStrategy {
  private pool: Pool;
  private connectionPromise?: Promise<void>;
  private emitter = new EventEmitter();
  public status: "connecting" | "ready" | "error" = "connecting";

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
    },
    private logger?: Logger
  ) {
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      ssl: this.config.ssl,
      max: this.config.poolSize || 10,
      idleTimeoutMillis: this.config.idleTimeout || 30000,
    });

    this.pool.on("error", (err) => {
      this.logger?.error({ err, module: "database" }, "PostgreSQL pool error");
      this.status = "error";
    });
  }

  public get ready(): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connect();
    }
    return this.connectionPromise;
  }

  public async connect(): Promise<void> {
    if (this.status === "ready") return;

    this.status = "connecting";
    try {
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();
      this.status = "ready";
      this.logger?.info(
        { module: "database" },
        "PostgreSQL connected successfully"
      );
      this.emitter.emit("connect");
    } catch (error) {
      this.status = "error";
      this.logger?.error(
        { err: error, module: "database" },
        "PostgreSQL connection failed"
      );
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.emitter.emit("disconnect");
      this.status = "error";
      this.connectionPromise = undefined;
      this.logger?.info({ module: "database" }, "PostgreSQL disconnected");
    } catch (error) {
      this.logger?.error(
        { err: error, module: "database" },
        "PostgreSQL disconnection failed"
      );
      throw error;
    }
  }

  public async create(table: string, data: any): Promise<any> {
    const sql = `INSERT INTO ${this.sanitizeIdentifier(table)} (${Object.keys(
      data
    )
      .map((k) => this.sanitizeIdentifier(k))
      .join(", ")}) VALUES (${Object.keys(data)
      .map((_, i) => `$${i + 1}`)
      .join(", ")}) RETURNING *`;

    const result = await this.queryWithLog(sql, Object.values(data));
    return result.rows[0];
  }

  public async read(
    table: string,
    queryObj: any = {},
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      fields?: string[];
    }
  ): Promise<any[]> {
    const keys = Object.keys(queryObj);
    const values = Object.values(queryObj);
    const sanitizedTable = this.sanitizeIdentifier(table);
    const fields =
      options?.fields?.map((f) => this.sanitizeIdentifier(f)).join(", ") || "*";

    let sql = `SELECT ${fields} FROM ${sanitizedTable}`;
    if (keys.length) {
      sql += ` WHERE ${keys.map((k, i) => `${this.sanitizeIdentifier(k)} = $${i + 1}`).join(" AND ")}`;
    }
    if (options?.orderBy)
      sql += ` ORDER BY ${this.sanitizeIdentifier(options.orderBy)}`;
    if (options?.limit) {
      values.push(options.limit);
      sql += ` LIMIT $${values.length}`;
    }
    if (options?.offset) {
      values.push(options.offset);
      sql += ` OFFSET $${values.length}`;
    }

    const result = await this.queryWithLog(sql, values);
    return result.rows;
  }

  public async update(table: string, queryObj: any, data: any): Promise<any> {
    const dataKeys = Object.keys(data);
    const queryKeys = Object.keys(queryObj);
    const values = [...Object.values(data), ...Object.values(queryObj)];

    const setClause = dataKeys
      .map((k, i) => `${this.sanitizeIdentifier(k)} = $${i + 1}`)
      .join(", ");
    const whereClause = queryKeys
      .map(
        (k, i) => `${this.sanitizeIdentifier(k)} = $${i + dataKeys.length + 1}`
      )
      .join(" AND ");

    const sql = `UPDATE ${this.sanitizeIdentifier(table)} SET ${setClause} WHERE ${whereClause} RETURNING *`;
    const result = await this.queryWithLog(sql, values);
    return result.rows[0];
  }

  public async delete(table: string, queryObj: any): Promise<any> {
    const keys = Object.keys(queryObj);
    const values = Object.values(queryObj);

    const whereClause = keys
      .map((k, i) => `${this.sanitizeIdentifier(k)} = $${i + 1}`)
      .join(" AND ");

    const sql = `DELETE FROM ${this.sanitizeIdentifier(table)} WHERE ${whereClause} RETURNING *`;
    const result = await this.queryWithLog(sql, values);
    return result.rows[0];
  }

  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      this.logger?.info({ module: "database" }, "Transaction committed");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      this.logger?.error(
        { err: error, module: "database" },
        "Transaction rolled back"
      );
      throw error;
    } finally {
      client.release();
    }
  }

  public async healthCheck(): Promise<{ ok: boolean; latency: number }> {
    const start = Date.now();
    try {
      await this.query("SELECT 1", [], 1000);
      const latency = Date.now() - start;
      this.logger?.info({ latency, module: "database" }, "Health check passed");
      return { ok: true, latency };
    } catch (error) {
      const latency = Date.now() - start;
      this.logger?.error(
        { err: error, latency, module: "database" },
        "Health check failed"
      );
      return { ok: false, latency };
    }
  }

  public on(event: "connect" | "disconnect", listener: () => void): void {
    this.emitter.on(event, listener);
  }

  public async executeRaw(
    sql: string,
    params?: any[],
    timeout = 5000
  ): Promise<QueryResult> {
    return this.queryWithLog(sql, params, timeout);
  }

  private async query(
    sql: string,
    params?: any[],
    timeout = 5000
  ): Promise<QueryResult> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL statement_timeout = ${timeout}`);
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  private async queryWithLog(
    sql: string,
    params?: any[],
    timeout = 5000
  ): Promise<QueryResult> {
    const start = Date.now();
    try {
      const result = await this.query(sql, params, timeout);
      const duration = Date.now() - start;
      this.logger?.info(
        { sql, params, duration, module: "database" },
        "Query executed"
      );
      return result;
    } catch (error) {
      this.logger?.error(
        { sql, params, err: error, module: "database" },
        "Query error"
      );
      throw error;
    }
  }

  private sanitizeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
