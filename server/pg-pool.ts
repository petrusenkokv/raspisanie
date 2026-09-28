import { Pool } from "pg";
import { getDatabaseUrl } from "./db-url";

let pool: Pool | null = null;

/** Single shared pool for sessions — limits connections on serverless. */
export function getPgPool(): Pool {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!pool) {
    const isDev = process.env.NODE_ENV === "development";
    pool = new Pool({
      connectionString: databaseUrl,
      max: isDev ? 3 : 1,
      idleTimeoutMillis: isDev ? 30_000 : 10_000,
      connectionTimeoutMillis: isDev ? 30_000 : 10_000,
    });
  }
  return pool;
}
