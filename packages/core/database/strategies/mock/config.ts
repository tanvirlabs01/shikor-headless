import { ModuleConfigSchema } from "../../../config/types";

export const MockConfigSchema: ModuleConfigSchema = {
  enableLogging: {
    key: "enableLogging",
    type: "boolean",
    default: false,
    description: "Enable mock DB query logging",
    environments: ["development"],
    group: "debug",
  },
};
