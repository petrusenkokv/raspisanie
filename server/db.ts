import { drizzle } from "drizzle-orm/node-postgres";
import { getPgPool } from "./pg-pool";
import { getDatabaseUrl } from "./db-url";
import * as schema from "@shared/schema";

if (!getDatabaseUrl()) {
  throw new Error("DATABASE_URL is not set");
}

const pool = getPgPool();

// Apply schema migrations automatically
async function applyMigrations() {
  const client = await pool.connect();
  try {
    // Add effective_start_date column to membership_payments if not exists
    await client.query(`
      ALTER TABLE membership_payments ADD COLUMN IF NOT EXISTS effective_start_date TEXT;
    `);
    console.log("[db] Migrations applied successfully");
  } catch (error: any) {
    console.error("[db] Migration failed:", error?.message || error);
    // Don't throw — allow app to continue even if migration fails
  } finally {
    client.release();
  }
}

// Run migrations before creating drizzle instance
applyMigrations().catch(console.error);

export const db = drizzle(pool, { schema });
export type DB = typeof db;
