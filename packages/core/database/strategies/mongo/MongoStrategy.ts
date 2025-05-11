// File: packages/core/database/strategies/mongo/MongoStrategy.ts
import {
  MongoClient,
  Db,
  ObjectId,
  Filter,
  WithId,
  OptionalUnlessRequiredId,
  Document,
} from "mongodb";
import type { IDatabaseStrategy } from "../../IDatabaseStrategy";
import type { Logger } from "pino";

export type MongoConfig = {
  connectionString: string;
  dbName?: string;
  connectTimeoutMS?: number;
  maxRetries?: number;
};

export class MongoStrategy implements IDatabaseStrategy {
  private client!: MongoClient;
  private db!: Db;
  private connectionPromise?: Promise<void>;
  private listeners: Record<string, (() => void)[]> = {
    connect: [],
    disconnect: [],
  };
  private retryCount = 0;
  public status: "connecting" | "ready" | "error" = "connecting";

  constructor(
    private config: MongoConfig,
    private logger?: Logger
  ) {
    this.config.maxRetries = this.config.maxRetries ?? 3;
    this.logger?.info({ module: "mongo-db" }, "MongoStrategy initialized");
  }

  // Public interface-compliant method
  public async connect(): Promise<void> {
    return this.connectWithRetry();
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
      this.emit("connect");
      this.logger?.info(
        { module: "mongo-db" },
        "MongoDB connected successfully"
      );
    } catch (error) {
      if (this.retryCount < (this.config.maxRetries ?? 3)) {
        this.retryCount++;
        const delay = Math.pow(2, this.retryCount) * 100;
        this.logger?.warn(
          { err: error, attempt: this.retryCount, delay },
          "MongoDB connection failed, retrying..."
        );
        await new Promise((res) => setTimeout(res, delay));
        return this.connectWithRetry();
      }

      this.status = "error";
      this.emit("disconnect");
      this.logger?.error(
        { err: error, module: "mongo-db" },
        "MongoDB connection failed after retries"
      );
      throw error;
    }
  }

  public get ready(): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connectWithRetry();
    }
    return this.connectionPromise;
  }

  private emit(event: "connect" | "disconnect") {
    this.listeners[event].forEach((listener) => listener());
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.status = "error";
        this.emit("disconnect");
        this.logger?.info({ module: "mongo-db" }, "MongoDB disconnected");
      }
    } catch (error) {
      this.logger?.error(
        { err: error, module: "mongo-db" },
        "MongoDB disconnect failed"
      );
      throw error;
    }
  }

  public async create<T extends Document>(
    collection: string,
    data: OptionalUnlessRequiredId<T>
  ): Promise<WithId<T>> {
    try {
      const result = await this.db.collection<T>(collection).insertOne(data);
      this.logger?.debug(
        { module: "mongo-db", collection, _id: result.insertedId },
        "Document created"
      );
      return { ...data, _id: result.insertedId } as WithId<T>;
    } catch (error) {
      this.logger?.error(
        { err: error, module: "mongo-db", collection },
        "Create operation failed"
      );
      throw error;
    }
  }

  public async read<T extends Document>(
    collection: string,
    query: Filter<T> = {}
  ): Promise<WithId<T>[]> {
    try {
      const result = await this.db
        .collection<T>(collection)
        .find(query)
        .toArray();
      this.logger?.debug(
        { module: "mongo-db", collection, count: result.length },
        "Documents fetched"
      );
      return result;
    } catch (error) {
      this.logger?.error(
        { err: error, module: "mongo-db", collection },
        "Read operation failed"
      );
      throw error;
    }
  }

  public async update<T extends Document>(
    collection: string,
    query: Filter<T>,
    data: Partial<T>
  ): Promise<number> {
    try {
      const result = await this.db
        .collection<T>(collection)
        .updateMany(query, { $set: data });
      this.logger?.debug(
        { module: "mongo-db", collection, modified: result.modifiedCount },
        "Documents updated"
      );
      return result.modifiedCount;
    } catch (error) {
      this.logger?.error(
        { err: error, module: "mongo-db", collection },
        "Update operation failed"
      );
      throw error;
    }
  }

  public async delete<T extends Document>(
    collection: string,
    query: Filter<T>
  ): Promise<number> {
    try {
      const result = await this.db.collection<T>(collection).deleteMany(query);
      this.logger?.debug(
        { module: "mongo-db", collection, deleted: result.deletedCount },
        "Documents deleted"
      );
      return result.deletedCount;
    } catch (error) {
      this.logger?.error(
        { err: error, module: "mongo-db", collection },
        "Delete operation failed"
      );
      throw error;
    }
  }

  public async healthCheck(): Promise<{ ok: boolean; latency: number }> {
    const start = Date.now();
    try {
      await this.db.command({ ping: 1 });
      if (this.config.dbName) {
        const dbs = await this.client.db().admin().listDatabases();
        if (!dbs.databases.some((db) => db.name === this.config.dbName)) {
          throw new Error(`Database ${this.config.dbName} not found`);
        }
      }
      return { ok: true, latency: Date.now() - start };
    } catch (error) {
      this.status = "error";
      this.logger?.error(
        { err: error, module: "mongo-db" },
        "MongoDB health check failed"
      );
      return { ok: false, latency: Date.now() - start };
    }
  }

  public on(event: "connect" | "disconnect", listener: () => void): void {
    this.listeners[event].push(listener);
  }
}
