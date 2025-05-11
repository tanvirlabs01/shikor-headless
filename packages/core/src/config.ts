import dotenv from "dotenv";
import { z } from "zod";
import os from "os";
import path from "path";
import { bootstrapLogger } from "./telemetry/bootstrapLogger";

// Always load global .env first
dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

// Then override with environment-specific .env
dotenv.config({
  path: `.env.${process.env.NODE_ENV || "production"}`,
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().default(3000),
  APP_NAME: z.string().default("shikor-cms"),
  HOSTNAME: z.string().default(os.hostname),
  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Security
  SECRET_KEY: z.string().min(32),

  // Database setup
  DB_ENGINE: z.string(),

  MONGO_URL: z.string().optional(),

  POSTGRES_HOST: z.string().optional(),
  POSTGRES_PORT: z.coerce.number().optional(),
  POSTGRES_USER: z.string().optional(),
  POSTGRES_PASSWORD: z.string().optional(),
  POSTGRES_DB: z.string().optional(),
  POSTGRES_SSL: z.string().optional(),
  POSTGRES_POOL_SIZE: z.coerce.number().optional(),
  POSTGRES_IDLE_TIMEOUT: z.coerce.number().optional(),

  MYSQL_URL: z.string().optional(),

  // Bring Your Own DB feature flag
  ENABLE_BYODB: z.string().default("false"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const errorFields = parsedEnv.error.flatten().fieldErrors;
  bootstrapLogger.fatal(
    { errors: errorFields },
    "❌ Invalid environment variables"
  );
  process.exit(1);
}

export const env = {
  ...parsedEnv.data,
  isProd: parsedEnv.data.NODE_ENV === "production",
  isDev: parsedEnv.data.NODE_ENV === "development",
  isTest: parsedEnv.data.NODE_ENV === "test",
};
