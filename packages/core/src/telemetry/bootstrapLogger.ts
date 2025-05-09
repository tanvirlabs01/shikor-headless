// packages/core/src/telemetry/bootstrapLogger.ts
import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

export const bootstrapLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
});
