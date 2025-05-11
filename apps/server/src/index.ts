import express, { Request, Response, NextFunction } from "express";
import cluster from "cluster";
import os from "os";
import helmet from "helmet";
import { logger, dbLogger } from "@shikor/core/src/telemetry/logger";
import { httpLogger } from "@shikor/core/src/utils/httpLogger";
import { env } from "@shikor/core/src/config";
import { DatabaseStrategyFactory } from "@shikor/core/database";
import { getDatabaseConfig } from "@shikor/core/database/utils/getDatabaseConfig";
import { PostgresConfig, MockConfig } from "@shikor/core/database/types";

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

// ======================
// Routes
// ======================
app.get("/health", async (req: Request, res: Response) => {
  const db = req.app.locals.db;

  const checks = {
    database: db ? (await db.healthCheck()).ok : false,
    redis: true,
    diskSpace: checkDiskSpace(),
  };

  const isHealthy = Object.values(checks).every(Boolean);
  req.log.debug({ checks }, "Health check results");

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    checks,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/debug", (req: Request, res: Response) => {
  req.log.debug("Debug info requested");
  res.status(200).json({
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    requestId: req.id,
  });
});

app.get("/error", () => {
  throw new AppError("Intentional error", 400, {
    debugInfo: "Additional context",
    timestamp: Date.now(),
  });
});

app.get("/users", async (req: Request, res: Response) => {
  const db = req.app.locals.db;
  const users = await db.read("users", {});
  res.json(users);
});

app.post("/users", async (req: Request, res: Response) => {
  const db = req.app.locals.db;
  const newUser = await db.create("users", req.body);
  res.status(201).json(newUser);
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
        stack: err.stack,
      },
      err.message
    );
  } else if (err instanceof Error) {
    req.log.error({ stack: err.stack }, err.message);
  } else {
    req.log.error("Unknown error type: %o", err);
  }

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const response = {
    error: err instanceof Error ? err.message : "Internal Server Error",
    requestId: req.id,
    ...(env.isDev && { stack: err instanceof Error ? err.stack : undefined }),
  };

  res.status(statusCode).json(response);
});

// ======================
// Server Initialization
// ======================
const PORT = env.PORT || 3000;

if (cluster.isPrimary && env.isProd) {
  const numCPUs = os.cpus().length;
  logger.info(`Master ${process.pid} starting ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) cluster.fork();

  cluster.on("exit", (worker) => {
    logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  (async () => {
    try {
      DatabaseStrategyFactory.setLogger(dbLogger);

      if (process.env.ENABLE_BYODB === "true") {
        const registerCustomEngines = (
          await import("@shikor/dev/register-custom-dbs")
        ).default;
        registerCustomEngines();
      }

      const engine = (process.env.DB_ENGINE || "mock") as "mock" | "postgres";
      const config = getDatabaseConfig(engine);

      let db;

      if (engine === "mock") {
        db = await DatabaseStrategyFactory.create("mock", config as MockConfig);
      } else if (engine === "postgres") {
        db = await DatabaseStrategyFactory.create(
          "postgres",
          config as PostgresConfig
        );
      }

      app.locals.db = db;

      const server = app.listen(PORT, () => {
        logger.info(`Worker ${process.pid} started on port ${PORT}`);
      });

      process.on("SIGTERM", async () => {
        logger.info("SIGTERM received. Graceful shutdown started");

        await db.disconnect();
        dbLogger.info("Database disconnected");

        server.close(() => {
          logger.info("Server closed");
          process.exit(0);
        });
      });
    } catch (err) {
      logger.error(err, "Failed to start server");
      process.exit(1);
    }
  })();
}

// ======================
// Utility Functions
// ======================
function checkDiskSpace(): boolean {
  try {
    const disk = os.platform() === "win32" ? "c:" : "/";
    const stats = require("node:fs").statfsSync(disk);
    const freeGB = (stats.bfree * stats.bsize) / 1024 ** 3;
    return freeGB > 5;
  } catch (err) {
    logger.error(err, "Disk check failed");
    return false;
  }
}
