import { ModuleConfigSchema } from "../../../config/types";

export const MongoConfigSchema: ModuleConfigSchema = {
  uri: {
    key: "uri",
    type: "string",
    envVar: "MONGO_URL",
    default: "mongodb://localhost:27017",
    description: "MongoDB connection URI",
    visibleTo: ["admin"],
    environments: ["development", "production"],
    group: "database",
  },
};
