import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Works from either the app directory or a monorepo package script.
const localEnvironment = fileURLToPath(new URL("../../../.env.local", import.meta.url));
if (existsSync(localEnvironment)) loadEnvFile(localEnvironment);
const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));
const migrationLock = 1_947_210_113;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to run migrations.");
  const parsed = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.pathname.length < 2) {
    throw new Error("DATABASE_URL must identify a PostgreSQL database.");
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 300_000,
    application_name: "rainier-raiders-migrator",
  });
  try {
    const client = await pool.connect();
    try {
      // Every migration process uses one session and one lock. Application replicas
      // never run migrations as part of their startup.
      await client.query("SELECT pg_advisory_lock($1)", [migrationLock]);
      await migrate(drizzle(client), { migrationsFolder });
      console.info("Database migrations are up to date.");
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [migrationLock]);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  // Connection strings and SQL parameter values must not reach deployment logs.
  const code = typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? ` (${error.code})` : "";
  console.error(`Database migration failed${code}. Check DATABASE_URL and the migration files.`);
  process.exitCode = 1;
});
