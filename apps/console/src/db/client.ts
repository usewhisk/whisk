/**
 * Postgres connection singleton for the console app.
 *
 * Uses `postgres` (postgres.js) as the driver — smaller footprint
 * than `pg` and supports Neon / Supabase / local Docker out of the
 * box with the same `postgresql://` URL. Drizzle wraps it for
 * type-safe query building.
 *
 * The client is stashed on `globalThis` in dev so hot-reload doesn't
 * exhaust the pool. In prod we get one instance per process, which
 * is what we want.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Set it in .env.local (see .env.example).",
  );
}

type GlobalWithDb = typeof globalThis & {
  __whiskConsoleDb?: ReturnType<typeof drizzle<typeof schema>>;
  __whiskConsoleSql?: ReturnType<typeof postgres>;
};

const g = globalThis as GlobalWithDb;

const sql = g.__whiskConsoleSql ?? postgres(DATABASE_URL, { max: 10 });
if (process.env["NODE_ENV"] !== "production") {
  g.__whiskConsoleSql = sql;
}

export const db =
  g.__whiskConsoleDb ?? drizzle(sql, { schema, casing: "snake_case" });
if (process.env["NODE_ENV"] !== "production") {
  g.__whiskConsoleDb = db;
}

export { schema };
