import { PostgresStrategy } from "@shikor/core/database/strategies/postgres/PostgresStrategy";
import fs from "fs";
import path from "path";

async function runMigrations() {
  const db = new PostgresStrategy({
    host: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT!),
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DB!,
    ssl: process.env.POSTGRES_SSL === "true",
  });

  await db.ready;

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf-8");
    console.log(`⚙️ Running migration: ${file}`);
    await db.executeRaw(sql);
  }

  console.log("✅ All migrations completed");

  await db.disconnect();
}

runMigrations().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
