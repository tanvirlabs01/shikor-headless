// /packages/core/database/IDatabaseStrategy.ts
import { QueryOptions } from "./types/QueryOptions";
export type ConnectionStatus = "connecting" | "ready" | "error";
export interface IDatabaseStrategy {
  ready: Promise<void>;
  status: ConnectionStatus;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  create(collection: string, data: any): Promise<any>;
  read(collection: string, query: any, options?: QueryOptions): Promise<any>;
  update(collection: string, query: any, data: any): Promise<any>;
  delete(collection: string, query: any): Promise<any>;

  healthCheck(): Promise<{ ok: boolean; latency: number }>;
  on(event: "connect" | "disconnect", listener: () => void): void;
}
