import type { Request, Response } from "express";
import { collectDefaultMetrics, register } from "prom-client";

collectDefaultMetrics();

export async function metricsHandler(req: Request, res: Response) {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}
