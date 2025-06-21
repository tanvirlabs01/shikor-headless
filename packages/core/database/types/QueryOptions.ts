export interface QueryOptions {
  sort?: {
    field: string;
    order?: "asc" | "desc";
  };
  limit?: number;
  offset?: number;

  or?: { field: string; value: any }[]; // ✅ Add this
}
