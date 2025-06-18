// src/core/utils/QueryLogger.ts
import { logger } from "@shikor/core/src/telemetry/logger";
export class QueryLogger {
  static logQuery(operation: string, collection: string, payload: any) {
    if (process.env.LOG_QUERIES === "true") {
      logger.debug(`\n🛠️  ${operation.toUpperCase()} → ${collection}`);
      logger.debug("📦 Payload:", payload);
    }
  }

  static logQueryWithOptions(
    operation: string,
    collection: string,
    query: any,
    options?: any
  ) {
    if (process.env.LOG_QUERIES === "true") {
      logger.debug(`\n🛠️  ${operation.toUpperCase()} → ${collection}`);
      logger.debug("📦 Query:", query);
      if (options) logger.debug("⚙️ Options:", options);
    }
  }

  static logKnexRaw(queryData: any) {
    if (process.env.LOG_QUERIES === "true") {
      logger.debug("🧩 Knex SQL:", queryData.sql);
      if (queryData.bindings?.length) {
        logger.debug("📦 Bindings:", queryData.bindings);
      }
    }
  }

  static logMongo(
    operation: string,
    collection: string,
    query: any,
    data?: any
  ) {
    if (process.env.LOG_QUERIES === "true") {
      logger.debug(`\n🍃 MongoDB ${operation.toUpperCase()} → ${collection}`);
      logger.debug("📦 Query:", query);
      if (data) logger.debug("📤 Data:", data);
    }
  }
}
