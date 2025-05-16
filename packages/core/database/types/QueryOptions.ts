// packages/core/database/types/QueryOptions.ts
export type QueryOptions = {
  limit?: number;
  offset?: number;
  sort?: {
    field: string;
    order: "asc" | "desc";
  };
};
