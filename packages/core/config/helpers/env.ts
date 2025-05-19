import { Config } from "../config";

export function getDatabaseConfigFromEnv(
  engine: "postgres" | "mongo" | "sqlite" | "mock"
) {
  const schema = Config.getModuleSchema(engine);
  if (!schema) throw new Error(`Schema not found for ${engine}`);

  const config: Record<string, any> = {};

  for (const [key, field] of Object.entries(schema)) {
    const envKey = field.envVar;
    const rawValue = envKey && process.env[envKey];

    if (rawValue !== undefined) {
      switch (field.type) {
        case "number":
          config[key] = Number(rawValue);
          break;
        case "boolean":
          config[key] = rawValue === "true";
          break;
        case "secret":
        case "string":
        case "custom":
        default:
          config[key] = rawValue;
          break;
      }
    } else if (field.default !== undefined) {
      config[key] = field.default;
    } else {
      config[key] = undefined;
    }
  }

  return config;
}
//const config = getDatabaseConfigFromEnv("postgres");
//const db = await DatabaseStrategyFactory.create("postgres", config);
