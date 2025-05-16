import {
  MongoClient,
  Db,
  Document,
  Filter,
  OptionalUnlessRequiredId,
  WithId,
} from "mongodb";
import { EventEmitter } from "events";
import { z, ZodSchema } from "zod";
import type { Logger } from "pino";
import { BaseDatabaseStrategy } from "../BaseDatabaseStrategy";
import type { QueryOptions } from "../../types/QueryOptions";
import type { ConnectionStatus } from "../../IDatabaseStrategy";
import { ZodObject, ZodRawShape } from "zod"; // 👈 add this to your imports

export type MongoConfig = {
  connectionString: string;
  dbName?: string;
  connectTimeoutMS?: number;
  maxRetries?: number;
};

export class MongoStrategy extends BaseDatabaseStrategy {
  private client!: MongoClient;
  private db!: Db;
  private retryCount = 0;
  private emitter = new EventEmitter();
  private schemas: Map<string, ZodSchema<any>> = new Map();

  public status: ConnectionStatus = "connecting";
  public ready: Promise<void> = Promise.resolve();

  constructor(
    private config: MongoConfig,
    private logger?: Logger
  ) {
    super();
    this.config.maxRetries = this.config.maxRetries ?? 3;
    this.logger?.info({ module: "mongo-db" }, "MongoStrategy initialized");
  }

  public registerSchema(collection: string, schema: ZodObject<ZodRawShape>) {
    this.schemas.set(collection, schema);
  }

  public async connect(): Promise<void> {
    this.ready = this.connectWithRetry();
    return this.ready;
  }

  private async connectWithRetry(): Promise<void> {
    try {
      this.status = "connecting";
      this.client = new MongoClient(this.config.connectionString, {
        connectTimeoutMS: this.config.connectTimeoutMS ?? 5000,
      });
      await this.client.connect();
      this.db = this.client.db(this.config.dbName);
      this.status = "ready";
      this.retryCount = 0;
      this.emitter.emit("connect");
      this.logger?.info(
        { module: "mongo-db" },
        "MongoDB connected successfully"
      );
    } catch (error) {
      if (this.retryCount < (this.config.maxRetries ?? 3)) {
        this.retryCount++;
        const delay = Math.pow(2, this.retryCount) * 100;
        await new Promise((res) => setTimeout(res, delay));
        return this.connectWithRetry();
      }
      this.status = "error";
      this.emitter.emit("disconnect");
      this.logger?.error(
        { err: error, module: "mongo-db" },
        "MongoDB connection failed after retries"
      );
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.status = "error";
      this.emitter.emit("disconnect");
      this.logger?.info({ module: "mongo-db" }, "MongoDB disconnected");
    }
  }

  public async create<T extends Document>(
    collection: string,
    data: OptionalUnlessRequiredId<T>
  ): Promise<WithId<T>> {
    this.validateSchema(collection, data);
    const result = await this.db.collection<T>(collection).insertOne(data);
    return { ...data, _id: result.insertedId } as WithId<T>;
  }

  public async read<T extends Document>(
    collection: string,
    query: Filter<T> = {},
    options: QueryOptions = {}
  ): Promise<WithId<T>[]> {
    this.validateQueryOptions(options);

    const cursor = this.db.collection<T>(collection).find(query);

    if (options.sort) {
      const sortOrder = options.sort.order === "desc" ? -1 : 1;
      cursor.sort({ [options.sort.field]: sortOrder });
    }

    if (typeof options.offset === "number") cursor.skip(options.offset);
    if (typeof options.limit === "number") cursor.limit(options.limit);

    return await cursor.toArray();
  }

  public async update<T extends Document>(
    collection: string,
    query: Filter<T>,
    data: Partial<T>
  ): Promise<number> {
    this.validateSchema(collection, data, true);
    const result = await this.db
      .collection<T>(collection)
      .updateMany(query, { $set: data });
    return result.modifiedCount;
  }

  public async delete<T extends Document>(
    collection: string,
    query: Filter<T>
  ): Promise<number> {
    const result = await this.db.collection<T>(collection).deleteMany(query);
    return result.deletedCount;
  }

  public async healthCheck(): Promise<{ ok: boolean; latency: number }> {
    const start = Date.now();
    try {
      await this.db.command({ ping: 1 });
      return { ok: true, latency: Date.now() - start };
    } catch (err) {
      this.status = "error";
      return { ok: false, latency: Date.now() - start };
    }
  }

  public on(event: "connect" | "disconnect", listener: () => void): void {
    this.emitter.on(event, listener);
  }

  private validateSchema(collection: string, data: any, partial = false) {
    const schema = this.schemas.get(collection);
    if (!schema) return;

    if (schema instanceof ZodObject) {
      const result = partial
        ? schema.partial().safeParse(data)
        : schema.safeParse(data);

      if (!result.success) {
        throw new Error(`Schema validation failed: ${result.error.message}`);
      }
    } else {
      throw new Error(
        `Registered schema for '${collection}' is not a ZodObject`
      );
    }
  }
}
