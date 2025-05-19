import { ModuleConfigSchema } from "../../../config/types";
export const PostgresConfigSchema: ModuleConfigSchema = {
  connectionString: {
    key: "connectionString",
    type: "string",
    envVar: "POSTGRES_URL",
    default: "postgres://localhost:5432/shikor",
    description: "Postgres DB connection string",
    visibleTo: ["admin"],
    environments: ["development", "production"],
    group: "database",
  },
};
