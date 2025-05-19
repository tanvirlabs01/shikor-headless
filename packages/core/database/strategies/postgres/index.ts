import { Config } from "../../../config/config";
import { PostgresConfigSchema } from "./config";

Config.registerModuleSchema("postgres", PostgresConfigSchema);
