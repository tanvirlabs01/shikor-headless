import express, { Request, Response, NextFunction } from "express";
import cluster from "cluster";
import os from "os";
import helmet from "helmet";
import { logger, dbLogger } from "@shikor/core/src/telemetry/logger";
import { httpLogger } from "@shikor/core/src/utils/httpLogger";
import { env } from "@shikor/core/src/config";
import { DatabaseStrategyFactory } from "@shikor/core/database";
import { getDatabaseConfig } from "@shikor/core/database/utils/getDatabaseConfig";
import {
  PostgresConfig,
  MockConfig,
  MongoConfig,
  SqliteConfig,
} from "@shikor/core/database/types";

class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

const app = express();

// ======================
// Middleware
// ======================
app.use(helmet());
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use(httpLogger);

// Database check middleware (fixed)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.app.locals.db) {
    req.log.error("Database connection not initialized");
    res.status(503).json({
      error: "Service Unavailable",
      message: "Database not initialized",
      status: "degraded",
    });
    return;
  }
  next();
});

// ======================
// Routes
// ======================
app.get("/health", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = req.app.locals.db;
    const [dbHealth, diskHealth] = await Promise.all([
      db.healthCheck(),
      checkDiskSpace(),
    ]);

    const checks = {
      database: dbHealth.ok,
      diskSpace: diskHealth.ok,
      redis: true,
    };

    const isHealthy = Object.values(checks).every(Boolean);
    req.log.debug({ checks }, "Health check results");

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "ok" : "degraded",
      checks: {
        ...checks,
        databaseLatency: dbHealth.latency,
        diskFreeSpace: diskHealth.freeGB,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/debug", (req: Request, res: Response) => {
  req.log.debug("Debug info requested");
  res.status(200).json({
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    requestId: req.id,
    database: {
      type: process.env.DB_ENGINE,
      status: req.app.locals.db?.status,
    },
    system: {
      cpus: os.cpus().length,
      platform: os.platform(),
      arch: os.arch(),
    },
  });
});

app.get("/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const safeLimit = Math.min(Number(limit), 1000);
    const safeOffset = Math.max(Number(offset), 0);

    const users = await req.app.locals.db.read(
      "users",
      {},
      {
        limit: safeLimit,
        offset: safeOffset,
      }
    );

    res.json({
      data: users,
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        returned: users.length,
      },
    });
  } catch (error) {
    req.log.error(error, "Failed to fetch users");
    next(
      new AppError("Failed to fetch users", 500, {
        query: req.query,
        ...(env.isDev && {
          stack: error instanceof Error ? error.stack : undefined,
        }),
      })
    );
  }
});

app.post("/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      throw new AppError("Empty request body", 400);
    }

    const newUser = await req.app.locals.db.create("users", req.body);
    res.status(201).json(newUser);
  } catch (error) {
    req.log.error(error, "Failed to create user");
    next(
      new AppError("Failed to create user", 400, {
        ...(env.isDev && {
          details: error instanceof Error ? error.message : undefined,
        }),
      })
    );
  }
});

// ======================
// Error Handling
// ======================
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    req.log.error(
      {
        statusCode: err.statusCode,
        details: err.details,
        ...(env.isDev && { stack: err.stack }),
      },
      err.message
    );
  } else if (err instanceof Error) {
    req.log.error({ ...(env.isDev && { stack: err.stack }) }, err.message);
  } else {
    req.log.error("Unknown error type: %o", err);
  }

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const response = {
    error: err instanceof Error ? err.message : "Internal Server Error",
    requestId: req.id,
    timestamp: new Date().toISOString(),
    ...(env.isDev && {
      details: err instanceof AppError ? err.details : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    }),
  };

  res.status(statusCode).json(response);
});

// ======================
// Server Initialization
// ======================
const PORT = env.PORT || 3000;

