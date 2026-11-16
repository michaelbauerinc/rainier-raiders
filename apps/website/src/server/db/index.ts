import "server-only";

import { assertFullWebsite } from "@/server/website-mode";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as authSchema from "./auth-schema";
import * as appSchema from "./app-schema";

export const schema = { ...authSchema, ...appSchema };

function createDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
type DatabaseState = { url: string; pool: Pool; database: Database };
const globalDatabase = globalThis as typeof globalThis & { rainierDatabase?: DatabaseState };

export function isDatabaseConfigured() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return ["postgres:", "postgresql:"].includes(url.protocol)
      && Boolean(url.hostname) && url.pathname.length > 1;
  } catch {
    return false;
  }
}

export function getDb(): Database {
  assertFullWebsite();
  if (!isDatabaseConfigured()) throw new Error("The database is not configured.");
  const url = process.env.DATABASE_URL!;
  if (globalDatabase.rainierDatabase) {
    if (globalDatabase.rainierDatabase.url !== url) {
      throw new Error("Database configuration changed. Restart the application.");
    }
    return globalDatabase.rainierDatabase.database;
  }
  const maximum = Number(process.env.DB_POOL_MAX ?? "5");
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 20) {
    throw new Error("DB_POOL_MAX must be an integer between 1 and 20.");
  }
  const pool = new Pool({
    connectionString: url,
    max: maximum,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    application_name: "rainier-raiders-website",
  });
  pool.on("error", () => console.error("An idle database connection failed."));
  const database = createDatabase(pool);
  globalDatabase.rainierDatabase = { url, pool, database };
  return database;
}

export async function closeDb() {
  const state = globalDatabase.rainierDatabase;
  delete globalDatabase.rainierDatabase;
  await state?.pool.end();
}
