import pino, { Logger } from "pino";
import { env } from "../config";

const transports = {
  development: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "yyyy-mm-dd HH:MM:ss.l",
      ignore: "pid,hostname",
      singleLine: true,
    },
  },
  production: {
    targets: [
      {
        target: "pino/file",
        options: {
          destination: `/var/log/${env.APP_NAME}/app.log`,
          mkdir: true,
        },
      },
      {
        target: "pino/file",
        options: { destination: 1 }, // stdout
      },
    ],
  },
  test: {
    target: "pino/file",
    options: {
      destination: "./test.log",
      sync: true,
    },
  },
};

const baseConfig = {
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string) => ({ level: label.toUpperCase() }),
    bindings: () => ({
      app: env.APP_NAME,
      node: process.version,
      pid: process.pid,
      host: env.HOSTNAME,
    }),
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req: any) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      headers: {
        ...req.headers,
        authorization: req.headers?.authorization ? "**REDACTED**" : undefined,
      },
    }),
  },
  redact: {
    paths: ["password", "*.password", "*.token", "*.secret"],
    censor: "**REDACTED**",
  },
};

export function createLogger(context: object = {}): Logger {
  const envKey = env.isDev ? "development" : env.isTest ? "test" : "production";
  const logger = pino({
    ...baseConfig,
    transport: transports[envKey],
    ...context,
  });

  if (env.isProd) {
    process.on("SIGTERM", () => {
      logger.info("Flushing logs before shutdown...");
      logger.flush();
      process.exit(0);
    });
  }

  return logger;
}

export const logger = createLogger();
export const baseLogger = logger; // ✅ expose baseLogger

export const httpLogger = createLogger({ module: "http" });
export const dbLogger = createLogger({ module: "database" });

// ✅ request-scoped logger using .child()
export const createRequestLogger = (
  requestId: string,
  loggerInstance: Logger = baseLogger
): Logger => {
  return loggerInstance.child({ requestId });
};
