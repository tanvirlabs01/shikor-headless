import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresStrategy } from "../postgres/PostgresStrategy";

let db: PostgresStrategy;

beforeAll(async () => {
  db = new PostgresStrategy({
    host: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT!),
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DB!,
    ssl: process.env.POSTGRES_SSL === "true",
  });
  await db.connect();
  await db.executeRaw(
    "CREATE TABLE IF NOT EXISTS test_items (id SERIAL PRIMARY KEY, name TEXT)"
  );
});

afterAll(async () => {
  await db.executeRaw("DROP TABLE IF EXISTS test_items");
  await db.disconnect();
});

describe("PostgresStrategy", () => {
  it("creates a record", async () => {
    const item = await db.create("test_items", { name: "item1" });
    expect(item).toHaveProperty("id");
    expect(item.name).toBe("item1");
  });

  it("reads records", async () => {
    const items = await db.read("test_items", {});
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it("updates a record", async () => {
    const [item] = await db.read("test_items", {});
    const updated = await db.update(
      "test_items",
      { id: item.id },
      { name: "item1-updated" }
    );
    expect(updated.name).toBe("item1-updated");
  });

  it("deletes a record", async () => {
    const [item] = await db.read("test_items", {});
    const deleted = await db.delete("test_items", { id: item.id });
    expect(deleted.id).toBe(item.id);
    const afterDelete = await db.read("test_items", { id: item.id });
    expect(afterDelete.length).toBe(0);
  });

  it("runs health check", async () => {
    const health = await db.healthCheck();
    expect(health.ok).toBe(true);
    expect(typeof health.latency).toBe("number");
  });
});
