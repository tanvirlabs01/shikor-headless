import { Config } from "../../../config/config";
import { MockConfigSchema } from "./config";

Config.registerModuleSchema("mock", MockConfigSchema);
