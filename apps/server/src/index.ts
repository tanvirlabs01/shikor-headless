// server/index.ts
import express, { Request, Response, NextFunction } from "express";
import cluster from "cluster";
import os from "os";
import helmet from "helmet";
import { logger, dbLogger } from "@shikor/core/src/telemetry/logger";
import { httpLogger } from "@shikor/core/src/utils/httpLogger";
import { env } from "@shikor/core/src/config";
import "@shikor/core/database/strategies/postgres";
import "@shikor/core/database/strategies/mongo";
import "@shikor/core/database/strategies/sqlite";
import "@shikor/core/database/strategies/mock";
import { DatabaseStrategyFactory } from "@shikor/core/database";
import { resolveDatabaseStrategy } from "@shikor/core/database/utils/resolveStrategy";
import commandRouter from "@shikor/core/routes/commandRouter";
import authRouter from "@shikor/core/routes/authRouter";
import { AppError, ErrorType } from "@shikor/core/errors/AppError";
import { errorHandler } from "@shikor/core/middleware/errorHandler";

import "../../../packages/core/bootstrap";

const app = express();

app.use(helmet());
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use(httpLogger);

app.use("/api", commandRouter); // ✅ attaches to /api/command
app.use("/api/auth", authRouter); // 🔐 auth-related routes

app.use(((req, res, next) => {
  if (!req.app.locals.db) {
    req.log.error("Database connection not initialized");
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Database not initialized",
      status: "degraded",
    });
  }

  return next();
}) as express.RequestHandler);

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

app.use(errorHandler); // ⬅️ at the very end
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
      dbLogger.error(error, "Failed to register custom database engines");
    }
  }

  const engine = (process.env.DB_ENGINE || "mock") as
    | "mock"
    | "postgres"
    | "mongo"
    | "sqlite";

  const db = await resolveDatabaseStrategy(engine);
  return db;
}

if (cluster.isPrimary && env.isProd) {
  const numCPUs = Math.min(os.cpus().length, 8);
  logger.info(`Master ${process.pid} starting ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    logger.debug(`Worker ${worker.process.pid} started`);
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died (${signal || code})`);
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
      };

      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
      process.on("unhandledRejection", (reason) => {
        logger.error(reason, "Unhandled Rejection");
      });
      process.on("uncaughtException", (error) => {
        logger.error(error, "Uncaught Exception");
        shutdown();
      });
    } catch (err) {
      logger.error(err, "Failed to start server");
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
    logger.error(err, "Disk check failed");
    return { ok: false, freeGB: 0, totalGB: 0 };
  }
}
