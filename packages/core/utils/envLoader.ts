// packages/core/utils/envLoader.ts
import type { ConfigFieldDefinition } from "../config/types";

export function loadEnvConfigValue(def: ConfigFieldDefinition): string {
  if (!def.envVar) {
    throw new Error(
      `Missing 'envVar' in config definition for key: ${def.key}`
    );
  }

  const val = process.env[def.envVar];

  if (val !== undefined) return val;

  if (def.default !== undefined) return def.default;

  throw new Error(
    `Missing environment variable '${def.envVar}' and no default provided for '${def.key}'`
  );
}
