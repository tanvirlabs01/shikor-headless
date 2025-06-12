import { Config } from "../../../config/config";
import { PostgresConfigSchema } from "./PostgresConfig";

Config.registerModuleSchema("postgres", PostgresConfigSchema);
