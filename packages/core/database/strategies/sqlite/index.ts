import { Config } from "../../../config/config";
import { SqliteConfigSchema } from "./config";

Config.registerModuleSchema("sqlite", SqliteConfigSchema);

// Your SqliteStrategy implementation below...
