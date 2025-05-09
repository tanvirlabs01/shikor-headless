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
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  APP_NAME: z.string().default("shikor-core"),
  HOSTNAME: z.string().default(os.hostname()),
  DATABASE_URL: z.string().url().optional(),
  SECRET_KEY: z.string().min(32),
  PORT: z.coerce.number().default(3000),
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
