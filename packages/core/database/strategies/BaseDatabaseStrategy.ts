// packages/core/database/strategies/BaseDatabaseStrategy.ts

import { IDatabaseStrategy } from "../IDatabaseStrategy";
import { QueryOptions } from "../types/QueryOptions";

export abstract class BaseDatabaseStrategy implements IDatabaseStrategy {
  abstract ready: Promise<void>;
  abstract status: "connecting" | "ready" | "error";

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  abstract create(collection: string, data: any): Promise<any>;
  abstract read(
    collection: string,
    query: any,
    options?: QueryOptions
  ): Promise<any>;
  abstract update(collection: string, query: any, data: any): Promise<any>;
  abstract delete(collection: string, query: any): Promise<any>;

  abstract healthCheck(): Promise<{ ok: boolean; latency: number }>;

  abstract on(event: "connect" | "disconnect", listener: () => void): void;

  protected validateQueryOptions(options?: QueryOptions): void {
    if (!options) return;

    if (options.limit && (options.limit < 0 || options.limit > 1000)) {
      throw new Error("Invalid limit: must be between 0 and 1000");
    }

    if (options.offset && options.offset < 0) {
      throw new Error("Invalid offset: must be >= 0");
    }

    if (options.sort) {
      const { field, order } = options.sort;
      if (!field || !["asc", "desc"].includes(order)) {
        throw new Error("Invalid sort options");
      }
    }
  }
}