async function initializeDatabase() {
  DatabaseStrategyFactory.setLogger(dbLogger);

  if (process.env.ENABLE_BYODB === "true") {
    try {
      const registerCustomEngines = (
        await import("@shikor/dev/register-custom-dbs")
      ).default;
      registerCustomEngines();
      dbLogger.info("Custom database engines registered");
    } catch (error) {
      dbLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to register custom database engines"
      );
    }
  }

  const engine = (process.env.DB_ENGINE || "mock") as
    | "mock"
    | "postgres"
    | "mongo"
    | "sqlite";
  const config = getDatabaseConfig(engine);

  dbLogger.info({ engine }, "Initializing database connection");

  try {
    let db;
    switch (engine) {
      case "mock":
        db = await DatabaseStrategyFactory.create("mock", config as MockConfig);
        break;
      case "postgres":
        db = await DatabaseStrategyFactory.create(
          "postgres",
          config as PostgresConfig
        );
        break;
      case "mongo":
        db = await DatabaseStrategyFactory.create(
          "mongo",
          config as MongoConfig
        );
        break;
      case "sqlite":
        db = await DatabaseStrategyFactory.create(
          "sqlite",
          config as SqliteConfig
        );
        break;
      default:
        throw new Error(`Unsupported database engine: ${engine}`);
    }

    dbLogger.info({ engine }, "Database connection established");
    return db;
  } catch (error) {
    dbLogger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Database initialization failed"
    );
    throw error;
  }
}

if (cluster.isPrimary && env.isProd) {
  const numCPUs = Math.min(os.cpus().length, 8);
  logger.info(`Master ${process.pid} starting ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    logger.debug(`Worker ${worker.process.pid} started`);
  }

  cluster.on("exit", (worker, code, signal) => {
    const message = `Worker ${worker.process.pid} died (${signal || code})`;
    logger.warn(message);
    logger.info("Restarting worker...");
    cluster.fork();
  });
} else {
  (async () => {
    try {
      const db = await initializeDatabase();
      app.locals.db = db;

      const server = app.listen(PORT, () => {
        logger.info(
          {
            pid: process.pid,
            port: PORT,
            dbEngine: process.env.DB_ENGINE,
            nodeEnv: env.NODE_ENV,
            version: process.env.npm_package_version,
          },
          `Application started`
        );
      });

      const shutdown = async () => {
        logger.info("Shutdown signal received");

        try {
          await db.disconnect();
          logger.info("Database connection closed");

          server.close(() => {
            logger.info("HTTP server closed");
            process.exit(0);
          });

          setTimeout(() => {
            logger.warn("Forcing shutdown");
            process.exit(1);
          }, 5000);
        } catch (error) {
          logger.error(
            error instanceof Error ? error : new Error(String(error)),
            "Error during shutdown"
          );
          process.exit(1);
        }
      };

      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
      process.on("unhandledRejection", (reason) => {
        logger.error(
          reason instanceof Error ? reason : new Error(String(reason)),
          "Unhandled Rejection"
        );
      });
      process.on("uncaughtException", (error) => {
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Uncaught Exception"
        );
        shutdown();
      });
    } catch (err) {
      logger.error(
        err instanceof Error ? err : new Error(String(err)),
        "Failed to start server"
      );
      process.exit(1);
    }
  })();
}

async function checkDiskSpace(): Promise<{
  ok: boolean;
  freeGB: number;
  totalGB: number;
}> {
  try {
    const disk = os.platform() === "win32" ? "c:" : "/";
    const stats = require("fs").statfsSync(disk);
    const freeGB = (stats.bfree * stats.bsize) / 1024 ** 3;
    const totalGB = (stats.blocks * stats.bsize) / 1024 ** 3;
    return {
      ok: freeGB > 5,
      freeGB: parseFloat(freeGB.toFixed(2)),
      totalGB: parseFloat(totalGB.toFixed(2)),
    };
  } catch (err) {
    logger.error(
      err instanceof Error ? err : new Error(String(err)),
      "Disk check failed"
    );
    return { ok: false, freeGB: 0, totalGB: 0 };
  }
}
