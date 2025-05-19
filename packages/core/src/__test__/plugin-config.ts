// test/plugin-config.ts
import { Config } from "../../config/config";

Config.registerModuleSchema("ai", {
  api_key: {
    key: "api_key",
    type: "string",
    default: "",
    envVar: "AI_API_KEY",
    visibleTo: ["admin"],
  },
});

console.log(Config.getAllSchemas());
