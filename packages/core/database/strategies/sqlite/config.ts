import { ModuleConfigSchema } from "../../../config/types";

export const SqliteConfigSchema: ModuleConfigSchema = {
  filepath: {
    key: "filepath",
    type: "string",
    envVar: "SQLITE_PATH",
    default: "./data/sqlite.db",
    description: "SQLite DB file path",
    visibleTo: ["admin"],
    environments: ["development"],
    group: "database",
  },
};
