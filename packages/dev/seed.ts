import { PostgresStrategy } from "@shikor/core/database/strategies/postgres/PostgresStrategy";

async function runSeed() {
  const db = new PostgresStrategy({
    host: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT!),
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DB!,
    ssl: process.env.POSTGRES_SSL === "true",
  });

  await db.ready;

  await db.executeRaw(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL
    )
  `);

  await db.create("users", { name: "Alice", email: "alice@example.com" });
  await db.create("users", { name: "Bob", email: "bob@example.com" });

  console.log("✅ Seed data inserted");

  await db.disconnect();
}

runSeed().catch((err) => {
  console.error("❌ Seed script failed:", err);
  process.exit(1);
});
