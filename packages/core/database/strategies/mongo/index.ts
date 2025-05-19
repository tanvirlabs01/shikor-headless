import { Config } from "../../../config/config";
import { MongoConfigSchema } from "./config";

Config.registerModuleSchema("mongo", MongoConfigSchema);
