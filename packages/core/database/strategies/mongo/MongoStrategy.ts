// File: packages/core/database/strategies/mongo/MongoStrategy.ts
import { MongoClient, Db } from "mongodb";
import type { IDatabaseStrategy } from "../../IDatabaseStrategy";
import type { Logger } from "pino";

export type MongoConfig = {
  connectionString: string;
  dbName?: string;
};

export class MongoStrategy implements IDatabaseStrategy {
  private client!: MongoClient;
  private db!: Db;
  private connectionPromise?: Promise<void>;
  public status: "connecting" | "ready" | "error" = "connecting";

  constructor(
    private config: MongoConfig,
    private logger?: Logger
  ) {
    this.logger?.info({ module: "mongo-db" }, "MongoStrategy initialized");
  }

  public get ready(): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connect();
    }
    return this.connectionPromise;
  }

  public async connect(): Promise<void> {
    try {
      this.status = "connecting";
      this.client = new MongoClient(this.config.connectionString);
      await this.client.connect();
      this.db = this.client.db(this.config.dbName);
      this.status = "ready";
      this.logger?.info(
        { module: "mongo-db" },
        "MongoDB connected successfully"
      );
    } catch (error) {
      this.status = "error";
      this.logger?.error(
        { err: error, module: "mongo-db" },
        "MongoDB connection failed"
      );
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    await this.client.close();
    this.status = "error";
    this.logger?.info({ module: "mongo-db" }, "MongoDB disconnected");
  }

  public async create(collection: string, data: any): Promise<any> {
    const result = await this.db.collection(collection).insertOne(data);
    return { ...data, _id: result.insertedId };
  }

  public async read(collection: string, query: any): Promise<any[]> {
    return this.db.collection(collection).find(query).toArray();
  }

  public async update(collection: string, query: any, data: any): Promise<any> {
    const result = await this.db
      .collection(collection)
      .updateMany(query, { $set: data });
    return result;
  }

  public async delete(collection: string, query: any): Promise<any> {
    return await this.db.collection(collection).deleteMany(query);
  }

  public async healthCheck(): Promise<{ ok: boolean; latency: number }> {
    const start = Date.now();
    try {
      await this.db.command({ ping: 1 });
      return { ok: true, latency: Date.now() - start };
    } catch (error) {
      this.logger?.error(
        { err: error, module: "mongo-db" },
        "MongoDB health check failed"
      );
      return { ok: false, latency: Date.now() - start };
    }
  }

  public on(event: "connect" | "disconnect", listener: () => void): void {
    // Not implemented for MongoDB
  }
}
