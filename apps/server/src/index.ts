import express, { Request, Response, NextFunction } from "express";
import cluster from "cluster";
import os from "os";
import helmet from "helmet";
import { logger } from "@shikor/core/telemetry/logger";
import { httpLogger } from "@shikor/core/utils/httpLogger";
import { env } from "@shikor/core/config";

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
  const checks = {
    database: true, // Replace with actual check
    redis: true, // Replace with actual check
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
  const server = app.listen(PORT, () => {
    logger.info(`Worker ${process.pid} started on port ${PORT}`);
  });

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received. Graceful shutdown started");
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  });
}

// ======================
// Utility Functions
// ======================
function checkDiskSpace(): boolean {
  try {
    const disk = os.platform() === "win32" ? "c:" : "/";
    const stats = require("node:fs").statfsSync(disk);
    const freeGB = (stats.bfree * stats.bsize) / 1024 ** 3;
    return freeGB > 5; // At least 5GB free
  } catch (err) {
    logger.error(err, "Disk check failed");
    return false;
  }
}
