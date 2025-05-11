import { Pool, PoolClient, QueryResult } from "pg";
import { EventEmitter } from "events";
import type { Logger } from "pino";
import { IDatabaseStrategy } from "../../IDatabaseStrategy";

type QueryOptions = {
  timeout?: number;
  transaction?: PoolClient;
};

export class PostgresStrategy implements IDatabaseStrategy {
  private pool: Pool;
  private connectionPromise?: Promise<void>;
  private emitter = new EventEmitter();
  private retryCount = 0;
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
      connectionTimeout?: number;
      maxRetries?: number;
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
      connectionTimeoutMillis: this.config.connectionTimeout || 5000,
    });

    this.pool.on("error", (err) => {
      this.logger?.error({ err, module: "database" }, "PostgreSQL pool error");
      this.status = "error";
      this.emitter.emit("disconnect");
    });
  }

  // Public interface methods
  public get ready(): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connectWithRetry();
    }
    return this.connectionPromise;
  }

  public async connect(): Promise<void> {
    return this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    try {
      this.status = "connecting";
      const client = await this.pool.connect();

      // Validate connection
      await client.query("SELECT 1");
      await this.validateDatabaseVersion(client);

      client.release();
      this.status = "ready";
      this.retryCount = 0;
      this.logger?.info(
        { module: "database" },
        "PostgreSQL connected successfully"
      );
      this.emitter.emit("connect");
    } catch (error) {
      if (this.retryCount < (this.config.maxRetries ?? 3)) {
        this.retryCount++;
        const delay = Math.pow(2, this.retryCount) * 100;
        this.logger?.warn(
          { err: error, attempt: this.retryCount, delay },
          "PostgreSQL connection failed, retrying..."
        );
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

  private async validateDatabaseVersion(client: PoolClient): Promise<void> {
    const { rows } = await client.query("SHOW server_version");
    this.logger?.debug(
      { version: rows[0].server_version, module: "database" },
      "Database version check"
    );
  }

  public async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.status = "error";
      this.connectionPromise = undefined;
      this.emitter.emit("disconnect");
      this.logger?.info({ module: "database" }, "PostgreSQL disconnected");
    } catch (error) {
      this.logger?.error(
        { err: error, module: "database" },
        "PostgreSQL disconnection failed"
      );
      throw error;
    }
  }

  // CRUD Operations with Type Safety
  public async create<T = any>(table: string, data: Partial<T>): Promise<T> {
    const sql = `INSERT INTO ${this.sanitizeIdentifier(table)} (${Object.keys(
      data
    )
      .map((k) => this.sanitizeIdentifier(k))
      .join(", ")}) VALUES (${Object.keys(data)
      .map((_, i) => `$${i + 1}`)
      .join(", ")}) RETURNING *`;

    const result = await this.queryWithLog<T>(sql, Object.values(data));
    return result.rows[0];
  }

  public async createBulk<T = any>(
    table: string,
    items: Partial<T>[]
  ): Promise<T[]> {
    if (items.length === 0) return [];

    const keys = Object.keys(items[0]);
    const values = items.flatMap((item) => Object.values(item));
    const placeholders = items
      .map(
        (_, i) =>
          `(${keys.map((_, j) => `$${i * keys.length + j + 1}`).join(", ")})`
      )
      .join(", ");

    const sql = `INSERT INTO ${this.sanitizeIdentifier(table)} (${keys.map((k) => this.sanitizeIdentifier(k)).join(", ")}) 
                VALUES ${placeholders} RETURNING *`;
    const result = await this.queryWithLog<T>(sql, values);
    return result.rows;
  }

  public async read<T = any>(
    table: string,
    queryObj: Record<string, any> = {},
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDirection?: "ASC" | "DESC";
      fields?: string[];
    }
  ): Promise<T[]> {
    const keys = Object.keys(queryObj);
    const values = Object.values(queryObj);
    const fields =
      options?.fields?.map((f) => this.sanitizeIdentifier(f)).join(", ") || "*";

    let sql = `SELECT ${fields} FROM ${this.sanitizeIdentifier(table)}`;

    if (keys.length) {
      sql += ` WHERE ${keys.map((k, i) => `${this.sanitizeIdentifier(k)} = $${i + 1}`).join(" AND ")}`;
    }

    if (options?.orderBy) {
      sql += ` ORDER BY ${this.sanitizeIdentifier(options.orderBy)} ${options.orderDirection || "ASC"}`;
    }

    if (options?.limit) {
      values.push(options.limit);
      sql += ` LIMIT $${values.length}`;
    }

    if (options?.offset) {
      values.push(options.offset);
      sql += ` OFFSET $${values.length}`;
    }

    const result = await this.queryWithLog<T>(sql, values);
    return result.rows;
  }

  public async update<T = any>(
    table: string,
    queryObj: Record<string, any>,
    data: Partial<T>
  ): Promise<T> {
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
    const result = await this.queryWithLog<T>(sql, values);
    return result.rows[0];
  }

  public async delete<T = any>(
    table: string,
    queryObj: Record<string, any>
  ): Promise<T> {
    const keys = Object.keys(queryObj);
    const values = Object.values(queryObj);

    const whereClause = keys
      .map((k, i) => `${this.sanitizeIdentifier(k)} = $${i + 1}`)
      .join(" AND ");

    const sql = `DELETE FROM ${this.sanitizeIdentifier(table)} WHERE ${whereClause} RETURNING *`;
    const result = await this.queryWithLog<T>(sql, values);
    return result.rows[0];
  }

  // Transaction Support
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

  // Health Monitoring
  public async healthCheck(): Promise<{
    ok: boolean;
    latency: number;
    details?: {
      version?: string;
      activeConnections?: number;
      poolStatus?: {
        total: number;
        idle: number;
        waiting: number;
      };
    };
  }> {
    const start = Date.now();
    try {
      const client = await this.pool.connect();
      try {
        const [pingResult, versionResult, activityResult] = await Promise.all([
          client.query("SELECT 1"),
          client.query("SHOW server_version"),
          client.query(
            "SELECT COUNT(*) AS active FROM pg_stat_activity WHERE pid <> pg_backend_pid()"
          ),
        ]);

        return {
          ok: true,
          latency: Date.now() - start,
          details: {
            version: versionResult.rows[0].server_version,
            activeConnections: activityResult.rows[0].active,
            poolStatus: this.getPoolMetrics(),
          },
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        ok: false,
        latency: Date.now() - start,
      };
    }
  }

  public getPoolMetrics() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  // Event Handling
  public on(event: "connect" | "disconnect", listener: () => void): void {
    this.emitter.on(event, listener);
  }

  // Raw SQL Execution
  public async executeRaw<T = any>(
    sql: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    return this.queryWithLog<T>(sql, params, options);
  }

  // Internal Methods
  private async queryWithLog<T = any>(
    sql: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    const { timeout = 5000, transaction } = options || {};

    try {
      const client = transaction || (await this.pool.connect());
      try {
        await client.query(`SET LOCAL statement_timeout = ${timeout}`);
        const result = await client.query(sql, params);
        const duration = Date.now() - start;

        this.logger?.debug(
          {
            sql,
            params,
            duration,
            module: "database",
          },
          "Query executed"
        );

        return result;
      } finally {
        if (!transaction) client.release();
      }
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

  // Cleanup
  public async destroy() {
    this.emitter.removeAllListeners();
    await this.disconnect();
  }
}
