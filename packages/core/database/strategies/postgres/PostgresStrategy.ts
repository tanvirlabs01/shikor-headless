// packages/core/database/strategies/postgres/PostgresStrategy.ts
import { EventEmitter } from "events";
import type { Logger } from "pino";
import type { Knex } from "knex";
import { z, ZodObject, ZodRawShape } from "zod";
import { createKnexInstance } from "../../knex/createKnexInstance";
import { BaseDatabaseStrategy } from "../BaseDatabaseStrategy";
import { Config } from "../../../config/config";
import type { QueryOptions } from "../../types/QueryOptions";
import type { ConnectionStatus } from "../../IDatabaseStrategy";
import { PostgresConfigSchema } from "./PostgresConfig";
import { PostgresConfig } from "../../types";
import { QueryLogger } from "@shikor/core/database/utils/QueryLogger";
Config.registerModuleSchema("postgres", PostgresConfigSchema);

export class PostgresStrategy extends BaseDatabaseStrategy {
  private db!: Knex;
  private emitter = new EventEmitter();
  private schemas: Map<string, ZodObject<ZodRawShape>> = new Map();
  private retryCount = 0;

  public status: ConnectionStatus = "connecting";
  public ready: Promise<void> = Promise.resolve();

  constructor(
    private config: PostgresConfig,
    private logger?: Logger
  ) {
    super();

    const connectionString = config.connectionString!;
    this.db = createKnexInstance({
      client: "pg",
      connection: connectionString,
      debug: process.env.NODE_ENV === "development",
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
      await this.db.raw("SELECT 1");
      this.status = "ready";
      this.retryCount = 0;
      this.logger?.info(
        { module: "database" },
        "PostgreSQL connected via Knex"
      );
      this.emitter.emit("connect");
    } catch (error) {
      if (this.retryCount < 3) {
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
    await this.db.destroy();
    this.status = "error";
    this.emitter.emit("disconnect");
    this.logger?.info({ module: "database" }, "PostgreSQL disconnected");
  }

  public async create<T extends Record<string, unknown>>(
    table: string,
    data: Partial<T>
  ): Promise<T> {
    this.validateSchema?.(table, data);

    const dbData: Record<string, unknown> = { ...data };

    // 🔥 Hardcoded: JSON.stringify "fields"
    if (dbData.fields && typeof dbData.fields === "object") {
      dbData.fields = JSON.stringify(dbData.fields);
    }

    QueryLogger.logQuery("insert", table, dbData);

    const result = await (this.db(table)
      .insert(dbData)
      .returning("*") as unknown as Promise<T[]>);

    return result[0];
  }

  public async read<T extends Record<string, unknown>>(
    table: string,
    queryObj: Partial<T> = {},
    options: QueryOptions = {}
  ): Promise<T[]> {
    this.validateQueryOptions(options);

    let query = this.db<T>(table).where(queryObj);

    if (options.sort) {
      query = query.orderBy(
        options.sort.field as keyof T,
        options.sort.order ?? "asc"
      );
    }

    if (typeof options.limit === "number") {
      query = query.limit(options.limit);
    }

    if (typeof options.offset === "number") {
      query = query.offset(options.offset);
    }

    // Final cast to satisfy TypeScript without breaking safety
    return (await query) as T[];
  }

  public async update<T extends Record<string, unknown>>(
    table: string,
    queryObj: Partial<T>,
    data: Partial<T>
  ): Promise<T> {
    this.validateSchema(table, data, true);

    // Cast only the `.update()` input to an acceptable type
    const result = await (this.db<T>(table)
      .where(queryObj)
      .update(data as any) // 👈 safely isolated
      .returning("*") as Promise<T[]>);

    return result[0];
  }

  public async delete<T extends Record<string, unknown>>(
    table: string,
    queryObj: Partial<T>
  ): Promise<T> {
    const result = await this.db<T>(table)
      .where(queryObj)
      .delete()
      .returning("*");

    return result[0] as T;
  }

  public async healthCheck(): Promise<{ ok: boolean; latency: number }> {
    const start = Date.now();
    try {
      await this.db.raw("SELECT 1");
      return { ok: true, latency: Date.now() - start };
    } catch {
      this.status = "error";
      return { ok: false, latency: Date.now() - start };
    }
  }

  public on(event: "connect" | "disconnect", listener: () => void): void {
    this.emitter.on(event, listener);
  }

  private setupErrorHandling() {
    this.db.on("query-error", (err) => {
      this.status = "error";
      this.logger?.error({ err, module: "database" }, "Knex query error");
      this.emitter.emit("disconnect");
    });
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
  public getDb(): Knex {
    return this.db;
  }
}
