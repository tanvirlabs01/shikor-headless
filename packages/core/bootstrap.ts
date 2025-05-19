// 🧠 This pulls in each strategy just once — which triggers schema registration
import "../core/database/strategies/postgres";
import "../core/database/strategies/mongo";
import "../core/database/strategies/sqlite";
import "../core/database/strategies/mock";

// Optional debug output to verify everything is registered
import { Config } from "../core/config/config";

const schemas = Config.getAllSchemas();
console.log("[Shikor] Registered schemas:", Object.keys(schemas));
console.dir(schemas, { depth: null });
